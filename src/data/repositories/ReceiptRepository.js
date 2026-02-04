const db = require('../db');

class ReceiptRepository {
    async getActiveCheckpoint(channelId) {
        // Relaxed constraint: Get the latest open checkpoint regardless of channel_id.
        // This allows moving the DB between channels (e.g. prod -> sandbox) seamlessly.
        return await db.get(
            'SELECT * FROM checkpoints WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1'
        );
    }

    async createCheckpoint(channelId, startMessageId) {
        const createdAt = new Date().toISOString();
        const result = await db.run(
            'INSERT INTO checkpoints (channel_id, created_at, start_message_id) VALUES (?,?,?)',
            [channelId, createdAt, startMessageId]
        );
        return result.lastID;
    }

    async closeCheckpoint(checkpointId, endMessageId) {
        const closedAt = new Date().toISOString();
        return await db.run(
            'UPDATE checkpoints SET closed_at = ?, end_message_id = ? WHERE id = ?',
            [closedAt, endMessageId, checkpointId]
        );
    }

    async addReceipt(data) {
        const result = await db.run(
            'INSERT OR IGNORE INTO receipts (user_id, user_name, channel_id, checkpoint_id, message_id, image_url, amount, description, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
            [
                data.user_id,
                data.user_name,
                data.channel_id,
                data.checkpoint_id,
                data.message_id,
                data.image_url,
                data.amount,
                data.description || null, // Handle description
                data.created_at
            ]
        );
        return result.lastID;
    }

    async getReceiptsForCheckpoint(checkpointId) {
        return await db.all(
            'SELECT user_id, user_name, amount, description, created_at, message_id FROM receipts WHERE checkpoint_id = ? ORDER BY created_at ASC',
            [checkpointId]
        );
    }

    async getCheckpointSummary(checkpointId) {
        // Group by user_id only to avoid splitting if name changes. MAX(user_name) picks the latest/lexicographical name.
        return await db.all(
            'SELECT MAX(user_name) as user_name, user_id, SUM(amount) AS total FROM receipts WHERE checkpoint_id = ? GROUP BY user_id ORDER BY total DESC',
            [checkpointId]
        );
    }

    async getLatestCheckpoint(channelId) {
        // Relaxed constraint for portability
        return await db.get(
            'SELECT * FROM checkpoints ORDER BY id DESC LIMIT 1'
        );
    }

    async getChannelState(channelId) {
        return await db.get('SELECT * FROM channel_state WHERE channel_id = ?', [channelId]);
    }

    async setChannelLastMessage(channelId, lastMessageId) {
        return await db.run(
            'INSERT INTO channel_state (channel_id, last_message_id) VALUES (?,?) ON CONFLICT(channel_id) DO UPDATE SET last_message_id = ?',
            [channelId, lastMessageId, lastMessageId]
        );
    }

    async deleteReceiptByNumber(checkpointId, receiptNumber) {
        // Get all receipts for the checkpoint ordered by created_at
        const receipts = await db.all(
            'SELECT id FROM receipts WHERE checkpoint_id = ? ORDER BY created_at ASC',
            [checkpointId]
        );

        // Check if the receipt number is valid (1-indexed)
        if (receiptNumber < 1 || receiptNumber > receipts.length) {
            return null;
        }

        // Get the receipt ID for the given number
        const receiptId = receipts[receiptNumber - 1].id;

        // Delete the receipt
        const result = await db.run(
            'DELETE FROM receipts WHERE id = ?',
            [receiptId]
        );

        return result.changes > 0 ? receiptId : null;
    }

    async getBackupSchedule() {
        return await db.get('SELECT * FROM backup_schedule WHERE id = 1');
    }

    async setBackupSchedule(cronExpression) {
        const now = new Date().toISOString();
        const existing = await this.getBackupSchedule();
        
        if (existing) {
            return await db.run(
                'UPDATE backup_schedule SET cron_expression = ?, enabled = 1, updated_at = ? WHERE id = 1',
                [cronExpression, now]
            );
        } else {
            return await db.run(
                'INSERT INTO backup_schedule (id, cron_expression, enabled, created_at, updated_at) VALUES (1, ?, 1, ?, ?)',
                [cronExpression, now, now]
            );
        }
    }

    async disableBackupSchedule() {
        const now = new Date().toISOString();
        return await db.run(
            'UPDATE backup_schedule SET enabled = 0, updated_at = ? WHERE id = 1',
            [now]
        );
    }
}

module.exports = new ReceiptRepository();
