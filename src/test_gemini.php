<?php
// Test Gemini API with a specific image URL
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

// Security check
$expectedSecret = getenv('CRON_SECRET') ?: 'change-me-in-production';
$providedSecret = $_GET['secret'] ?? '';

if ($providedSecret !== $expectedSecret) {
    http_response_code(403);
    die('Forbidden');
}

$imageUrl = $_GET['image'] ?? '';

if (empty($imageUrl)) {
    http_response_code(400);
    die('Missing image parameter. Usage: ?secret=XXX&image=URL');
}

$result = [
    'image_url' => $imageUrl,
    'gemini_model' => GEMINI_MODEL,
    'gemini_api_key_set' => !empty(GEMINI_API_KEY),
];

try {
    // Download image
    $imageData = @file_get_contents($imageUrl);
    if ($imageData === false) {
        throw new Exception("Failed to download image");
    }
    
    $result['image_size'] = strlen($imageData);
    $imageBase64 = base64_encode($imageData);
    
    // Call Gemini
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
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    $result['http_code'] = $httpCode;
    $result['raw_response'] = $res;
    
    $json = json_decode($res, true);
    $result['parsed_response'] = $json;
    
    if (isset($json['candidates'][0]['content']['parts'][0]['text'])) {
        $text = $json['candidates'][0]['content']['parts'][0]['text'];
        $result['extracted_text'] = $text;
        
        // Try to parse
        $clean = preg_replace('/[Rp\.,\s]/i', '', $text);
        $result['cleaned_text'] = $clean;
        
        if (preg_match('/(\d+)/', $clean, $m)) {
            $result['parsed_amount'] = floatval($m[1]);
        } else {
            $result['parse_error'] = 'No number found in text';
        }
    } else {
        $result['error'] = 'No text found in Gemini response';
    }
    
    // Try actual function
    try {
        $amount = get_total_from_receipt_gemini($imageUrl);
        $result['function_result'] = $amount;
    } catch (Exception $e) {
        $result['function_error'] = $e->getMessage();
    }
    
} catch (Exception $e) {
    $result['error'] = $e->getMessage();
}

header('Content-Type: application/json');
echo json_encode($result, JSON_PRETTY_PRINT);
