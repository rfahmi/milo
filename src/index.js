// Milo - Discord interactions HTTP server (Node.js version)
//
// This Express application listens for slash command interactions from
// Discord, verifies the signature using the bot's public key and
// delegates commands to helper functions. It faithfully reproduces
// the behaviour of the original PHP endpoint while using promises
// and modern JavaScript syntax.
process.env.UNDICI_NO_WASM = '1';        // paksa Undici tanpa WASM
process.env.NODE_OPTIONS = process.env.NODE_OPTIONS || '--max-old-space-size=256';

const express = require('express');
const {
  verifyDiscordRequest,
  getDB,
  getActiveCheckpoint,
  createCheckpoint,
  closeCheckpoint,
  summarizeCheckpoint,
  getLatestCheckpoint,
  getReceiptsForCheckpoint,
  getChannelState,
  setChannelLastMessage,
  isPostgres,
  fetchAll,
  run,
  processNewMessages
} = require('./helpers');
const { startGateway } = require('./gateway');
const { registerCommands } = require('../register_commands');

// Load environment variables early
require('dotenv').config();

const app = express();

// Capture the raw body so we can verify the Discord signature. The
// verify option attaches the raw buffer to req.rawBody.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  })
);

app.post('/discord_interactions', async (req, res) => {
  // Check signature before parsing body
  if (!verifyDiscordRequest(req)) {
    return res.status(401).send('invalid request');
  }
  const interaction = req.body;
  const type = interaction.type;
  // PING → PONG handshake
  if (type === 1) {
    return res.json({ type: 1 });
  }
  // Only application commands are handled
  if (type !== 2) {
    return res.status(400).send('bad request');
  }
  const name = interaction.data?.name;
  const channelId = interaction.channel_id || process.env.DISCORD_CHANNEL_ID;
  const conn = await getDB();
  try {
    if (name === 'start') {
      const active = await getActiveCheckpoint(conn, channelId);
      if (active) {
        return res.json({
          type: 4,
          data: {
            content: `Heh, checkpoint **#${active.id}** masih jalan tau. Pake /end dulu sana kalo mau beres-beres!`
          }
        });
      }
      const currentMessageId = interaction.id;
      const id = await createCheckpoint(conn, channelId, currentMessageId);
      // Initialise channel_state if empty
      const state = await getChannelState(conn, channelId);
      if (!state) {
        await setChannelLastMessage(conn, channelId, currentMessageId);
      }
      return res.json({
        type: 4,
        data: {
          content: `Ya udah, gue catat ya. Checkpoint **#${id}** dimulai! Kirim aja tuh struk belanjaan kalian...`
        }
      });
    }
    if (name === 'end') {
      const active = await getActiveCheckpoint(conn, channelId);
      if (!active) {
        return res.json({
          type: 4,
          data: { content: 'Lah, belum ada checkpoint yang jalan. Pake /start dulu dong kalo mau mulai!' }
        });
      }
      const currentMessageId = interaction.id;
      await closeCheckpoint(conn, active.id, currentMessageId);
      // Get detailed receipts and summary
      const receipts = await getReceiptsForCheckpoint(conn, active.id);
      const summary = await summarizeCheckpoint(conn, active.id);
      let msg;
      if (!summary || summary.length === 0) {
        msg = `Checkpoint **#${active.id}** udah gue tutup.\nGak ada struk sama sekali? Makan angin aja nih kalian...`;
      } else {
        const lines = [];
        let grand = 0;
        lines.push('**Rincian Struk:**');
        receipts.forEach((receipt, idx) => {
          const num = idx + 1;
          const amt = Number(receipt.amount).toLocaleString('id-ID');
          lines.push(`${num}. ${receipt.user_name}: Rp${amt}`);
        });
        lines.push('\n**Siapa Ngabisin Berapa:**');
        summary.forEach(row => {
          grand += Number(row.total);
          lines.push(`- **${row.user_name}**: Rp${Number(row.total).toLocaleString('id-ID')}`);
        });
        msg = `Oke, checkpoint **#${active.id}** gue tutup ya!\n` + lines.join('\n') + `\n\n**Total Keseluruhan**: Rp${grand.toLocaleString('id-ID')}`;
      }
      return res.json({ type: 4, data: { content: msg } });
    }
    if (name === 'status') {
      const active = await getActiveCheckpoint(conn, channelId);
      if (!active) {
        return res.json({
          type: 4,
          data: { content: 'Belum ada checkpoint yang jalan. Pake /start dulu lah kalo mau mulai!' }
        });
      }
      const receipts = await getReceiptsForCheckpoint(conn, active.id);
      const summary = await summarizeCheckpoint(conn, active.id);
      let msg;
      if (!summary || summary.length === 0) {
        msg = `Checkpoint **#${active.id}** (masih jalan)\nBelum ada struk nih. Belanja dong sono!`;
      } else {
        const lines = [];
        let grand = 0;
        lines.push('**Rincian Struk:**');
        receipts.forEach((receipt, idx) => {
          const num = idx + 1;
          const amt = Number(receipt.amount).toLocaleString('id-ID');
          lines.push(`${num}. ${receipt.user_name}: Rp${amt}`);
        });
        lines.push('\n**Siapa Ngabisin Berapa:**');
        summary.forEach(row => {
          grand += Number(row.total);
          lines.push(`- **${row.user_name}**: Rp${Number(row.total).toLocaleString('id-ID')}`);
        });
        msg = `Checkpoint **#${active.id}** (masih jalan)\n` + lines.join('\n') + `\n\n**Total Sementara**: Rp${grand.toLocaleString('id-ID')}`;
      }
      return res.json({ type: 4, data: { content: msg } });
    }
    if (name === 'undo') {
      const latest = await getLatestCheckpoint(conn, channelId);
      if (!latest) {
        return res.json({
          type: 4,
          data: { content: 'Nggak ada yang bisa di-undo nih. Emang belum ada apa-apa.' }
        });
      }
      // Delete receipts and checkpoint within a transaction
      if (isPostgres(conn)) {
        await conn.client.query('BEGIN');
        await conn.client.query('DELETE FROM receipts WHERE checkpoint_id = $1', [latest.id]);
        await conn.client.query('DELETE FROM checkpoints WHERE id = $1', [latest.id]);
        await conn.client.query('COMMIT');
      } else {
        // SQLite transaction
        await run(conn, 'BEGIN TRANSACTION', []);
        await run(conn, 'DELETE FROM receipts WHERE checkpoint_id = ?', [latest.id]);
        await run(conn, 'DELETE FROM checkpoints WHERE id = ?', [latest.id]);
        await run(conn, 'COMMIT', []);
      }
      return res.json({
        type: 4,
        data: { content: `Yasudah, checkpoint **#${latest.id}** udah gue hapus. Anggep aja nggak pernah ada deh!` }
      });
    }
    // Unknown command
    return res.json({
      type: 4,
      data: { content: 'Hah? Gue nggak ngerti perintah itu. Coba yang lain deh...' }
    });
  } catch (err) {
    console.error('Error processing command', err);
    return res.status(500).send('Internal Server Error');
  }
});

