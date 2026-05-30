const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const config = require('../config');
const db = require('../data/db');
const receiptRepo = require('../data/repositories/ReceiptRepository');

class BackupScheduler {
    constructor() {
        this.job = null;
        this.client = null;
    }

    async init(discordClient) {
        this.client = discordClient;
        await this.loadSchedule();
    }

    async loadSchedule() {
        const schedule = await receiptRepo.getBackupSchedule();
        
        if (schedule && schedule.enabled) {
            this.startSchedule(schedule.cron_expression);
            console.log(`[BackupScheduler] Loaded schedule: ${schedule.cron_expression} (Jakarta time)`);
        } else {
            console.log('[BackupScheduler] No active schedule found');
        }
    }

    startSchedule(cronExpression) {
        // Stop existing job if any
        this.stop();

        // Validate cron expression
        if (!cron.validate(cronExpression)) {
            throw new Error('Invalid cron expression');
        }

        // Create new job with Jakarta timezone
        this.job = cron.schedule(cronExpression, async () => {
            console.log('[BackupScheduler] Running scheduled backup...');
            await this.performBackup();
        }, {
            timezone: 'Asia/Jakarta'
        });

        console.log(`[BackupScheduler] Schedule started: ${cronExpression}`);
    }

    async performBackup() {
        try {
            if (!config.discord.channelId) {
                console.error('[BackupScheduler] DISCORD_CHANNEL_ID not configured');
                return;
            }

            const dbPath = config.db.path;

            if (!fs.existsSync(dbPath)) {
                console.error('[BackupScheduler] Database file not found');
                return;
            }

            const now = new Date();
            const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
            const filename = `receipts-${timestamp}.db`;

            // Use VACUUM INTO to export a fully merged, self-contained snapshot.
            // This atomically merges all WAL-buffered writes into the output file,
            // so the backup always reflects the complete current state of the DB.
            // The old wal_checkpoint + copyFileSync approach was unreliable because
            // the checkpoint could fail silently or the copy could race the WAL flush.
            const tempPath = path.join(path.dirname(dbPath), `.backup-${timestamp}.db`);
            try {
                await db.run('VACUUM INTO ?', [tempPath]);
                console.log('[BackupScheduler] VACUUM INTO snapshot created');
            } catch (vacuumErr) {
                console.error('[BackupScheduler] VACUUM INTO failed:', vacuumErr.message);
                return;
            }

            const attachment = new AttachmentBuilder(tempPath, { name: filename });

            const channel = await this.client.channels.fetch(config.discord.channelId);
            if (!channel) {
                console.error('[BackupScheduler] Channel not found');
                return;
            }

            await channel.send({
                content: `🔄 **Automated Backup**\nTimestamp: ${now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
                files: [attachment]
            });

            // Clean up temp backup file
            try {
                fs.unlinkSync(tempPath);
            } catch (cleanupErr) {
                console.warn('[BackupScheduler] Could not clean up temp file:', cleanupErr.message);
            }

            console.log(`[BackupScheduler] Backup sent successfully to channel ${config.discord.channelId}`);
        } catch (error) {
            console.error('[BackupScheduler] Backup failed:', error);
        }
    }

    stop() {
        if (this.job) {
            this.job.stop();
            this.job = null;
            console.log('[BackupScheduler] Schedule stopped');
        }
    }

    isRunning() {
        return this.job !== null;
    }
}

module.exports = new BackupScheduler();
