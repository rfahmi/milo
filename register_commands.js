// Milo - register Discord slash commands (Node.js version)
//
// This script registers the four slash commands used by the bot. It
// expects DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN to be set in
// the environment. Run it once after setting up your bot to make
// commands available in your server.

require('dotenv').config();
const fetch = require('node-fetch');

const COMMANDS = [
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

// List of command names to delete before registering (if bulk delete is not available)
const COMMANDS_TO_DELETE = ['start', 'end', 'status', 'undo'];

/**
 * Delete all existing commands for the application
 * @param {string} applicationId - Discord application ID
 * @param {string} botToken - Discord bot token
 * @returns {Promise<number>} Number of commands deleted
 */
async function deleteAllCommands(applicationId, botToken) {
  const url = `https://discord.com/api/v10/applications/${applicationId}/commands`;
  
  try {
    // Get all existing commands
    const getResp = await fetch(url, {
      headers: {
        Authorization: `Bot ${botToken}`
      }
    });
    
    if (!getResp.ok) {
      console.log('⚠️  Could not fetch existing commands');
      return 0;
    }
    
    const existingCommands = await getResp.json();
    
    if (!Array.isArray(existingCommands) || existingCommands.length === 0) {
      console.log('ℹ️  No existing commands to delete');
      return 0;
    }
    
    console.log(`🗑️  Deleting ${existingCommands.length} existing command(s)...`);
    
    // Try bulk delete first (overwrites with empty array)
    const bulkResp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${botToken}`
      },
      body: JSON.stringify([])
    });
    
    if (bulkResp.ok) {
      console.log('✅ Successfully deleted all commands (bulk delete)');
      return existingCommands.length;
    }
    
    // If bulk delete fails, delete one by one
    console.log('ℹ️  Bulk delete not supported, deleting individually...');
    let deletedCount = 0;
    
    for (const cmd of existingCommands) {
      try {
        const deleteResp = await fetch(`${url}/${cmd.id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bot ${botToken}`
          }
        });
        
        if (deleteResp.ok || deleteResp.status === 404) {
          console.log(`  ✅ Deleted: /${cmd.name}`);
          deletedCount++;
        } else {
          console.log(`  ❌ Failed to delete /${cmd.name}`);
        }
      } catch (err) {
        console.error(`  Error deleting /${cmd.name}:`, err.message);
      }
    }
    
    return deletedCount;
  } catch (err) {
    console.error('Error during command cleanup:', err.message);
    return 0;
  }
}

/**
 * Register all commands for the application
 * @param {string} applicationId - Discord application ID
 * @param {string} botToken - Discord bot token
 * @returns {Promise<boolean>} Success status
 */
async function registerCommands(applicationId, botToken) {
  if (!applicationId || !botToken) {
    console.error('Error: DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN must be set');
    return false;
  }
  
  console.log('🔄 Starting command registration...\n');
  
  // Delete existing commands first
  await deleteAllCommands(applicationId, botToken);
  
  console.log('\n📝 Registering new commands...');
  
  const url = `https://discord.com/api/v10/applications/${applicationId}/commands`;
  let successCount = 0;
  
  for (const command of COMMANDS) {
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
        console.log(`  ✅ Registered command: /${command.name}`);
        successCount++;
      } else {
        const text = await resp.text();
        console.log(`  ❌ Failed to register /${command.name}: ${text}`);
      }
    } catch (err) {
      console.error(`  Error registering /${command.name}:`, err.message);
    }
  }
  
  console.log(`\n✨ Done! ${successCount}/${COMMANDS.length} commands registered successfully.`);
  return successCount === COMMANDS.length;
}

// If run directly (not imported as module)
if (require.main === module) {
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  
  registerCommands(applicationId, botToken)
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { registerCommands, COMMANDS, COMMANDS_TO_DELETE };