<?php
/**
 * Autentizace - HMAC-SHA256 tokeny (kompatibilní s Node.js backendem)
 */

class Auth
{
    private string $secret;
    private int $tokenTtl;

    public function __construct(string $secret, int $tokenTtl = 43200)
    {
        $this->secret   = $secret;
        $this->tokenTtl = $tokenTtl;
    }

    /**
     * Vytvoří podepsaný token
     */
    public function signToken(array $payload): string
    {
        $header = self::base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $body   = self::base64UrlEncode(json_encode($payload));
        $unsigned = "{$header}.{$body}";
        $signature = self::base64UrlEncode(
            hash_hmac('sha256', $unsigned, $this->secret, true)
        );
        return "{$unsigned}.{$signature}";
    }

    /**
     * Ověří token a vrátí payload, nebo null
     */
    public function verifyToken(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$header, $body, $signature] = $parts;
        $unsigned = "{$header}.{$body}";
        $expected = self::base64UrlEncode(
            hash_hmac('sha256', $unsigned, $this->secret, true)
        );

        if (!hash_equals($expected, $signature)) {
            return null;
        }

        $payload = json_decode(self::base64UrlDecode($body), true);
        if (!$payload || empty($payload['sub']) || empty($payload['role']) || empty($payload['exp'])) {
            return null;
        }

        // Kontrola expirace
        if ((int) $payload['exp'] <= time()) {
            return null;
        }

        // Superadmin nemusí mít companyId
        $role = strtolower(trim($payload['role']));
        if ($role !== 'superadmin' && empty($payload['companyId'])) {
            return null;
        }

        return $payload;
    }

    /**
     * Vytvoří admin token
     */
    public function createAdminToken(array $user): string
    {
        $role = $user['role'];
        $exp  = time() + $this->tokenTtl;

        return $this->signToken([
            'sub'       => (int) $user['id'],
            'companyId' => ($role === 'superadmin' && empty($user['company_id']))
                ? null : (int) $user['company_id'],
            'role'      => $role,
            'exp'       => $exp,
        ]);
    }

    /**
     * Vytvoří hráčský token
     */
    public function createPlayerToken(array $user): string
    {
        $exp = time() + $this->tokenTtl;
        return $this->signToken([
            'sub'       => (int) $user['id'],
            'companyId' => (int) $user['company_id'],
            'role'      => 'player',
            'exp'       => $exp,
        ]);
    }

    /**
     * Extrahuje Bearer token z Authorization hlavičky.
     * Zkouší více zdrojů (nginx často maže HTTP_AUTHORIZATION).
     */
    public static function extractBearerToken(): string
    {
        // 1. Standardní (Apache s .htaccess fixem, nebo nginx co to nechá projít)
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        
        // 2. REDIRECT_ prefix (některé nginx/CGI konfigurace)
        if (!$header) {
            $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        }
        
        // 3. apache_request_headers (fallback pro Apache)
        if (!$header && function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        }
        
        // 4. Zkusíme X-Authorization (custom header, nginx obvykle nechává projít)
        if (!$header) {
            $header = $_SERVER['HTTP_X_AUTHORIZATION'] ?? '';
        }
        
        // 5. Query parametr ?_token=... (poslední záchrana pro nginx)
        if (!$header) {
            $tokenFromQuery = $_GET['_token'] ?? '';
            if ($tokenFromQuery) {
                return $tokenFromQuery;
            }
        }

        if ($header && stripos($header, 'Bearer ') === 0) {
            return trim(substr($header, 7));
        }
        return '';
    }

    // --- helpers ---

    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
