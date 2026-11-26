const db = require('../db');

class TcgRepository {
    async getOrCreateProfile(userId) {
        let profile = await db.get('SELECT * FROM game_profiles WHERE user_id = ?', [userId]);
        if (!profile) {
            await db.run(
                'INSERT OR IGNORE INTO game_profiles (user_id, tuna, last_chat_reward_at, pity_count) VALUES (?, 50, NULL, 0)',
                [userId]
            );
            profile = await db.get('SELECT * FROM game_profiles WHERE user_id = ?', [userId]);
        }
        return profile;
    }

    async awardChatTuna(userId, amount, cooldownMs) {
        const profile = await this.getOrCreateProfile(userId);
        const now = Date.now();
        if (profile.last_chat_reward_at) {
            const elapsed = now - new Date(profile.last_chat_reward_at).getTime();
            if (elapsed < cooldownMs) return false;
        }
        await db.run(
            'UPDATE game_profiles SET tuna = tuna + ?, last_chat_reward_at = ? WHERE user_id = ?',
            [amount, new Date(now).toISOString(), userId]
        );
        return true;
    }

    async addTuna(userId, delta) {
        await this.getOrCreateProfile(userId);
        await db.run(
            'UPDATE game_profiles SET tuna = MAX(0, tuna + ?) WHERE user_id = ?',
            [delta, userId]
        );
        return await this.getOrCreateProfile(userId);
    }

    async setPityCount(userId, pityCount) {
        await db.run(
            'UPDATE game_profiles SET pity_count = ? WHERE user_id = ?',
            [pityCount, userId]
        );
    }

    async createCardAndAssign(userId, card) {
        const now = new Date().toISOString();
        const cardRes = await db.run(
            `INSERT INTO tcg_cards (name, rarity, image_url, skill_name, skill_desc, flavor_text, atk, sleep, recycle_value, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                card.name,
                card.rarity,
                card.image_url,
                card.skill_name,
                card.skill_desc,
                card.flavor_text,
                card.atk,
                card.sleep,
                card.recycle_value,
                now
            ]
        );
        const cardId = cardRes.lastID;
        const ucRes = await db.run(
            'INSERT INTO user_cards (user_id, card_id, obtained_at) VALUES (?, ?, ?)',
            [userId, cardId, now]
        );
        return { userCardId: ucRes.lastID, cardId };
    }

    async getUserCards(userId) {
        return await db.all(
            `SELECT uc.id AS user_card_id, uc.obtained_at, c.*
             FROM user_cards uc
             JOIN tcg_cards c ON c.id = uc.card_id
             WHERE uc.user_id = ?
             ORDER BY uc.id DESC`,
            [userId]
        );
    }

    async getUserCardCount(userId) {
        const row = await db.get('SELECT COUNT(*) AS cnt FROM user_cards WHERE user_id = ?', [userId]);
        return row ? row.cnt : 0;
    }

    async getImageUrlsUsedByOtherRarities(rarity) {
        const rows = await db.all('SELECT DISTINCT image_url FROM tcg_cards WHERE rarity != ?', [rarity]);
        return new Set(rows.map(r => r.image_url));
    }

    async getUserCardById(userCardId, userId) {
        return await db.get(
            `SELECT uc.id AS user_card_id, uc.user_id, uc.obtained_at, c.*
             FROM user_cards uc
             JOIN tcg_cards c ON c.id = uc.card_id
             WHERE uc.id = ? AND uc.user_id = ?`,
            [userCardId, userId]
        );
    }

    async deleteUserCard(userCardId, userId) {
        const res = await db.run(
            'DELETE FROM user_cards WHERE id = ? AND user_id = ?',
            [userCardId, userId]
        );
        return (res.changes || 0) > 0;
    }

    async createTrade(fromUserId, toUserId, fromUserCardId, toUserCardId) {
        const now = new Date().toISOString();
        // Expire any old pending trade for the recipient
        await db.run(
            "UPDATE tcg_trades SET status = 'CANCELLED' WHERE to_user_id = ? AND status = 'PENDING'",
            [toUserId]
        );
        const res = await db.run(
            `INSERT INTO tcg_trades (from_user_id, to_user_id, from_user_card_id, to_user_card_id, status, created_at)
             VALUES (?, ?, ?, ?, 'PENDING', ?)`,
            [fromUserId, toUserId, fromUserCardId, toUserCardId, now]
        );
        return res.lastID;
    }

    async getPendingTradeForUser(toUserId) {
        return await db.get(
            "SELECT * FROM tcg_trades WHERE to_user_id = ? AND status = 'PENDING' ORDER BY id DESC LIMIT 1",
            [toUserId]
        );
    }

    async completeTrade(tradeId, fromUserId, toUserId, fromUserCardId, toUserCardId) {
        await db.run('UPDATE user_cards SET user_id = ? WHERE id = ? AND user_id = ?', [toUserId, fromUserCardId, fromUserId]);
        await db.run('UPDATE user_cards SET user_id = ? WHERE id = ? AND user_id = ?', [fromUserId, toUserCardId, toUserId]);
        await db.run("UPDATE tcg_trades SET status = 'COMPLETED' WHERE id = ?", [tradeId]);
    }

    async cancelTrade(tradeId) {
        await db.run("UPDATE tcg_trades SET status = 'CANCELLED' WHERE id = ?", [tradeId]);
    }
}

module.exports = new TcgRepository();
