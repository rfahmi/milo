const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const receiptService = require('../services/ReceiptService');

class DiscordClient {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });
        this.commands = new Collection();
    }

    loadCommands() {
        const commandsPath = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                this.commands.set(command.data.name, command);
            } else {
                console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }

    setupEvents() {
        this.client.once(Events.ClientReady, c => {
            console.log(`Ready! Logged in as ${c.user.tag}`);
        });

        this.client.on(Events.InteractionCreate, async interaction => {
            if (!interaction.isChatInputCommand()) return;

            // Enforce Channel Restriction if configured
            if (config.discord.channelId && interaction.channelId !== config.discord.channelId) {
                return interaction.reply({
                    content: `⚠️ Bot ini hanya aktif di <#${config.discord.channelId}>.`,
                    ephemeral: true
                });
            }

            const command = this.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                }
            }
        });

        this.client.on(Events.MessageCreate, async message => {
            if (message.author.bot) return;
            if (message.channelId !== config.discord.channelId) return;
            if (message.attachments.size === 0) return;

            for (const [, attachment] of message.attachments) {
                if (!attachment.contentType?.startsWith('image/')) continue;

                try {
                    const result = await receiptService.processAttachment(attachment, message, message.channelId);
                    if (result) {
                        if (typeof result === 'string') {
                            await message.channel.send(result);
                        } else if (result.reference) {
                            await message.reply(result.reply);
                        }
                    }
                } catch (error) {
                    console.error('Error processing attachment:', error);
                }
            }
        });
    }

    async login() {
        this.loadCommands();
        this.setupEvents();
        await this.client.login(config.discord.token);
    }
}

module.exports = new DiscordClient();
