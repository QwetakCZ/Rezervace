<?php
declare(strict_types=1);

/**
 * SmsManager JSON API v2 integration.
 * API keys are encrypted at rest with a key derived from the application secret.
 */
class SmsManagerClient
{
    private const ENDPOINT = 'https://api.smsmngr.com/v2/message';
    public const DEFAULT_CONFIRMATION_TEMPLATE = 'Rezervace v {{companyName}} je potvrzena: {{date}} {{time}}, {{resource}}. Dekujeme.';

    private string $encryptionKey;

    public function __construct(string $applicationSecret)
    {
        $this->encryptionKey = hash('sha256', 'smsmanager|' . $applicationSecret, true);
    }

    public function encryptApiKey(string $apiKey): string
    {
        $apiKey = trim($apiKey);
        if ($apiKey === '') {
            return '';
        }

        $iv = random_bytes(12);
        $tag = '';
        $encrypted = openssl_encrypt(
            $apiKey,
            'aes-256-gcm',
            $this->encryptionKey,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            'rezervace-smsmanager'
        );
        if ($encrypted === false) {
            throw new RuntimeException('API klíč SMS brány se nepodařilo bezpečně uložit.');
        }

        return 'v1.' . rtrim(strtr(base64_encode($iv . $tag . $encrypted), '+/', '-_'), '=');
    }

    public function decryptApiKey(string $storedValue): string
    {
        if (strpos($storedValue, 'v1.') !== 0) {
            return '';
        }

        $encoded = substr($storedValue, 3);
        $encoded .= str_repeat('=', (4 - strlen($encoded) % 4) % 4);
        $raw = base64_decode(strtr($encoded, '-_', '+/'), true);
        if ($raw === false || strlen($raw) < 29) {
            return '';
        }

        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $ciphertext = substr($raw, 28);
        $plain = openssl_decrypt(
            $ciphertext,
            'aes-256-gcm',
            $this->encryptionKey,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            'rezervace-smsmanager'
        );

        return $plain === false ? '' : $plain;
    }

    public function maskApiKey(string $storedValue): string
    {
        $plain = $this->decryptApiKey($storedValue);
        if ($plain === '') {
            return '';
        }
        return '••••' . substr($plain, -4);
    }

    public static function normalizePhone(string $phone): string
    {
        $phone = trim($phone);
        if ($phone === '') {
            return '';
        }

        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (strpos($digits, '00') === 0) {
            $digits = substr($digits, 2);
        }
        if (strlen($digits) === 9) {
            $digits = '420' . $digits;
        }

        return preg_match('/^[1-9]\d{7,14}$/', $digits) ? $digits : '';
    }

    public static function renderTemplate(string $template, array $variables): string
    {
        $rendered = strtr($template, $variables);
        $rendered = preg_replace('/\s+/', ' ', trim($rendered)) ?? trim($rendered);
        return function_exists('mb_substr') ? mb_substr($rendered, 0, 600) : substr($rendered, 0, 600);
    }

    public function send(
        int $companyId,
        int $reservationId,
        string $encryptedApiKey,
        string $phone,
        string $message,
        string $type = 'confirmation'
    ): array {
        $normalizedPhone = self::normalizePhone($phone);
        if ($normalizedPhone === '') {
            $result = ['status' => 'skipped', 'error' => 'Zákazník nemá platné telefonní číslo.'];
            $this->log($companyId, $reservationId, $phone, $type, $message, $result);
            return $result;
        }

        $apiKey = $this->decryptApiKey($encryptedApiKey);
        if ($apiKey === '') {
            $result = ['status' => 'failed', 'error' => 'Uložený API klíč SMS brány nelze načíst.'];
            $this->log($companyId, $reservationId, $normalizedPhone, $type, $message, $result);
            return $result;
        }
        if (!function_exists('curl_init')) {
            $result = ['status' => 'failed', 'error' => 'Na serveru není dostupné rozšíření cURL.'];
            $this->log($companyId, $reservationId, $normalizedPhone, $type, $message, $result);
            return $result;
        }

        $payload = json_encode([
            'body' => $message,
            'to' => [['phone_number' => $normalizedPhone]],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $ch = curl_init(self::ENDPOINT);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'x-api-key: ' . $apiKey,
            ],
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 12,
        ]);

        $responseBody = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $decoded = is_string($responseBody) ? json_decode($responseBody, true) : null;
        $accepted = is_array($decoded) ? ($decoded['accepted'][0] ?? null) : null;
        if ($httpCode >= 200 && $httpCode < 300 && is_array($accepted) && !empty($accepted['message_id'])) {
            $result = [
                'status' => 'accepted',
                'requestId' => (string)($decoded['request_id'] ?? ''),
                'messageId' => (string)$accepted['message_id'],
            ];
            $this->log($companyId, $reservationId, $normalizedPhone, $type, $message, $result);
            return $result;
        }

        $error = $curlError ?: 'SmsManager požadavek nebyl přijat.';
        if (is_array($decoded) && !empty($decoded['rejected'])) {
            $error .= ' ' . json_encode($decoded['rejected'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } elseif ($httpCode > 0) {
            $error .= ' HTTP ' . $httpCode . '.';
        }
        $result = [
            'status' => $httpCode >= 200 && $httpCode < 300 ? 'rejected' : 'failed',
            'requestId' => is_array($decoded) ? (string)($decoded['request_id'] ?? '') : '',
            'error' => $error,
        ];
        $this->log($companyId, $reservationId, $normalizedPhone, $type, $message, $result);
        return $result;
    }

    private function log(
        int $companyId,
        int $reservationId,
        string $phone,
        string $type,
        string $message,
        array $result
    ): void {
        try {
            DB::exec(
                'INSERT INTO sms_logs (company_id,reservation_id,recipient_phone,type,message,delivery_status,request_id,message_id,error_message) VALUES (?,?,?,?,?,?,?,?,?)',
                [
                    $companyId,
                    $reservationId,
                    $phone,
                    $type,
                    $message,
                    (string)($result['status'] ?? 'failed'),
                    ($result['requestId'] ?? '') ?: null,
                    ($result['messageId'] ?? '') ?: null,
                    ($result['error'] ?? '') ?: null,
                ]
            );
        } catch (Throwable $e) {
            // Log nesmí zablokovat schválení rezervace.
        }
    }
}
