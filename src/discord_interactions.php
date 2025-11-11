<?php
// Milo - Discord interactions endpoint
// Handles slash commands: /checkpoint, /undo

require_once __DIR__ . '/helpers.php';

$rawBody = file_get_contents('php://input');

if (!verify_discord_request()) {
    http_response_code(401);
    echo "invalid request";
    exit;
}

$interaction = json_decode($rawBody, true);
$type = $interaction['type'] ?? null;

// PING
if ($type === 1) {
    discord_json_response(['type' => 1]); // PONG
}

if ($type === 2) {
    $name    = $interaction['data']['name'] ?? '';
    $channel = $interaction['channel_id'] ?? DISCORD_CHANNEL_ID;
    $db      = get_db();

    if ($name === 'checkpoint') {
        $active = get_active_checkpoint($db, $channel);
        $currentMessageId = $interaction['id']; // interaction id as marker

        // If no active checkpoint → start new
        if (!$active) {
            $id = create_checkpoint($db, $channel, $currentMessageId);
            // Also sync channel_state starting point if empty
            $state = get_channel_state($db, $channel);
            if (!$state) {
                set_channel_last_message($db, $channel, $currentMessageId);
            }
            discord_json_response([
                'type' => 4,
                'data' => [
                    'content' => "✅ Checkpoint **#{$id}** started. All images from now will be tracked."
                ]
            ]);
        }

        // If active → close and summarize
        close_checkpoint($db, $active['id'], $currentMessageId);
        $summary = summarize_checkpoint($db, $active['id']);

        if (!$summary) {
            $msg = "📊 Checkpoint #{$active['id']} closed.\nNo receipts recorded.";
        } else {
            $lines = [];
            $grand = 0;
            foreach ($summary as $row) {
                $grand += $row['total'];
                $lines[] = "- **{$row['user_name']}**: Rp" . number_format($row['total'], 0, ',', '.');
            }
            $msg = "📊 Checkpoint #{$active['id']} closed.\n"
                 . implode("\n", $lines)
                 . "\n\n**Total**: Rp" . number_format($grand, 0, ',', '.');
        }

        discord_json_response([
            'type' => 4,
            'data' => ['content' => $msg]
        ]);
    }

    if ($name === 'undo') {
        $latest = get_latest_checkpoint($db, $channel);
        if (!$latest) {
            discord_json_response([
                'type' => 4,
                'data' => ['content' => "❌ No checkpoint to undo."]
            ]);
        }

        // Only allow undo if channel_state.last_message_id == checkpoint.start_message_id
        $state = get_channel_state($db, $channel);
        if ($state && $state['last_message_id'] !== $latest['start_message_id']) {
            discord_json_response([
                'type' => 4,
                'data' => [
                    'content' => "❌ Cannot undo. There are messages after the latest checkpoint."
                ]
            ]);
        }

        // Delete checkpoint + receipts
        $db->beginTransaction();
        $stmt = $db->prepare("DELETE FROM receipts WHERE checkpoint_id = :cid");
        $stmt->execute([':cid' => $latest['id']]);
        $stmt = $db->prepare("DELETE FROM checkpoints WHERE id = :id");
        $stmt->execute([':id' => $latest['id']]);
        $db->commit();

        discord_json_response([
            'type' => 4,
            'data' => ['content' => "🕓 Checkpoint #{$latest['id']} undone."]
        ]);
    }

    // Fallback
    discord_json_response([
        'type' => 4,
        'data' => ['content' => 'Unknown command.']
    ]);
}

http_response_code(400);
echo "bad request";
