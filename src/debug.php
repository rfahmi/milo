<?php
// Debug endpoint to check bot status and database
// Access: /src/debug.php?secret=YOUR_CRON_SECRET

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

// Get active checkpoint
$active = get_active_checkpoint($db, $channelId);

// Get all checkpoints
$stmt = $db->prepare("SELECT * FROM checkpoints WHERE channel_id = :c ORDER BY id DESC LIMIT 10");
$stmt->execute([':c' => $channelId]);
$checkpoints = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Get all receipts
$stmt = $db->query("SELECT * FROM receipts ORDER BY id DESC LIMIT 20");
$receipts = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Get channel state
$state = get_channel_state($db, $channelId);

// Get receipts count per checkpoint
$stmt = $db->query("
    SELECT checkpoint_id, COUNT(*) as count, SUM(amount) as total
    FROM receipts
    GROUP BY checkpoint_id
");
$receiptStats = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Environment check
$envCheck = [
    'DISCORD_CHANNEL_ID' => DISCORD_CHANNEL_ID ? '✓ Set' : '✗ Missing',
    'DISCORD_BOT_TOKEN' => DISCORD_BOT_TOKEN ? '✓ Set (' . substr(DISCORD_BOT_TOKEN, 0, 10) . '...)' : '✗ Missing',
    'GEMINI_API_KEY' => GEMINI_API_KEY ? '✓ Set (' . substr(GEMINI_API_KEY, 0, 10) . '...)' : '✗ Missing',
    'GEMINI_MODEL' => GEMINI_MODEL,
    'DB_PATH' => DB_PATH,
];

// Database file check
$dbType = is_postgres() ? 'PostgreSQL' : 'SQLite';
$dbExists = is_postgres() ? true : file_exists(DB_PATH);
$dbWritable = is_postgres() ? true : is_writable(dirname(DB_PATH));

header('Content-Type: application/json');
echo json_encode([
    'status' => 'ok',
    'timestamp' => date('c'),
    'environment' => $envCheck,
    'database' => [
        'type' => $dbType,
        'connection_string' => is_postgres() ? 'PostgreSQL (DATABASE_URL set)' : DB_PATH,
        'exists' => $dbExists,
        'directory_writable' => $dbWritable,
    ],
    'active_checkpoint' => $active,
    'channel_state' => $state,
    'recent_checkpoints' => $checkpoints,
    'recent_receipts' => $receipts,
    'receipt_stats' => $receiptStats,
], JSON_PRETTY_PRINT);
