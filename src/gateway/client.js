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
            // console.log(interaction);
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
            // Log every message in the channel (or attempt to) to see if we get events
            console.log(`[DEBUG] Message received from ${message.member.displayName} in ${message.channelId}`);

            if (message.author.bot) return;

            // Check channel ID mismatch with logging
            if (config.discord.channelId && message.channelId !== config.discord.channelId) {
                // console.log(`[DEBUG] Ignoring message from channel ${message.channelId} (Expected: ${config.discord.channelId})`);
                return;
            }

            if (message.attachments.size === 0) {
                try {
                    // Fetch history (limit 11 to get last 10 previous messages + current)
                    const history = await message.channel.messages.fetch({ limit: 11 });

                    // Convert Collection to Array, reverse to chronological, filter out current & bots
                    const historyArray = Array.from(history.values())
                        .reverse()
                        .filter(m => m.id !== message.id && !m.author.bot);

                    const response = await receiptService.processText(message, message.channelId, historyArray);

                    if (response) {
                        await message.reply(response);
                    }
                } catch (error) {
                    console.error('[DEBUG] Error processing text:', error);
                }
                return;
            }

            // console.log(`[DEBUG] Processing potential receipt from ${message.author.username}`);

            for (const [, attachment] of message.attachments) {
                // console.log(`[DEBUG] Attachment content type: ${attachment.contentType}`);

                if (!attachment.contentType?.startsWith('image/')) {
                    // console.log(`[DEBUG] Skipping non-image attachment: ${attachment.contentType}`);
                    continue;
                }

                try {
                    console.log('[DEBUG] Calling receiptService.processAttachment...');
                    const result = await receiptService.processAttachment(attachment, message, message.channelId);

                    console.log('[DEBUG] Result from processAttachment:', result);

                    if (result) {
                        if (typeof result === 'string') {
                            await message.channel.send(result);
                        } else if (result.reference) {
                            await message.reply(result.reply);
                        }
                    } else {
                        console.log('[DEBUG] processAttachment returned null (likely no active checkpoint or not a receipt)');
                    }
                } catch (error) {
                    console.error('[DEBUG] Error processing attachment:', error);
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
