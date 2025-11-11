// Milo - register Discord slash commands (Node.js version)
//
// This script registers the four slash commands used by the bot. It
// expects DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN to be set in
// the environment. Run it once after setting up your bot to make
// commands available in your server.

require('dotenv').config();
const fetch = require('node-fetch');

const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!applicationId || !botToken) {
  console.error('Error: DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN must be set');
  process.exit(1);
}

const commands = [
  {
    name: 'start',
    description: 'Start a new checkpoint to track receipts',
    type: 1
  },
  {
    name: 'end',
    description: 'Close the active checkpoint and show summary',
    type: 1
  },
  {
    name: 'status',
    description: 'Check current checkpoint total without closing it',
    type: 1
  },
  {
    name: 'undo',
    description: 'Undo the latest checkpoint',
    type: 1
  }
];

const url = `https://discord.com/api/v10/applications/${applicationId}/commands`;

(async () => {
  for (const command of commands) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${botToken}`
        },
        body: JSON.stringify(command)
      });
      if (resp.ok) {
        console.log(`✅ Registered command: /${command.name}`);
      } else {
        const text = await resp.text();
        console.log(`❌ Failed to register /${command.name}: ${text}`);
      }
    } catch (err) {
      console.error(`Error registering /${command.name}:`, err);
    }
  }
  console.log('\nDone! Commands registered.');
})();