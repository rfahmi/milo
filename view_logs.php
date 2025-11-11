<?php
// View recent error logs
// Visit: https://your-app.onrender.com/view_logs.php

require_once __DIR__ . '/src/config.php';

// Simple auth
$secret = $_GET['secret'] ?? '';
if ($secret !== substr(DISCORD_BOT_TOKEN, 0, 10)) {
    http_response_code(403);
    die('Access denied. Use ?secret=YOUR_BOT_TOKEN_FIRST_10_CHARS');
}

header('Content-Type: text/plain; charset=utf-8');

echo "=== RECENT ERROR LOGS ===\n\n";

// Try to find error logs
$logLocations = [
    '/var/log/apache2/error.log',
    '/var/log/php_errors.log',
    'php://stderr'
];

$found = false;
foreach ($logLocations as $logPath) {
    if ($logPath === 'php://stderr') continue;
    
    if (file_exists($logPath)) {
        echo "=== LOG FILE: {$logPath} ===\n";
        // Get last 100 lines
        $lines = file($logPath);
        if ($lines) {
            $recent = array_slice($lines, -100);
            echo implode('', $recent);
            $found = true;
        }
        echo "\n\n";
    }
}

if (!$found) {
    echo "No log files found at standard locations.\n";
    echo "Checked locations:\n";
    foreach ($logLocations as $loc) {
        echo "  - {$loc}\n";
    }
}

// Show PHP error reporting settings
echo "\n=== PHP ERROR SETTINGS ===\n";
echo "error_reporting: " . error_reporting() . "\n";
echo "display_errors: " . ini_get('display_errors') . "\n";
echo "log_errors: " . ini_get('log_errors') . "\n";
echo "error_log: " . ini_get('error_log') . "\n";
