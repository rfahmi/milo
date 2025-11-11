<?php
require_once __DIR__ . '/config.php';

function discord_json_response($data) {
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function get_db() {
    // Check if PostgreSQL connection string is provided
    if (DATABASE_URL) {
        // Check if pdo_pgsql extension is loaded
        if (!extension_loaded('pdo_pgsql')) {
            $availableDrivers = PDO::getAvailableDrivers();
            error_log("ERROR: pdo_pgsql extension not loaded. Available PDO drivers: " . implode(', ', $availableDrivers));
            throw new PDOException("PostgreSQL connection failed: could not find driver. Available drivers: " . implode(', ', $availableDrivers));
        }
        
        try {
            // Parse DATABASE_URL (format: postgres://user:pass@host:port/dbname)
            $dbUrl = DATABASE_URL;
            
            // Parse the URL
            $parts = parse_url($dbUrl);
            if (!$parts) {
                throw new PDOException("Invalid DATABASE_URL format");
            }
            
            $host = $parts['host'] ?? 'localhost';
            $port = $parts['port'] ?? 5432;
            $dbname = ltrim($parts['path'] ?? '', '/');
            $user = $parts['user'] ?? '';
            $pass = $parts['pass'] ?? '';
            
            // Build PDO DSN string
            $dsn = sprintf(
                "pgsql:host=%s;port=%d;dbname=%s",
                $host,
                $port,
                $dbname
            );
            
            error_log("Connecting to PostgreSQL: host=$host, port=$port, dbname=$dbname, user=$user");
            
            $db = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
            ]);
            
            error_log("Successfully connected to PostgreSQL");
            return $db;
        } catch (PDOException $e) {
            error_log("PostgreSQL connection failed: " . $e->getMessage());
            throw new PDOException("PostgreSQL connection failed: " . $e->getMessage());
        }
    }
    
    // Fallback to SQLite
    error_log("Using SQLite database (DATABASE_URL not set)");
    $dbPath = DB_PATH;
    $dir = dirname($dbPath);
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    return $db;
}

function is_postgres() {
    return !empty(DATABASE_URL);
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
                            . "Return ONLY the number like 120500 (no currency, no extra text, no periods, no commas). "
                            . "If you see multiple numbers, return the LARGEST one (the grand total). "
                            . "Examples: If total is Rp 125.000, return: 125000"
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
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        throw new Exception("Gemini API error (HTTP {$httpCode}): {$res}");
    }

    $json = json_decode($res, true);
    if (!is_array($json)) {
        throw new Exception("Invalid JSON from Gemini: {$res}");
    }

    // Check for API errors
    if (isset($json['error'])) {
        $errorMsg = $json['error']['message'] ?? 'Unknown error';
        throw new Exception("Gemini API error: {$errorMsg}");
    }

    // Extract text from response
    $text = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
    
    if (empty($text)) {
        // Log the full response for debugging
        throw new Exception("Empty response from Gemini. Full response: " . json_encode($json));
    }

    // Clean and extract number
    // Remove common currency symbols and text
    $clean = preg_replace('/[Rp\.,\s]/i', '', $text);
    
    // Try to find any number
    if (preg_match('/(\d+)/', $clean, $m)) {
        $amount = floatval($m[1]);
        
        // Sanity check: amount should be reasonable (between 1000 and 100000000)
        if ($amount < 100 || $amount > 100000000) {
            throw new Exception("Extracted amount seems unreasonable: {$amount}. Original text: '{$text}'");
        }
        
        return $amount;
    }

    throw new Exception("Could not parse total from Gemini response. Text: '{$text}'");
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
    if (is_postgres()) {
        // PostgreSQL syntax
        $stmt = $db->prepare("
            INSERT INTO channel_state (channel_id, last_message_id)
            VALUES (:c, :m)
            ON CONFLICT(channel_id) DO UPDATE SET last_message_id = :m2
        ");
    } else {
        // SQLite syntax
        $stmt = $db->prepare("
            INSERT INTO channel_state (channel_id, last_message_id)
            VALUES (:c, :m)
            ON CONFLICT(channel_id) DO UPDATE SET last_message_id = :m2
        ");
    }
    $stmt->execute([
        ':c'  => $channelId,
        ':m'  => $lastMessageId,
        ':m2' => $lastMessageId,
    ]);
}

// Process new messages from Discord (used by cron and interactive commands)
function process_new_messages($db, $channelId) {
    if (!DISCORD_BOT_TOKEN) {
        return ['error' => 'DISCORD_BOT_TOKEN is not set'];
    }

    // Get last processed message
    $state = get_channel_state($db, $channelId);
    $after = $state['last_message_id'] ?? null;

    $url = "https://discord.com/api/v10/channels/{$channelId}/messages?limit=50";
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
    curl_close($ch);

    $messages = json_decode($resp, true);
    if (!is_array($messages)) {
        return ['error' => 'Invalid response from Discord'];
    }

    if (empty($messages)) {
        return ['processed' => 0];
    }

    // Reverse chronological → oldest first
    $messages = array_reverse($messages);

    $processed = 0;
    $lastMsgId = $after;

    foreach ($messages as $msg) {
        $msgId = $msg['id'];
        $lastMsgId = $msgId;

        // Check if there's an active checkpoint
        $active = get_active_checkpoint($db, $channelId);
        if (!$active) {
            set_channel_last_message($db, $channelId, $msgId);
            continue;
        }

        // Check for images
        $attachments = $msg['attachments'] ?? [];
        foreach ($attachments as $att) {
            if (strpos($att['content_type'] ?? '', 'image/') === 0) {
                $imageUrl = $att['url'];
                try {
                    $amount = get_total_from_receipt_gemini($imageUrl);
                    add_receipt($db, [
                        ':user_id'       => $msg['author']['id'],
                        ':user_name'     => $msg['author']['username'],
                        ':channel_id'    => $channelId,
                        ':checkpoint_id' => $active['id'],
                        ':message_id'    => $msgId,
                        ':image_url'     => $imageUrl,
                        ':amount'        => $amount,
                        ':created_at'    => date('c')
                    ]);
                    $processed++;
                } catch (Exception $e) {
                    error_log("Failed to process receipt {$imageUrl}: " . $e->getMessage());
                }
            }
        }

        set_channel_last_message($db, $channelId, $msgId);
    }

    return ['processed' => $processed, 'last_message_id' => $lastMsgId];
}
