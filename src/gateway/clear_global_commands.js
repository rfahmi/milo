/**
 * One-time script: clears all globally registered slash commands.
 * Run this once if commands appear duplicated (guild + global both registered).
 *
 *   node src/gateway/clear_global_commands.js
 */
const { REST, Routes } = require('discord.js');
const config = require('../config');

async function clearGlobalCommands() {
    const rest = new REST().setToken(config.discord.token);

    console.log('Wiping all global (/) commands...');
    await rest.put(
        Routes.applicationCommands(config.discord.applicationId),
        { body: [] },
    );
    console.log('Done. Global commands cleared. Guild commands are unaffected.');
}

clearGlobalCommands().catch(console.error);
