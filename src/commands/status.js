const { SlashCommandBuilder } = require('discord.js');
const receiptService = require('../services/ReceiptService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Cek status checkpoint dan total pengeluaran sementara.'),
    async execute(interaction) {
        await interaction.deferReply();
        const result = await receiptService.status(interaction.channelId);
        await interaction.editReply(result.message);
    },
};
