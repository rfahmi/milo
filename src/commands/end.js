const { SlashCommandBuilder } = require('discord.js');
const receiptService = require('../services/ReceiptService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('end')
        .setDescription('Tutup checkpoint yang sedang berjalan dan tampilkan ringkasan.'),
    async execute(interaction) {
        await interaction.deferReply();
        const result = await receiptService.endCheckpoint(interaction.channelId, interaction.id);
        await interaction.editReply(result.message);
    },
};