// Endpoint to manually trigger message processing (optional)
// Health check endpoint for monitoring and keep-alive
app.get('/health', async (req, res) => {
  try {
    const conn = await getDB();
    const gatewayClient = require('./gateway').getClient();
    
    const status = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      gateway: gatewayClient ? 'connected' : 'disconnected',
      database: conn.type
    };
    
    return res.json(status);
  } catch (err) {
    return res.status(500).json({ 
      status: 'error', 
      error: err.message 
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    name: 'Milo Discord Bot',
    status: 'running',
    message: 'Discord receipt tracking bot is alive!'
  });
});

app.post('/process-messages', async (req, res) => {
  try {
    const channelId = process.env.DISCORD_CHANNEL_ID;
    if (!channelId) {
      return res.status(500).json({ error: 'DISCORD_CHANNEL_ID is not set' });
    }
    
    const conn = await getDB();
    const result = await processNewMessages(conn, channelId);
    
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }
    
    return res.json({
      success: true,
      processed: result.processed || 0,
      last_message_id: result.last_message_id || 'none'
    });
  } catch (err) {
    console.error('Error processing messages:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Milo Node server listening on port ${PORT}`);
  
  // Register/update Discord commands on startup
  console.log('\n📋 Registering Discord commands...');
  try {
    const applicationId = process.env.DISCORD_APPLICATION_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    
    if (applicationId && botToken) {
      await registerCommands(applicationId, botToken);
    } else {
      console.log('⚠️  Skipping command registration: DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN not set');
    }
  } catch (err) {
    console.error('❌ Failed to register commands:', err.message);
    console.log('⚠️  Server will continue, but slash commands may not work properly');
  }
  
  // Start Discord Gateway for real-time message processing
  console.log('\n🌐 Starting Discord Gateway...');
  startGateway();
});
