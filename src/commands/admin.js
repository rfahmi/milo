const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../data/db');
const client = require('../gateway/client');
const crypto = require('crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Perintah administratif untuk pemeliharaan bot.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('init')
                .setDescription('Inisialisasi ulang database (hanya jika tabel belum ada).')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ping')
                .setDescription('Cek kesehatan bot.')
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'init') {
            try {
                await interaction.deferReply({ ephemeral: true });

                // Run initSchema
                db.initSchema();

                await interaction.editReply({
                    content: '✅ Database schema initialization triggered. Check console for details.'
                });
            } catch (error) {
                if (interaction.deferred) {
                    await interaction.editReply({ content: `❌ Init failed: ${error.message}` });
                } else {
                    await interaction.reply({ content: `❌ Init failed: ${error.message}`, ephemeral: true });
                }
            }
        } else if (subcommand === 'ping') {
            const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true, ephemeral: true });
            const latency = sent.createdTimestamp - interaction.createdTimestamp;
            await interaction.editReply(`🏓 Pong! Latency: ${latency}ms. API Latency: ${Math.round(interaction.client.ws.ping)}ms.`);
        }
    },
};
