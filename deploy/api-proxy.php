<?php
/**
 * PHP Proxy pro Node.js backend přes Unix socket
 * Umístění: do webového adresáře subdomény (vedle index.html)
 */

// === CORS hlavičky - VŽDY jako první ===
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 86400');

// === OPTIONS preflight - OKAMŽITĚ odpovědět bez volání backendu ===
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// === Unix socket cesta (musí souhlasit s SOCKET_PATH v .env backendu) ===
$socketPath = '/data/c/7/c764ba13-897c-4f1f-8815-8089a472d993/rezervace.sock';

// Celá request URI včetně query stringu
$requestUri = $_SERVER['REQUEST_URI'];
$url = 'http://localhost' . $requestUri;

// Předat všechny hlavičky kromě Host a Connection
$headers = [];
foreach (getallheaders() as $name => $value) {
    $lower = strtolower($name);
    if ($lower === 'host') continue;
    if ($lower === 'connection') continue;
    if ($lower === 'origin') continue;
    $headers[] = "$name: $value";
}

$method = $_SERVER['REQUEST_METHOD'];
$body   = file_get_contents('php://input');

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_UNIX_SOCKET_PATH, $socketPath);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE']) && strlen($body) > 0) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response   = curl_exec($ch);
$httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$curlError  = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Backend nedostupný: ' . $curlError]);
    exit;
}

// Oddělit hlavičky od těla
$responseBody = substr($response, $headerSize);

// Předat status kód
http_response_code($httpCode);

// Předat Content-Type z backendu
foreach (explode("\r\n", substr($response, 0, $headerSize)) as $header) {
    if (preg_match('/^Content-Type:\s*(.+)$/i', $header, $m)) {
        header('Content-Type: ' . trim($m[1]), true);
        break;
    }
}

echo $responseBody;
