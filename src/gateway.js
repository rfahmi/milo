// Milo - Discord Gateway client for real-time message processing
//
// This module connects to Discord via WebSocket Gateway to receive
// MESSAGE_CREATE events in real-time, replacing the cron-based polling
// approach. It processes receipt images immediately when posted.

const { Client, GatewayIntentBits } = require('discord.js');
const { 
  getDB, 
  getActiveCheckpoint, 
  getTotalFromReceiptGemini,
  generateSassyComment,
  addReceipt 
} = require('./helpers');

let client = null;

/**
 * Process a single message for receipt images
 * @param {object} message - Discord.js message object
 */
async function processSingleMessage(message) {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  
  // Only process messages in the configured channel
  if (message.channelId !== channelId) {
    return;
  }

  // Skip bot messages
  if (message.author.bot) {
    return;
  }

  // Check if there are attachments
  if (message.attachments.size === 0) {
    return;
  }

  const conn = await getDB();
  
  // Check if a checkpoint is running
  const active = await getActiveCheckpoint(conn, channelId);
  if (!active) {
    return;
  }

  // Process each image attachment
  for (const [, attachment] of message.attachments) {
    const contentType = attachment.contentType || '';
    const imageUrl = attachment.url;
    
    if (!imageUrl) continue;
    if (contentType && !contentType.startsWith('image/')) continue;

    try {
      console.log(`Processing receipt from ${message.author.username}: ${imageUrl}`);
      
      const amount = await getTotalFromReceiptGemini(imageUrl);
      const receiptId = await addReceipt(conn, {
        user_id: message.author.id,
        user_name: message.author.username,
        channel_id: channelId,
        checkpoint_id: active.id,
        message_id: message.id,
        image_url: imageUrl,
        amount: amount,
        created_at: new Date().toISOString()
      });

      if (receiptId) {
        // Acknowledge in channel
        const ack = `Oke, udah gue catat nih (checkpoint #${active.id}) #${receiptId}: **${message.author.username}** Rp${amount.toLocaleString('id-ID')}`;
        await message.channel.send(ack);
        console.log(`Receipt #${receiptId} processed: Rp${amount}`);
      }
    } catch (e) {
      // Image is not a valid receipt, generate a sassy comment
      console.log(`Not a receipt (${imageUrl}): ${e.message}`);
      try {
        const sassyComment = await generateSassyComment(imageUrl);
        await message.reply(sassyComment);
      } catch (sendErr) {
        console.error('Failed to send sassy comment:', sendErr);
      }
    }
  }
}

/**
 * Initialize and start the Discord Gateway client
 */
function startGateway() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  
  if (!botToken) {
    console.error('DISCORD_BOT_TOKEN is not set. Gateway client will not start.');
    return null;
  }

  if (client) {
    console.log('Gateway client already running');
    return client;
  }

  // Create client with necessary intents
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.once('ready', () => {
    console.log(`Discord Gateway connected as ${client.user.tag}`);
    console.log(`Watching channel: ${process.env.DISCORD_CHANNEL_ID}`);
  });

  client.on('messageCreate', async (message) => {
    try {
      await processSingleMessage(message);
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  client.on('error', (error) => {
    console.error('Discord Gateway error:', error);
  });

  client.on('disconnect', () => {
    console.log('Discord Gateway disconnected');
  });

  // Login to Discord
  client.login(botToken).catch(err => {
    console.error('Failed to login to Discord Gateway:', err);
    client = null;
  });

  return client;
}

/**
 * Stop the Gateway client
 */
function stopGateway() {
  if (client) {
    client.destroy();
    client = null;
    console.log('Discord Gateway client stopped');
  }
}

/**
 * Get the current client instance
 */
function getClient() {
  return client;
}

module.exports = {
  startGateway,
  stopGateway,
  getClient,
  processSingleMessage
};
