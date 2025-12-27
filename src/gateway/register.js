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

        // The put method is used to fully refresh all commands in the guild with the current set
        // Note: Implicitly registers global commands if GuildId is not specified, but usually strictly better to use applicationCommands(clientId) for global
        // or applicationGuildCommands(clientId, guildId) for guild specific.
        // The previous code didn't specify guild ID so likely global.

        await rest.put(
            Routes.applicationCommands(config.discord.applicationId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
}

module.exports = registerCommands;

if (require.main === module) {
    registerCommands();
}
