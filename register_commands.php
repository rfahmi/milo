<?php
// Register Discord slash commands for Milo bot

require_once __DIR__ . '/src/config.php';

$applicationId = getenv('DISCORD_APPLICATION_ID');
$botToken = DISCORD_BOT_TOKEN;

if (!$applicationId || !$botToken) {
    die("Error: DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN must be set\n");
}

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
        echo "✅ Registered command: /{$command['name']}\n";
    } else {
        echo "❌ Failed to register /{$command['name']}: {$response}\n";
    }
}

echo "\nDone! Commands registered.\n";
