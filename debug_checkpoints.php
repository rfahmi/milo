<?php
// Debug script to check checkpoints in the database
require_once __DIR__ . '/src/helpers.php';

$db = get_db();
$channelId = DISCORD_CHANNEL_ID;

echo "=== Checkpoint Debug Info ===\n";
echo "Channel ID from config: {$channelId}\n\n";

// Get all checkpoints
echo "All checkpoints:\n";
$stmt = $db->query("SELECT * FROM checkpoints ORDER BY id DESC");
$checkpoints = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($checkpoints)) {
    echo "  No checkpoints found\n";
} else {
    foreach ($checkpoints as $cp) {
        echo "  ID: {$cp['id']}\n";
        echo "  Channel ID: {$cp['channel_id']}\n";
        echo "  Created: {$cp['created_at']}\n";
        echo "  Closed: " . ($cp['closed_at'] ?? 'NULL (active)') . "\n";
        echo "  ---\n";
    }
}

// Get active checkpoint
echo "\nActive checkpoint for channel {$channelId}:\n";
$active = get_active_checkpoint($db, $channelId);
if ($active) {
    echo "  Found: ID {$active['id']}\n";
    echo "  Channel: {$active['channel_id']}\n";
    echo "  Created: {$active['created_at']}\n";
} else {
    echo "  No active checkpoint found\n";
}

// Get receipts
echo "\nAll receipts:\n";
$stmt = $db->query("SELECT * FROM receipts ORDER BY id DESC");
$receipts = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($receipts)) {
    echo "  No receipts found\n";
} else {
    foreach ($receipts as $r) {
        echo "  ID: {$r['id']}, Checkpoint: {$r['checkpoint_id']}, User: {$r['user_name']}, Amount: {$r['amount']}\n";
    }
}
