require('dotenv').config();
const path = require('path');
const fs = require('fs');

const requiredEnv = ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID', 'GEMINI_API_KEY'];

function validateEnv() {
    const missing = requiredEnv.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

// Ensure database path
let dbPath = process.env.DB_PATH;
if (!dbPath) {
    const localDataPath = path.join(__dirname, '../../data');
    if (fs.existsSync('/data')) {
        // Prioritize persistent volume directory in production (Railway/Docker)
        dbPath = '/data/receipts.db';
    } else if (fs.existsSync(localDataPath)) {
        // Fallback to local data directory (Fix for Windows dev environment)
        dbPath = path.join(localDataPath, 'receipts.db');
    } else {
        // Fallback create local
        dbPath = path.join(localDataPath, 'receipts.db');
    }
}

module.exports = {
    validateEnv,
    discord: {
        token: process.env.DISCORD_BOT_TOKEN,
        publicKey: process.env.DISCORD_PUBLIC_KEY,
        applicationId: process.env.DISCORD_APPLICATION_ID,
        channelId: process.env.DISCORD_CHANNEL_ID,
        adminId: process.env.DISCORD_ADMIN_USER_ID,
    },
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    },
    db: {
        path: dbPath,
    },
    backlog: {
        // Set BACKLOG_ENABLED=false in .env to skip backlog processing on startup
        enabled: process.env.BACKLOG_ENABLED !== 'false',
    },
    env: process.env.NODE_ENV || 'development',
};
