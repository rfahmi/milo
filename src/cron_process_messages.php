<?php
// Milo - cron script
// Polls Discord for new messages and logs image receipts during active checkpoints.

if (php_sapi_name() !== 'cli') {
    echo "CLI only\n";
    exit;
}

require_once __DIR__ . '/helpers.php';

$db = get_db();
$channelId = DISCORD_CHANNEL_ID;

if (!$channelId) {
    echo "DISCORD_CHANNEL_ID is not set.\n";
    exit(1);
}
if (!DISCORD_BOT_TOKEN) {
    echo "DISCORD_BOT_TOKEN is not set.\n";
    exit(1);
}

// Get last processed message
$state = get_channel_state($db, $channelId);
$after = $state['last_message_id'] ?? null;

$url = "https://discord.com/api/v10/channels/{$channelId}/messages?limit=50";
if ($after) {
    $url .= "&after=" . urlencode($after);
}

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER => [
        'Authorization: Bot ' . DISCORD_BOT_TOKEN
    ],
    CURLOPT_RETURNTRANSFER => true
]);
$res = curl_exec($ch);
if ($res === false) {
    echo "Curl error: " . curl_error($ch) . "\n";
    exit(1);
}
curl_close($ch);

$messages = json_decode($res, true);
if (!is_array($messages)) {
    echo "Invalid response from Discord\n";
    exit(1);
}

// Discord returns newest first; process oldest first
$messages = array_reverse($messages);

$lastMessageId = $after;

foreach ($messages as $msg) {
    $messageId  = $msg['id'];
    $author     = $msg['author'];
    $attachments = $msg['attachments'] ?? [];

    $lastMessageId = $messageId;
    set_channel_last_message($db, $channelId, $lastMessageId);

    // Skip bot's own messages to avoid loops
    if (!empty($author['bot'])) {
        continue;
    }

    if (empty($attachments)) {
        continue;
    }

    // Check if there's an active checkpoint
    $active = get_active_checkpoint($db, $channelId);
    if (!$active) {
        continue; // no tracking at the moment
    }

    foreach ($attachments as $att) {
        $contentType = $att['content_type'] ?? '';
        $url         = $att['url'] ?? '';

        if (!$url) continue;
        if ($contentType && strpos($contentType, 'image/') !== 0) continue;

        try {
            $amount = get_total_from_receipt_gemini($url);
        } catch (Exception $e) {
            echo "Gemini error for message {$messageId}: " . $e->getMessage() . "\n";
            continue;
        }

        $data = [
            ':user_id'       => $author['id'],
            ':user_name'     => $author['username'],
            ':channel_id'    => $channelId,
            ':checkpoint_id' => $active['id'],
            ':message_id'    => $messageId,
            ':image_url'     => $url,
            ':amount'        => $amount,
            ':created_at'    => date('c'),
        ];
        $receiptId = add_receipt($db, $data);

        // Send acknowledgement message
        $ack = "💰 Noted (checkpoint #{$active['id']}) #{$receiptId}: **"
             . $author['username'] . "** Rp" . number_format($amount, 0, ',', '.');

        $payload = json_encode(['content' => $ack]);

        $ch2 = curl_init("https://discord.com/api/v10/channels/{$channelId}/messages");
        curl_setopt_array($ch2, [
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bot ' . DISCORD_BOT_TOKEN,
                'Content-Type: application/json'
            ],
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true
        ]);
        $res2 = curl_exec($ch2);
        if ($res2 === false) {
            echo "Failed to send ack: " . curl_error($ch2) . "\n";
        }
        curl_close($ch2);
    }
}

echo "Done. Last message processed: " . ($lastMessageId ?: 'none') . "\n";
