<?php

// Milo - Discord receipt checkpoint bot

// All secrets come from environment variables for safety.
// Make sure these are set in your hosting or container environment.

if (!defined('DISCORD_PUBLIC_KEY')) {
    define('DISCORD_PUBLIC_KEY', getenv('DISCORD_PUBLIC_KEY') ?: '');
}

if (!defined('DISCORD_BOT_TOKEN')) {
    define('DISCORD_BOT_TOKEN', getenv('DISCORD_BOT_TOKEN') ?: '');
}

if (!defined('DISCORD_CHANNEL_ID')) {
    // If not set, you must define this in environment.
    define('DISCORD_CHANNEL_ID', getenv('DISCORD_CHANNEL_ID') ?: '');
}

if (!defined('GEMINI_API_KEY')) {
    define('GEMINI_API_KEY', getenv('GEMINI_API_KEY') ?: '');
}

if (!defined('GEMINI_MODEL')) {
    define('GEMINI_MODEL', getenv('GEMINI_MODEL') ?: 'gemini-2.5-flash');
}

// Database configuration - supports both PostgreSQL and SQLite
if (!defined('DATABASE_URL')) {
    // PostgreSQL connection string (e.g., postgres://user:pass@host:port/dbname)
    // If set, this takes priority over SQLite
    define('DATABASE_URL', getenv('DATABASE_URL') ?: '');
}

if (!defined('DB_PATH')) {
    // SQLite fallback: "data/receipts.db" relative to this file
    // Used if DATABASE_URL is not set
    define('DB_PATH', getenv('DB_PATH') ?: __DIR__ . '/../data/receipts.db');
}
