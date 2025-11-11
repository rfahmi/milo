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

    // /start - Start a new checkpoint
    if ($name === 'start') {
        $active = get_active_checkpoint($db, $channel);
        
        if ($active) {
            discord_json_response([
                'type' => 4,
                'data' => [
                    'content' => "❌ Checkpoint #{$active['id']} is already active. Use /end to close it first."
                ]
            ]);
        }

        $currentMessageId = $interaction['id'];
        $id = create_checkpoint($db, $channel, $currentMessageId);
        
        // Sync channel_state starting point if empty
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

    // /end - Close the active checkpoint
    if ($name === 'end') {
        // First, process any new messages
        process_new_messages($db, $channel);
        
        $active = get_active_checkpoint($db, $channel);
        if (!$active) {
            discord_json_response([
                'type' => 4,
                'data' => ['content' => "❌ No active checkpoint. Use /start to begin one."]
            ]);
        }

        $currentMessageId = $interaction['id'];
        close_checkpoint($db, $active['id'], $currentMessageId);
        
        // Get detailed receipts
        $stmt = $db->prepare("
            SELECT user_name, amount, created_at, message_id
            FROM receipts
            WHERE checkpoint_id = :cid
            ORDER BY created_at ASC
        ");
        $stmt->execute([':cid' => $active['id']]);
        $receipts = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $summary = summarize_checkpoint($db, $active['id']);

        if (!$summary) {
            $msg = "📊 Checkpoint #{$active['id']} closed.\nNo receipts recorded.";
        } else {
            $lines = [];
            $grand = 0;
            
            // Add detailed items
            $lines[] = "**Receipts:**";
            foreach ($receipts as $idx => $receipt) {
                $num = $idx + 1;
                $amt = number_format($receipt['amount'], 0, ',', '.');
                $lines[] = "{$num}. {$receipt['user_name']}: Rp{$amt}";
            }
            
            $lines[] = "\n**Summary by User:**";
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

    // /status - Show current checkpoint status without closing
    if ($name === 'status') {
        // First, process any new messages
        process_new_messages($db, $channel);
        
        $active = get_active_checkpoint($db, $channel);
        if (!$active) {
            discord_json_response([
                'type' => 4,
                'data' => ['content' => "❌ No active checkpoint. Use /start to begin one."]
            ]);
        }

        // Get detailed receipts
        $stmt = $db->prepare("
            SELECT user_name, amount, created_at, message_id
            FROM receipts
            WHERE checkpoint_id = :cid
            ORDER BY created_at ASC
        ");
        $stmt->execute([':cid' => $active['id']]);
        $receipts = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $summary = summarize_checkpoint($db, $active['id']);

        if (!$summary) {
            $msg = "📊 Checkpoint #{$active['id']} (active)\nNo receipts recorded yet.";
        } else {
            $lines = [];
            $grand = 0;
            
            // Add detailed items
            $lines[] = "**Receipts:**";
            foreach ($receipts as $idx => $receipt) {
                $num = $idx + 1;
                $amt = number_format($receipt['amount'], 0, ',', '.');
                $lines[] = "{$num}. {$receipt['user_name']}: Rp{$amt}";
            }
            
            $lines[] = "\n**Summary by User:**";
            foreach ($summary as $row) {
                $grand += $row['total'];
                $lines[] = "- **{$row['user_name']}**: Rp" . number_format($row['total'], 0, ',', '.');
            }
            
            $msg = "📊 Checkpoint #{$active['id']} (active)\n"
                 . implode("\n", $lines)
                 . "\n\n**Total**: Rp" . number_format($grand, 0, ',', '.');
        }

        discord_json_response([
            'type' => 4,
            'data' => ['content' => $msg]
        ]);
    }

    // /undo - Undo the latest checkpoint
    if ($name === 'undo') {
        $latest = get_latest_checkpoint($db, $channel);
        if (!$latest) {
            discord_json_response([
                'type' => 4,
                'data' => ['content' => "❌ No checkpoint to undo."]
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
