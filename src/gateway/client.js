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

    async processBacklog() {
        try {
            const receiptRepo = require('../data/repositories/ReceiptRepository');
            
            // Get active checkpoint
            const activeCheckpoint = await receiptRepo.getActiveCheckpoint(config.discord.channelId);
            if (!activeCheckpoint) {
                console.log('[Backlog] No active checkpoint, skipping backlog processing');
                return;
            }

            console.log(`[Backlog] Found active checkpoint #${activeCheckpoint.id}, processing missed messages...`);
            
            const channel = await this.client.channels.fetch(config.discord.channelId);
            if (!channel) {
                console.error('[Backlog] Could not fetch configured channel');
                return;
            }

            // Fetch messages after checkpoint start
            const messages = await channel.messages.fetch({
                after: activeCheckpoint.start_message_id,
                limit: 100
            });

            // Filter for messages with image attachments only
            const imageMessages = Array.from(messages.values())
                .filter(msg => !msg.author.bot && msg.attachments.size > 0)
                .filter(msg => {
                    for (const [, att] of msg.attachments) {
                        if (att.contentType?.startsWith('image/')) return true;
                    }
                    return false;
                })
                .reverse(); // Process in chronological order

            if (imageMessages.length === 0) {
                console.log('[Backlog] No missed image messages to process');
                return;
            }

            console.log(`[Backlog] Found ${imageMessages.length} missed messages with images`);

            let processedCount = 0;
            let successCount = 0;
            let errorCount = 0;
            const BATCH_SIZE = 20;
            const BATCH_DELAY_MS = 2000;

            for (let i = 0; i < imageMessages.length; i++) {
                const message = imageMessages[i];
                
                // Check if already processed
                const existing = await receiptRepo.getReceiptByMessageId(message.id);
                if (existing) {
                    console.log(`[Backlog] Message ${message.id} already processed, skipping`);
                    continue;
                }

                // Process each image attachment
                for (const [, attachment] of message.attachments) {
                    if (!attachment.contentType?.startsWith('image/')) continue;

                    try {
                        const result = await receiptService.processAttachment(
                            attachment,
                            message,
                            config.discord.channelId
                        );
                        
                        if (result) {
                            successCount++;
                            console.log(`[Backlog] Processed receipt from ${message.author.username}`);
                        }
                    } catch (error) {
                        errorCount++;
                        console.error(`[Backlog] Error processing message ${message.id}:`, error.message);
                    }
                }

                processedCount++;

                // Add delay between batches
                if ((i + 1) % BATCH_SIZE === 0 && i + 1 < imageMessages.length) {
                    console.log(`[Backlog] Processed ${i + 1}/${imageMessages.length}, waiting ${BATCH_DELAY_MS}ms...`);
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
                }
            }

            // Send summary notification
            if (processedCount > 0) {
                const summaryMessage = `✅ **Backlog Processing Complete**\n` +
                    `Processed ${processedCount} missed message(s) during downtime\n` +
                    `✓ ${successCount} receipt(s) successfully added\n` +
                    (errorCount > 0 ? `✗ ${errorCount} error(s) encountered` : '');
                
                await channel.send(summaryMessage);
                console.log(`[Backlog] ${summaryMessage.replace(/\n/g, ' ')}`);
            }

        } catch (error) {
            console.error('[Backlog] Error during backlog processing:', error);
        }
    }

    setupEvents() {
        this.client.once(Events.ClientReady, async c => {
            console.log(`Ready! Logged in as ${c.user.tag}`);
            
            // Process backlog after bot is ready
            await this.processBacklog();
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
            const displayName = message.member?.displayName || message.author.globalName || message.author.username;
            console.log(`[DEBUG] Message received from ${displayName} in ${message.channelId}`);

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
