<?php
// Test Discord API - check what data we're actually getting
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

// Security check
$expectedSecret = getenv('CRON_SECRET') ?: 'change-me-in-production';
$providedSecret = $_GET['secret'] ?? '';

if ($providedSecret !== $expectedSecret) {
    http_response_code(403);
    die('Forbidden');
}

$db = get_db();
$channelId = DISCORD_CHANNEL_ID;

// Get last processed message
$state = get_channel_state($db, $channelId);
$after = $state['last_message_id'] ?? null;

$url = "https://discord.com/api/v10/channels/{$channelId}/messages?limit=5";
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
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

header('Content-Type: application/json');
echo json_encode([
    'http_code' => $httpCode,
    'channel_id' => $channelId,
    'last_message_id' => $after,
    'api_url' => $url,
    'raw_response' => json_decode($resp, true),
], JSON_PRETTY_PRINT);
