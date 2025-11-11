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
    define('GEMINI_MODEL', getenv('GEMINI_MODEL') ?: 'gemini-1.5-pro');
}

if (!defined('DB_PATH')) {
    // Default: "data/receipts.db" relative to this file
    define('DB_PATH', __DIR__ . '/../data/receipts.db');
}
