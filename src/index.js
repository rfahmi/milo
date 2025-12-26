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
const path = require('path');
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
const t = require('./translations');

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
            content: t.commands.start.alreadyActive(active.id)
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
          content: t.commands.start.success(id)
        }
      });
    }
    if (name === 'end') {
      const active = await getActiveCheckpoint(conn, channelId);
      if (!active) {
        return res.json({
          type: 4,
          data: { content: t.commands.end.noCheckpoint() }
        });
      }
      const currentMessageId = interaction.id;
      await closeCheckpoint(conn, active.id, currentMessageId);
      // Get detailed receipts and summary
      const receipts = await getReceiptsForCheckpoint(conn, active.id);
      const summary = await summarizeCheckpoint(conn, active.id);
      let msg;
      if (!summary || summary.length === 0) {
        msg = t.commands.end.noReceipts(active.id);
      } else {
        const lines = [];
        let grand = 0;
        lines.push(t.summary.receiptBreakdown);
        receipts.forEach((receipt, idx) => {
          const num = idx + 1;
          const amt = Number(receipt.amount).toLocaleString('id-ID');
          lines.push(t.summary.receiptLine(num, receipt.user_name, amt));
        });
        lines.push('\n' + t.summary.userTotals);
        summary.forEach(row => {
          grand += Number(row.total);
          const total = Number(row.total).toLocaleString('id-ID');
          lines.push(t.summary.userLine(row.user_name, total));
        });
        msg = t.commands.end.success(active.id, lines.join('\n'), grand.toLocaleString('id-ID'));
      }
      return res.json({ type: 4, data: { content: msg } });
    }
    if (name === 'status') {
      const active = await getActiveCheckpoint(conn, channelId);
      if (!active) {
        return res.json({
          type: 4,
          data: { content: t.commands.status.noCheckpoint() }
        });
      }
      const receipts = await getReceiptsForCheckpoint(conn, active.id);
      const summary = await summarizeCheckpoint(conn, active.id);
      let msg;
      if (!summary || summary.length === 0) {
        msg = t.commands.status.noReceipts(active.id);
      } else {
        const lines = [];
        let grand = 0;
        lines.push(t.summary.receiptBreakdown);
        receipts.forEach((receipt, idx) => {
          const num = idx + 1;
          const amt = Number(receipt.amount).toLocaleString('id-ID');
          lines.push(t.summary.receiptLine(num, receipt.user_name, amt));
        });
        lines.push('\n' + t.summary.userTotals);
        summary.forEach(row => {
          grand += Number(row.total);
          const total = Number(row.total).toLocaleString('id-ID');
          lines.push(t.summary.userLine(row.user_name, total));
        });
        msg = t.commands.status.running(active.id, lines.join('\n'), grand.toLocaleString('id-ID'));
      }
      return res.json({ type: 4, data: { content: msg } });
    }
    if (name === 'undo') {
      const latest = await getLatestCheckpoint(conn, channelId);
      if (!latest) {
        return res.json({
          type: 4,
          data: { content: t.commands.undo.noCheckpoint() }
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
        data: { content: t.commands.undo.success(latest.id) }
      });
    }
    // Unknown command
    return res.json({
      type: 4,
      data: { content: t.commands.unknown() }
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

app.get('/download-db', (req, res) => {
  // Determine path similar to helpers.js
  let dbPath = process.env.DB_PATH;
  if (!dbPath) {
    const fs = require('fs');
    if (fs.existsSync('/data/receipts.db')) {
      dbPath = '/data/receipts.db';
    } else {
      dbPath = '/usr/src/app/data/receipts.db';
    }
  }

  const resolvedPath = path.isAbsolute(dbPath)
    ? dbPath
    : path.join(__dirname, '..', dbPath);

  res.download(resolvedPath, 'receipts.db', (err) => {
    if (err) {
      console.error('Error downloading DB:', err);
      if (!res.headersSent) {
        res.status(500).send('Error downloading file: ' + err.message);
      }
    }
  });
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
