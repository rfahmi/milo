const db = require('../db');

class MemoryRepository {
    async addMemory({ scope = 'global', kind = 'fact', content, createdBy = null }) {
        const clean = (content || '').trim();
        if (!clean) return null;

        const existing = await db.get(
            'SELECT id FROM memories WHERE LOWER(content) = LOWER(?) LIMIT 1',
            [clean]
        );
        if (existing) {
            const now = new Date().toISOString();
            await db.run(
                'UPDATE memories SET kind = ?, scope = ?, updated_at = ? WHERE id = ?',
                [kind, scope, now, existing.id]
            );
            return { id: existing.id, deduplicated: true };
        }

        const now = new Date().toISOString();
        const result = await db.run(
            'INSERT INTO memories (scope, kind, content, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [scope, kind, clean, createdBy, now, now]
        );
        return { id: result.lastID, deduplicated: false };
    }

    async getRecentMemories(limit = 40) {
        return await db.all(
            `SELECT id, scope, kind, content, created_by, created_at, updated_at
             FROM memories
             ORDER BY CASE WHEN kind = 'rule' THEN 0 ELSE 1 END, updated_at DESC
             LIMIT ?`,
            [limit]
        );
    }

    async findMemories(query) {
        const q = `%${(query || '').trim()}%`;
        return await db.all(
            'SELECT id, scope, kind, content FROM memories WHERE LOWER(content) LIKE LOWER(?) ORDER BY updated_at DESC',
            [q]
        );
    }

    async getMemoryById(id) {
        return await db.get('SELECT id, scope, kind, content FROM memories WHERE id = ?', [id]);
    }

    async deleteMemoryById(id) {
        const res = await db.run('DELETE FROM memories WHERE id = ?', [id]);
        return res.changes || 0;
    }

    async deleteMemoriesByQuery(query) {
        const q = `%${(query || '').trim()}%`;
        const res = await db.run('DELETE FROM memories WHERE LOWER(content) LIKE LOWER(?)', [q]);
        return res.changes || 0;
    }

    formatForPrompt(memories) {
        if (!memories || memories.length === 0) return '(none)';
        return memories.map(m => `- [#${m.id} | ${m.kind}] ${m.content}`).join('\n');
    }
}

module.exports = new MemoryRepository();
