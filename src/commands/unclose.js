const { SlashCommandBuilder } = require('discord.js');
const receiptService = require('../services/ReceiptService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unclose')
        .setDescription('Buka kembali checkpoint terakhir yang ditutup (hanya jika checkpoint aktif belum ada transaksi).'),
    async execute(interaction) {
        await interaction.deferReply();
        const result = await receiptService.unclose(interaction.channelId);
        await interaction.editReply(result.message);
    },
};
