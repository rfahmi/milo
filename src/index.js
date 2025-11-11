// Milo - Discord interactions HTTP server (Node.js version)
//
// This Express application listens for slash command interactions from
// Discord, verifies the signature using the bot's public key and
// delegates commands to helper functions. It faithfully reproduces
// the behaviour of the original PHP endpoint while using promises
// and modern JavaScript syntax.

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
            content: `Yo! Checkpoint **#${active.id}** is still running. Hit /end first to wrap it up!`
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
          content: `Checkpoint **#${id}** is live! Drop those receipts and I'll track 'em all`
        }
      });
    }
    if (name === 'end') {
      const active = await getActiveCheckpoint(conn, channelId);
      if (!active) {
        return res.json({
          type: 4,
          data: { content: 'No checkpoint running yet! Use /start to kick things off.' }
        });
      }
      const currentMessageId = interaction.id;
      await closeCheckpoint(conn, active.id, currentMessageId);
      // Get detailed receipts and summary
      const receipts = await getReceiptsForCheckpoint(conn, active.id);
      const summary = await summarizeCheckpoint(conn, active.id);
      let msg;
      if (!summary || summary.length === 0) {
        msg = `Checkpoint **#${active.id}** closed.\nNo receipts? Y'all must've eaten air!`;
      } else {
        const lines = [];
        let grand = 0;
        lines.push('**Receipt Breakdown:**');
        receipts.forEach((receipt, idx) => {
          const num = idx + 1;
          const amt = Number(receipt.amount).toLocaleString('id-ID');
          lines.push(`${num}. ${receipt.user_name}: Rp${amt}`);
        });
        lines.push('\n**Who Spent What:**');
        summary.forEach(row => {
          grand += Number(row.total);
          lines.push(`- **${row.user_name}**: Rp${Number(row.total).toLocaleString('id-ID')}`);
        });
        msg = `Checkpoint **#${active.id}** closed!\n` + lines.join('\n') + `\n\n**Grand Total**: Rp${grand.toLocaleString('id-ID')}`;
      }
      return res.json({ type: 4, data: { content: msg } });
    }
    if (name === 'status') {
      const active = await getActiveCheckpoint(conn, channelId);
      if (!active) {
        return res.json({
          type: 4,
          data: { content: 'No checkpoint running yet! Use /start to kick things off.' }
        });
      }
      const receipts = await getReceiptsForCheckpoint(conn, active.id);
      const summary = await summarizeCheckpoint(conn, active.id);
      let msg;
      if (!summary || summary.length === 0) {
        msg = `Checkpoint **#${active.id}** (still running)\nNo receipts yet. Time to go shopping?`;
      } else {
        const lines = [];
        let grand = 0;
        lines.push('**Receipt Breakdown:**');
        receipts.forEach((receipt, idx) => {
          const num = idx + 1;
          const amt = Number(receipt.amount).toLocaleString('id-ID');
          lines.push(`${num}. ${receipt.user_name}: Rp${amt}`);
        });
        lines.push('\n**Who Spent What:**');
        summary.forEach(row => {
          grand += Number(row.total);
          lines.push(`- **${row.user_name}**: Rp${Number(row.total).toLocaleString('id-ID')}`);
        });
        msg = `Checkpoint **#${active.id}** (still running)\n` + lines.join('\n') + `\n\n**Running Total**: Rp${grand.toLocaleString('id-ID')}`;
      }
      return res.json({ type: 4, data: { content: msg } });
    }
    if (name === 'undo') {
      const latest = await getLatestCheckpoint(conn, channelId);
      if (!latest) {
        return res.json({
          type: 4,
          data: { content: 'Nothing to undo here, chief!' }
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
        data: { content: `Checkpoint **#${latest.id}** undone. Like it never happened!` }
      });
    }
    // Unknown command
    return res.json({
      type: 4,
      data: { content: "Hmm, I don't know that command..." }
    });
  } catch (err) {
    console.error('Error processing command', err);
    return res.status(500).send('Internal Server Error');
  }
});

// Endpoint to manually trigger message processing (optional)
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

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`Milo Node server listening on port ${PORT}`);
  
  // Start Discord Gateway for real-time message processing
  console.log('Starting Discord Gateway...');
  startGateway();
});