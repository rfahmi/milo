const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const db = require('../data/db');
const config = require('../config');
const fs = require('fs');
const path = require('path');

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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('backup')
                .setDescription('Unduh backup database.')
        ),
    async execute(interaction) {
        console.log('[DEBUG] Admin command triggered');

        // Security Check: Only allow specific Admin ID
        if (config.discord.adminId && interaction.user.id !== config.discord.adminId) {
            return interaction.reply({
                content: '⛔ You are not authorized to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        console.log(`[DEBUG] Admin subcommand: ${subcommand}`);

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
        } else if (subcommand === 'backup') {
            await interaction.deferReply({ ephemeral: true });

            const dbPath = config.db.path;

            if (!fs.existsSync(dbPath)) {
                return interaction.editReply({ content: '❌ Database file not found.' });
            }

            const now = new Date();
            const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
            const filename = `receipts-${timestamp}.db`;

            const attachment = new AttachmentBuilder(dbPath, { name: filename });

            await interaction.editReply({
                content: '✅ Database backup ready.',
                files: [attachment]
            });
        }
    },
};
