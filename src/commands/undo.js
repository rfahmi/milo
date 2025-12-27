const { SlashCommandBuilder } = require('discord.js');
const receiptService = require('../services/ReceiptService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('undo')
        .setDescription('Batalkan checkpoint terakhir (hanya jika belum ada transaksi).'),
    async execute(interaction) {
        await interaction.deferReply();
        const result = await receiptService.undo(interaction.channelId);
        await interaction.editReply(result.message);
    },
};
