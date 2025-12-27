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
// Ensure database path
let dbPath = process.env.DB_PATH;
if (!dbPath) {
    // Prioritize local data directory if it exists (Fix for Windows dev environment)
    const localDataPath = path.join(__dirname, '../../data');
    if (fs.existsSync(localDataPath)) {
        dbPath = path.join(localDataPath, 'receipts.db');
    } else if (fs.existsSync('/data')) {
        // Railway / Docker volume
        dbPath = '/data/receipts.db';
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
    env: process.env.NODE_ENV || 'development',
};
