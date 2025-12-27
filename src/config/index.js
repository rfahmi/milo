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
    if (fs.existsSync('/data')) {
        // Railway / Docker volume
        dbPath = '/data/receipts.db';
    } else {
        // Local dev fallback
        dbPath = path.join(__dirname, '../../data/receipts.db');
    }
}

module.exports = {
    validateEnv,
    discord: {
        token: process.env.DISCORD_BOT_TOKEN,
        publicKey: process.env.DISCORD_PUBLIC_KEY,
        applicationId: process.env.DISCORD_APPLICATION_ID,
        channelId: process.env.DISCORD_CHANNEL_ID,
    },
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    },
    db: {
        path: dbPath,
    },
    env: process.env.NODE_ENV || 'development',
};
