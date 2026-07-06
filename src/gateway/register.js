const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function registerCommands() {
    const commands = [];
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.warn(`[WARNING] The command at ${path.join(commandsPath, file)} is missing a required "data" or "execute" property.`);
        }
    }

    const rest = new REST().setToken(config.discord.token);

    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const guildId = config.discord.guildId;

        if (guildId) {
            // Guild commands propagate instantly — preferred for single-server bots.
            await rest.put(
                Routes.applicationGuildCommands(config.discord.applicationId, guildId),
                { body: commands },
            );
            console.log(`Successfully reloaded ${commands.length} guild (/) commands for guild ${guildId}.`);
        } else {
            // Fallback: global commands (up to 1 hour propagation delay).
            await rest.put(
                Routes.applicationCommands(config.discord.applicationId),
                { body: commands },
            );
            console.log(`Successfully reloaded ${commands.length} global (/) commands.`);
        }
    } catch (error) {
        console.error(error);
    }
}

module.exports = registerCommands;

if (require.main === module) {
    registerCommands();
}
