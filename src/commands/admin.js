const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const db = require('../data/db');
const config = require('../config');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const geminiService = require('../services/GeminiService');

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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('restore')
                .setDescription('Upload dan restore database (timpa yang ada).')
                .addAttachmentOption(option =>
                    option.setName('database_file')
                        .setDescription('File .db untuk direstore')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('refresh-names')
                .setDescription('Update semua nama user di database sesuai display name Discord saat ini.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Hapus transaksi tertentu berdasarkan nomor yang muncul di /status.')
                .addIntegerOption(option =>
                    option.setName('number')
                        .setDescription('Nomor transaksi yang ingin dihapus (lihat /status)')
                        .setRequired(true)
                        .setMinValue(1))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('backup-schedule')
                .setDescription('Jadwalkan backup otomatis menggunakan cron syntax.')
                .addStringOption(option =>
                    option.setName('cron')
                        .setDescription('Cron expression (contoh: "0 2 * * *" untuk setiap hari jam 2 pagi Jakarta)')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('backup-schedule-status')
                .setDescription('Lihat status jadwal backup otomatis.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('backup-schedule-disable')
                .setDescription('Nonaktifkan jadwal backup otomatis.')
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
            const wsLatency = Math.round(interaction.client.ws.ping);

            const geminiHealth = await geminiService.healthCheck();
            let geminiStatusIcon = '✅';
            if (geminiHealth.status === 'DOWN') geminiStatusIcon = '❌';
            if (geminiHealth.status === 'RATE_LIMITED') geminiStatusIcon = '⚠️';
            if (geminiHealth.status === 'ERROR') geminiStatusIcon = '⁉️';

            await interaction.editReply({
                content: `🏓 **Pong!**\n` +
                    `- Bot Latency: **${latency}ms**\n` +
                    `- Gateway Latency: **${wsLatency}ms**\n` +
                    `- Gemini API: ${geminiStatusIcon} **${geminiHealth.status}** (${geminiHealth.latency}ms) - ${geminiHealth.message}`
            });
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
        } else if (subcommand === 'restore') {
            const attach = interaction.options.getAttachment('database_file');

            if (!attach) {
                return interaction.reply({ content: '❌ Please attach a database file.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const dbPath = config.db.path;
                const dbDir = path.dirname(dbPath);
                const shmPath = `${dbPath}-shm`;
                const walPath = `${dbPath}-wal`;

                // 1. Close existing connection
                await db.close();

                // 2. Download valid file
                const response = await fetch(attach.url);
                if (!response.ok) throw new Error('Failed to download file.');
                const buffer = await response.buffer();

                // 3. Delete WAL/SHM files to prevent corruption
                if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
                if (fs.existsSync(walPath)) fs.unlinkSync(walPath);

                // 4. Overwrite DB file
                fs.writeFileSync(dbPath, buffer);

                // 5. Re-init schema (just to verify connection works and ensure schema is valid)
                db.initSchema();

                await interaction.editReply({
                    content: `✅ Database restored successfully from \`${attach.name}\`. Connection re-established.`
                });

            } catch (error) {
                console.error('Restore failed:', error);
                await interaction.editReply({
                    content: `❌ Restore failed: ${error.message}. You may need to manually restart the bot.`
                });
            }
        } else if (subcommand === 'refresh-names') {
            await interaction.deferReply({ ephemeral: true });

            try {
                // 1. Get all unique user IDs from DB
                const users = await db.all('SELECT DISTINCT user_id FROM receipts');
                let updatedCount = 0;
                let errorCount = 0;

                for (const user of users) {
                    try {
                        const member = await interaction.guild.members.fetch(user.user_id);
                        const newName = member.displayName;

                        // 2. Update all receipts for this user
                        await db.run(
                            'UPDATE receipts SET user_name = ? WHERE user_id = ?',
                            [newName, user.user_id]
                        );
                        updatedCount++;
                    } catch (e) {
                        console.error(`Failed to fetch/update user ${user.user_id}:`, e.message);
                        errorCount++;
                    }
                }

                await interaction.editReply({
                    content: `✅ Names refreshed.\nUpdated: ${updatedCount} users.\nFailed/Left: ${errorCount} users.`
                });
            } catch (error) {
                console.error('Refresh names failed:', error);
                await interaction.editReply({ content: `❌ Failed: ${error.message}` });
            }
        } else if (subcommand === 'delete') {
            await interaction.deferReply();

            try {
                const receiptNumber = interaction.options.getInteger('number');
                const receiptRepo = require('../data/repositories/ReceiptRepository');

                // Get the active checkpoint
                const activeCheckpoint = await receiptRepo.getActiveCheckpoint(interaction.channelId);
                if (!activeCheckpoint) {
                    return await interaction.editReply({
                        content: '❌ Tidak ada checkpoint yang aktif saat ini.'
                    });
                }

                // Verify checkpoint is running (not closed)
                if (activeCheckpoint.closed_at !== null) {
                    return await interaction.editReply({
                        content: '❌ Checkpoint sudah ditutup. Hanya bisa menghapus transaksi dari checkpoint yang sedang berjalan.'
                    });
                }

                // Delete the receipt
                const deletedId = await receiptRepo.deleteReceiptByNumber(activeCheckpoint.id, receiptNumber);

                if (!deletedId) {
                    return await interaction.editReply({
                        content: `❌ Transaksi nomor ${receiptNumber} tidak ditemukan. Gunakan /status untuk melihat daftar transaksi.`
                    });
                }

                await interaction.editReply({
                    content: `✅ Transaksi nomor ${receiptNumber} berhasil dihapus dari checkpoint #${activeCheckpoint.id}.`
                });
            } catch (error) {
                console.error('Delete transaction failed:', error);
                await interaction.editReply({ content: `❌ Failed: ${error.message}` });
            }
        } else if (subcommand === 'backup-schedule') {
            await interaction.deferReply({ ephemeral: true });

            try {
                const cronExpression = interaction.options.getString('cron');
                const cron = require('node-cron');

                // Validate cron expression
                if (!cron.validate(cronExpression)) {
                    return await interaction.editReply({
                        content: '❌ Invalid cron expression. Contoh: "0 2 * * *" (setiap hari jam 2 pagi)'
                    });
                }

                const receiptRepo = require('../data/repositories/ReceiptRepository');
                const backupScheduler = require('../services/BackupScheduler');

                await receiptRepo.setBackupSchedule(cronExpression);
                backupScheduler.startSchedule(cronExpression);

                await interaction.editReply({
                    content: `✅ Backup schedule berhasil diatur!\n` +
                        `Cron: \`${cronExpression}\`\n` +
                        `Timezone: Asia/Jakarta\n` +
                        `Channel: <#${config.discord.channelId}>`
                });
            } catch (error) {
                console.error('Set backup schedule failed:', error);
                await interaction.editReply({ content: `❌ Failed: ${error.message}` });
            }
        } else if (subcommand === 'backup-schedule-status') {
            await interaction.deferReply({ ephemeral: true });

            try {
                const receiptRepo = require('../data/repositories/ReceiptRepository');
                const backupScheduler = require('../services/BackupScheduler');
                const schedule = await receiptRepo.getBackupSchedule();

                if (!schedule) {
                    return await interaction.editReply({
                        content: '📅 Belum ada jadwal backup yang diatur.'
                    });
                }

                const status = schedule.enabled ? '✅ Aktif' : '❌ Nonaktif';
                const running = backupScheduler.isRunning() ? '🟢 Running' : '🔴 Stopped';

                await interaction.editReply({
                    content: `📅 **Backup Schedule Status**\n` +
                        `Status: ${status}\n` +
                        `Scheduler: ${running}\n` +
                        `Cron: \`${schedule.cron_expression}\`\n` +
                        `Timezone: Asia/Jakarta\n` +
                        `Last Updated: ${new Date(schedule.updated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
                });
            } catch (error) {
                console.error('Get backup schedule status failed:', error);
                await interaction.editReply({ content: `❌ Failed: ${error.message}` });
            }
        } else if (subcommand === 'backup-schedule-disable') {
            await interaction.deferReply({ ephemeral: true });

            try {
                const receiptRepo = require('../data/repositories/ReceiptRepository');
                const backupScheduler = require('../services/BackupScheduler');

                await receiptRepo.disableBackupSchedule();
                backupScheduler.stop();

                await interaction.editReply({
                    content: '✅ Backup schedule berhasil dinonaktifkan.'
                });
            } catch (error) {
                console.error('Disable backup schedule failed:', error);
                await interaction.editReply({ content: `❌ Failed: ${error.message}` });
            }
        }
    },
};
