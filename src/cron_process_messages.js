// Milo - cron script for Node.js version
//
// This script polls a Discord channel for new messages and records any
// receipts found within an active checkpoint. It mirrors the logic
// from the PHP cron_process_messages.php. Invoke this script from a
// system cron or via `npm run cron`.

require('dotenv').config();
const { getDB, processNewMessages } = require('./helpers');

(async () => {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!channelId) {
    console.error('DISCORD_CHANNEL_ID is not set.');
    process.exit(1);
  }
  if (!botToken) {
    console.error('DISCORD_BOT_TOKEN is not set.');
    process.exit(1);
  }
  const conn = await getDB();
  try {
    const result = await processNewMessages(conn, channelId);
    if (result.error) {
      console.error(result.error);
    } else {
      const count = result.processed || 0;
      console.log(`Done. Processed ${count} new message(s). Last message processed: ${result.last_message_id || 'none'}`);
    }
  } catch (err) {
    console.error('Error processing messages:', err);
    process.exit(1);
  }
})();