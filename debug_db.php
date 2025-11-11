<?php
// Debug endpoint - accessible via web browser
// Visit: https://your-app.onrender.com/debug_db.php

require_once __DIR__ . '/src/helpers.php';

// Simple auth to prevent public access
$secret = $_GET['secret'] ?? '';
if ($secret !== substr(DISCORD_BOT_TOKEN, 0, 10)) {
    http_response_code(403);
    die('Access denied. Use ?secret=YOUR_BOT_TOKEN_FIRST_10_CHARS');
}

header('Content-Type: text/plain; charset=utf-8');

$db = get_db();
$channelId = DISCORD_CHANNEL_ID;

echo "=== MILO DEBUG INFO ===\n";
echo "Timestamp: " . date('Y-m-d H:i:s') . "\n";
echo "Channel ID from config: {$channelId}\n\n";

// Get all checkpoints
echo "=== ALL CHECKPOINTS ===\n";
try {
    $stmt = $db->query("SELECT * FROM checkpoints ORDER BY id DESC LIMIT 10");
    $checkpoints = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($checkpoints)) {
        echo "No checkpoints found in database\n";
    } else {
        foreach ($checkpoints as $cp) {
            echo "ID: {$cp['id']}\n";
            echo "  Channel ID: {$cp['channel_id']}\n";
            echo "  Created: {$cp['created_at']}\n";
            echo "  Closed: " . ($cp['closed_at'] ?? 'NULL (ACTIVE)') . "\n";
            echo "  Start Message: {$cp['start_message_id']}\n";
            echo "  End Message: " . ($cp['end_message_id'] ?? 'NULL') . "\n";
            echo "  ---\n";
        }
    }
} catch (Exception $e) {
    echo "ERROR querying checkpoints: " . $e->getMessage() . "\n";
}

// Get active checkpoint
echo "\n=== ACTIVE CHECKPOINT (channel: {$channelId}) ===\n";
try {
    $active = get_active_checkpoint($db, $channelId);
    if ($active) {
        echo "Found active checkpoint!\n";
        echo "  ID: {$active['id']}\n";
        echo "  Channel: {$active['channel_id']}\n";
        echo "  Created: {$active['created_at']}\n";
    } else {
        echo "No active checkpoint found for this channel\n";
    }
} catch (Exception $e) {
    echo "ERROR getting active checkpoint: " . $e->getMessage() . "\n";
}

// Get all receipts
echo "\n=== ALL RECEIPTS ===\n";
try {
    $stmt = $db->query("SELECT * FROM receipts ORDER BY id DESC LIMIT 20");
    $receipts = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($receipts)) {
        echo "No receipts found in database\n";
    } else {
        foreach ($receipts as $r) {
            echo "ID: {$r['id']}\n";
            echo "  Checkpoint: {$r['checkpoint_id']}\n";
            echo "  User: {$r['user_name']} ({$r['user_id']})\n";
            echo "  Amount: Rp{$r['amount']}\n";
            echo "  Message ID: {$r['message_id']}\n";
            echo "  Created: {$r['created_at']}\n";
            echo "  ---\n";
        }
    }
} catch (Exception $e) {
    echo "ERROR querying receipts: " . $e->getMessage() . "\n";
}

// Get channel state
echo "\n=== CHANNEL STATE ===\n";
try {
    $stmt = $db->query("SELECT * FROM channel_state");
    $states = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($states)) {
        echo "No channel states found\n";
    } else {
        foreach ($states as $state) {
            echo "Channel: {$state['channel_id']}\n";
            echo "  Last Message ID: {$state['last_message_id']}\n";
            echo "  ---\n";
        }
    }
} catch (Exception $e) {
    echo "ERROR querying channel_state: " . $e->getMessage() . "\n";
}

// Database info
echo "\n=== DATABASE INFO ===\n";
echo "Database type: " . (is_postgres() ? 'PostgreSQL' : 'SQLite') . "\n";
if (is_postgres()) {
    echo "Database URL set: " . (DATABASE_URL ? 'Yes' : 'No') . "\n";
} else {
    echo "Database path: " . DB_PATH . "\n";
    if (file_exists(DB_PATH)) {
        echo "Database file exists: Yes\n";
        echo "Database file size: " . filesize(DB_PATH) . " bytes\n";
    } else {
        echo "Database file exists: No\n";
    }
}

echo "\n=== CONFIG ===\n";
echo "DISCORD_BOT_TOKEN: " . (DISCORD_BOT_TOKEN ? 'Set (length: ' . strlen(DISCORD_BOT_TOKEN) . ')' : 'Not set') . "\n";
echo "DISCORD_APP_ID: " . (DISCORD_APP_ID ? DISCORD_APP_ID : 'Not set') . "\n";
echo "DISCORD_CHANNEL_ID: " . (DISCORD_CHANNEL_ID ? DISCORD_CHANNEL_ID : 'Not set') . "\n";
echo "GEMINI_API_KEY: " . (GEMINI_API_KEY ? 'Set (length: ' . strlen(GEMINI_API_KEY) . ')' : 'Not set') . "\n";

echo "\n=== END DEBUG INFO ===\n";
