<?php
// Trigger endpoint for external cron services
// This allows free cron services to trigger message processing

require_once __DIR__ . '/config.php';

// Get secret from environment or use default (change in production!)
$expectedSecret = getenv('CRON_SECRET') ?: 'change-me-in-production';
$providedSecret = $_GET['secret'] ?? '';

// Verify secret
if ($providedSecret !== $expectedSecret) {
    http_response_code(403);
    die('Forbidden');
}

// Include and run the cron processing
require_once __DIR__ . '/cron_process_messages.php';

http_response_code(200);
echo json_encode([
    'status' => 'success',
    'message' => 'Cron job executed',
    'timestamp' => date('c')
]);
