const { SlashCommandBuilder } = require('discord.js');
const receiptService = require('../services/ReceiptService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Mulai checkpoint baru untuk mencatat struk belanja.'),
    async execute(interaction) {
        const channelId = interaction.channelId;
        const messageId = interaction.id; // Using interaction ID as start message ID ref

        // Defer reply if logic might take time, but here it's fast usually.
        // However, clean architecture suggests service might be async.
        await interaction.deferReply();

        const result = await receiptService.startCheckpoint(channelId, messageId);

        await interaction.editReply(result.message);
    },
};
