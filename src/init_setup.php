<?php
// One-time setup endpoint for Render deployment
// This initializes the database and registers Discord commands
// Should only be run once after initial deployment

require_once __DIR__ . '/config.php';

// Security: Check secret token
$expectedSecret = getenv('INIT_SECRET') ?: '';
$providedSecret = $_GET['secret'] ?? '';

if (!$expectedSecret || $providedSecret !== $expectedSecret) {
    http_response_code(403);
    die('Forbidden - Invalid or missing secret');
}

$results = [];

// 1. Initialize Database
try {
    ob_start();
    require_once __DIR__ . '/../init_db.php';
    $dbOutput = ob_get_clean();
    $results['database'] = [
        'status' => 'success',
        'message' => 'Database initialized',
        'output' => $dbOutput
    ];
} catch (Exception $e) {
    $results['database'] = [
        'status' => 'error',
        'message' => $e->getMessage()
    ];
}

// 2. Register Discord Commands
$applicationId = getenv('DISCORD_APPLICATION_ID');
$botToken = DISCORD_BOT_TOKEN;

if (!$applicationId || !$botToken) {
    $results['commands'] = [
        'status' => 'error',
        'message' => 'DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN not set'
    ];
} else {
    $commands = [
        [
            'name' => 'checkpoint',
            'description' => 'Start or close a checkpoint to track receipts',
            'type' => 1
        ],
        [
            'name' => 'undo',
            'description' => 'Undo the latest checkpoint if no messages occurred after it',
            'type' => 1
        ]
    ];

    $url = "https://discord.com/api/v10/applications/{$applicationId}/commands";
    $registeredCommands = [];
    $errors = [];

    foreach ($commands as $command) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bot ' . $botToken
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($command));

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300) {
            $registeredCommands[] = $command['name'];
        } else {
            $errors[] = [
                'command' => $command['name'],
                'error' => $response
            ];
        }
    }

    if (empty($errors)) {
        $results['commands'] = [
            'status' => 'success',
            'message' => 'All commands registered',
            'commands' => $registeredCommands
        ];
    } else {
        $results['commands'] = [
            'status' => 'partial',
            'message' => 'Some commands failed to register',
            'registered' => $registeredCommands,
            'errors' => $errors
        ];
    }
}

// Output results
header('Content-Type: application/json');
echo json_encode([
    'status' => 'completed',
    'timestamp' => date('c'),
    'results' => $results,
    'note' => 'This endpoint should only be run once. You can now use the bot!'
], JSON_PRETTY_PRINT);
