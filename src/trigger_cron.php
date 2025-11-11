<?php
// Trigger endpoint for external cron services
// This allows free cron services to trigger message processing

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

// Get secret from environment or use default (change in production!)
$expectedSecret = getenv('CRON_SECRET') ?: 'change-me-in-production';
$providedSecret = $_GET['secret'] ?? '';

// Verify secret
if ($providedSecret !== $expectedSecret) {
    http_response_code(403);
    die('Forbidden');
}

// Process messages (copied logic from cron_process_messages.php but web-accessible)
$db = get_db();
$channelId = DISCORD_CHANNEL_ID;

if (!$channelId) {
    http_response_code(500);
    echo json_encode(['error' => 'DISCORD_CHANNEL_ID is not set']);
    exit;
}
if (!DISCORD_BOT_TOKEN) {
    http_response_code(500);
    echo json_encode(['error' => 'DISCORD_BOT_TOKEN is not set']);
    exit;
}

// Get last processed message
$state = get_channel_state($db, $channelId);
$after = $state['last_message_id'] ?? null;

$url = "https://discord.com/api/v10/channels/{$channelId}/messages?limit=50";
if ($after) {
    $url .= "&after=" . urlencode($after);
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bot ' . DISCORD_BOT_TOKEN,
    'User-Agent: MiloBot/1.0'
]);
$resp = curl_exec($ch);
curl_close($ch);

$messages = json_decode($resp, true);
if (!is_array($messages)) {
    http_response_code(200);
    echo json_encode([
        'status' => 'success',
        'message' => 'No messages to process',
        'timestamp' => date('c')
    ]);
    exit;
}

$messages = array_reverse($messages); // oldest first
$newLast = $state['last_message_id'] ?? null;
$processedCount = 0;
$receiptsAdded = 0;

foreach ($messages as $msg) {
    $msgId = $msg['id'];
    $newLast = $msgId;

    // Check if we have an active checkpoint
    $active = get_active_checkpoint($db, $channelId);
    if (!$active) {
        continue;
    }

    // Look for image attachments
    $attachments = $msg['attachments'] ?? [];
    foreach ($attachments as $att) {
        if (!str_starts_with($att['content_type'] ?? '', 'image/')) {
            continue;
        }

        $imageUrl = $att['url'];
        $userId = $msg['author']['id'] ?? 'unknown';
        $userName = $msg['author']['username'] ?? 'Unknown';

        // Ask Gemini to extract total
        $total = extract_total_from_image($imageUrl);
        if ($total === null) {
            continue;
        }

        // Insert receipt
        $stmt = $db->prepare("
            INSERT INTO receipts (checkpoint_id, user_id, user_name, total, message_id)
            VALUES (:cid, :uid, :uname, :total, :mid)
        ");
        $stmt->execute([
            ':cid' => $active['id'],
            ':uid' => $userId,
            ':uname' => $userName,
            ':total' => $total,
            ':mid' => $msgId
        ]);
        $receiptsAdded++;
    }
    $processedCount++;
}

// Update channel state
if ($newLast) {
    set_channel_last_message($db, $channelId, $newLast);
}

http_response_code(200);
echo json_encode([
    'status' => 'success',
    'message' => 'Cron job executed',
    'processed' => $processedCount,
    'receipts_added' => $receiptsAdded,
    'timestamp' => date('c')
]);
