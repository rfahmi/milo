const db = require('../db');

class ConversationRepository {
    async getState(userId, channelId) {
        const row = await db.get(
            'SELECT * FROM conversation_states WHERE user_id = ? AND channel_id = ?',
            [userId, channelId]
        );
        if (row && row.data) {
            try {
                row.data = JSON.parse(row.data);
            } catch (e) {
                row.data = {};
            }
        }
        return row;
    }

    async setState(userId, channelId, state, data = {}) {
        const updatedAt = new Date().toISOString();
        const dataStr = JSON.stringify(data);
        return await db.run(
            `INSERT INTO conversation_states (user_id, channel_id, state, data, updated_at) 
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(user_id, channel_id) 
             DO UPDATE SET state = ?, data = ?, updated_at = ?`,
            [userId, channelId, state, dataStr, updatedAt, state, dataStr, updatedAt]
        );
    }

    async clearState(userId, channelId) {
        return await db.run(
            'DELETE FROM conversation_states WHERE user_id = ? AND channel_id = ?',
            [userId, channelId]
        );
    }
}

module.exports = new ConversationRepository();
