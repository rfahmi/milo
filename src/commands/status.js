const { SlashCommandBuilder } = require('discord.js');
const receiptService = require('../services/ReceiptService');
const { sendLongReply } = require('../utils/discordReply');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Cek status checkpoint dan total pengeluaran sementara.'),
    async execute(interaction) {
        await interaction.deferReply();
        const result = await receiptService.status(interaction.channelId);
        await sendLongReply(interaction, result.message);
    },
};
