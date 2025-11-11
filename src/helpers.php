<?php
require_once __DIR__ . '/config.php';

function discord_json_response($data) {
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function get_db() {
    $dbPath = DB_PATH;
    $dir = dirname($dbPath);
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    return $db;
}

function verify_discord_request() {
    $signature = $_SERVER['HTTP_X_SIGNATURE_ED25519'] ?? '';
    $timestamp = $_SERVER['HTTP_X_SIGNATURE_TIMESTAMP'] ?? '';
    $body      = file_get_contents('php://input');

    if (!$signature || !$timestamp) {
        return false;
    }

    if (!DISCORD_PUBLIC_KEY) {
        return false;
    }

    $message = $timestamp . $body;

    try {
        return sodium_crypto_sign_verify_detached(
            sodium_hex2bin($signature),
            $message,
            sodium_hex2bin(DISCORD_PUBLIC_KEY)
        );
    } catch (Throwable $e) {
        return false;
    }
}

// Gemini: extract numeric total from receipt image
function get_total_from_receipt_gemini($imageUrl) {
    if (!GEMINI_API_KEY) {
        throw new Exception("GEMINI_API_KEY is not set.");
    }

    $imageData = @file_get_contents($imageUrl);
    if ($imageData === false) {
        throw new Exception("Failed to download image: {$imageUrl}");
    }
    $imageBase64 = base64_encode($imageData);

    $url = "https://generativelanguage.googleapis.com/v1beta/models/" . GEMINI_MODEL . ":generateContent?key=" . GEMINI_API_KEY;

    $payload = [
        "contents" => [[
            "parts" => [
                [
                    "text" => "You are reading a shopping receipt (usually Indonesian, IDR). "
                            . "Extract ONLY the grand total amount paid. "
                            . "Return ONLY the number like 120500 (no currency, no extra text). "
                            . "If unsure, make your best guess."
                ],
                [
                    "inline_data" => [
                        "mime_type" => "image/jpeg",
                        "data" => $imageBase64
                    ]
                ]
            ]
        ]]
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
    ]);
    $res = curl_exec($ch);
    if ($res === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception("Curl error calling Gemini: {$err}");
    }
    curl_close($ch);

    $json = json_decode($res, true);
    if (!is_array($json)) {
        throw new Exception("Invalid JSON from Gemini");
    }

    $text = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';

    // Get first number like 12345 or 12345.67
    $clean = str_replace([',', ' '], '', $text);
    if (preg_match('/(\d+(\.\d+)?)/', $clean, $m)) {
        return floatval($m[1]);
    }

    throw new Exception("Could not parse total from Gemini: " . $text);
}

// DB helpers

function get_active_checkpoint($db, $channelId) {
    $stmt = $db->prepare("SELECT * FROM checkpoints WHERE channel_id = :c AND closed_at IS NULL ORDER BY id DESC LIMIT 1");
    $stmt->execute([':c' => $channelId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function create_checkpoint($db, $channelId, $startMessageId) {
    $stmt = $db->prepare("
        INSERT INTO checkpoints (channel_id, created_at, start_message_id)
        VALUES (:c, :created_at, :start_msg)
    ");
    $stmt->execute([
        ':c'          => $channelId,
        ':created_at' => date('c'),
        ':start_msg'  => $startMessageId
    ]);
    return $db->lastInsertId();
}

function close_checkpoint($db, $checkpointId, $endMessageId) {
    $stmt = $db->prepare("
        UPDATE checkpoints
        SET closed_at = :closed_at, end_message_id = :end_msg
        WHERE id = :id
    ");
    $stmt->execute([
        ':closed_at' => date('c'),
        ':end_msg'   => $endMessageId,
        ':id'        => $checkpointId
    ]);
}

function add_receipt($db, $data) {
    $stmt = $db->prepare("
        INSERT INTO receipts (user_id, user_name, channel_id, checkpoint_id, message_id, image_url, amount, created_at)
        VALUES (:user_id, :user_name, :channel_id, :checkpoint_id, :message_id, :image_url, :amount, :created_at)
    ");
    $stmt->execute($data);
    return $db->lastInsertId();
}

function summarize_checkpoint($db, $checkpointId) {
    $stmt = $db->prepare("
        SELECT user_name, user_id, SUM(amount) as total
        FROM receipts
        WHERE checkpoint_id = :cid
        GROUP BY user_id, user_name
        ORDER BY total DESC
    ");
    $stmt->execute([':cid' => $checkpointId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function get_latest_checkpoint($db, $channelId) {
    $stmt = $db->prepare("SELECT * FROM checkpoints WHERE channel_id = :c ORDER BY id DESC LIMIT 1");
    $stmt->execute([':c' => $channelId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function get_channel_state($db, $channelId) {
    $stmt = $db->prepare("SELECT * FROM channel_state WHERE channel_id = :c");
    $stmt->execute([':c' => $channelId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function set_channel_last_message($db, $channelId, $lastMessageId) {
    $stmt = $db->prepare("
        INSERT INTO channel_state (channel_id, last_message_id)
        VALUES (:c, :m)
        ON CONFLICT(channel_id) DO UPDATE SET last_message_id = :m2
    ");
    $stmt->execute([
        ':c'  => $channelId,
        ':m'  => $lastMessageId,
        ':m2' => $lastMessageId,
    ]);
}
