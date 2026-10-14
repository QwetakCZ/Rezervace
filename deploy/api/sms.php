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
    public const DEFAULT_ADMIN_NOTIFICATION_TEMPLATE = 'Nova rezervace v {{companyName}}: {{firstName}} {{lastName}}, {{weekday}} {{date}} {{time}}, {{resource}}. Ceka na schvaleni.';

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
            $result = ['status' => 'skipped', 'error' => 'Příjemce nemá platné telefonní číslo.'];
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

    /** Nová zákaznická rezervace: nezávislé na potvrzovací SMS a e-mailových preferencích. */
    public function sendAdminNewReservation(int $companyId, int $reservationId): array
    {
        $settings = DB::queryOne('SELECT sms_admin_notification_enabled,sms_admin_notification_template,sms_admin_recipient_ids,sms_api_key_encrypted FROM company_booking_settings WHERE company_id=?', [$companyId]);
        if (empty($settings['sms_admin_notification_enabled']) || empty($settings['sms_api_key_encrypted'])) return [];
        $ids = json_decode((string)($settings['sms_admin_recipient_ids'] ?? ''), true);
        if (!is_array($ids) || !$ids) return [];
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($id) => $id > 0)));
        if (!$ids) return [];
        $reservation = DB::queryOne("SELECT r.customer_first_name,r.customer_last_name,r.customer_email,r.customer_phone,r.total_price,c.name AS company_name FROM reservations r JOIN companies c ON c.id=r.company_id WHERE r.id=? AND r.company_id=? AND r.booking_type='customer' AND r.status IN ('pending','confirmed')", [$reservationId, $companyId]);
        if (!$reservation) return [];
        $slots = DB::query('SELECT s.date,s.time_start,s.time_end,r.name AS resource_name FROM reservation_slots s JOIN resources r ON r.id=s.resource_id WHERE s.reservation_id=? ORDER BY s.date,s.time_start', [$reservationId]);
        if (!$slots) return [];
        $date = (string)$slots[0]['date'];
        $dateObject = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        $times = Mailer::timeVariables(['detailSlots' => $slots]);
        $template = trim((string)($settings['sms_admin_notification_template'] ?? '')) ?: self::DEFAULT_ADMIN_NOTIFICATION_TEMPLATE;
        $message = self::renderTemplate($template, [
            '{{companyName}}' => (string)$reservation['company_name'],
            '{{firstName}}' => (string)$reservation['customer_first_name'],
            '{{lastName}}' => (string)$reservation['customer_last_name'],
            '{{email}}' => (string)$reservation['customer_email'],
            '{{phone}}' => (string)$reservation['customer_phone'],
            '{{date}}' => $dateObject ? $dateObject->format('d.m.Y') : $date,
            '{{weekday}}' => Mailer::weekdayName($date),
            '{{time}}' => $times['time'],
            '{{timeRange}}' => $times['timeRange'],
            '{{timeFrom}}' => $times['timeFrom'],
            '{{timeTo}}' => $times['timeTo'],
            '{{resource}}' => implode(', ', array_unique(array_column($slots, 'resource_name'))),
            '{{reservationId}}' => (string)$reservationId,
            '{{totalPrice}}' => number_format((float)$reservation['total_price'], 0, ',', ' '),
        ]);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $admins = DB::query("SELECT id,phone FROM users WHERE company_id=? AND role='admin' AND id IN ($placeholders) ORDER BY id", array_merge([$companyId], $ids));
        $results = []; $sentPhones = [];
        foreach ($admins as $admin) {
            $phone = (string)($admin['phone'] ?? '');
            $normalized = self::normalizePhone($phone);
            if ($normalized !== '' && isset($sentPhones[$normalized])) continue;
            if ($normalized !== '') $sentPhones[$normalized] = true;
            try {
                $result = $this->send($companyId, $reservationId, (string)$settings['sms_api_key_encrypted'], $phone, $message, 'admin_new_reservation');
            } catch (Throwable $e) {
                $result = ['status' => 'failed', 'error' => 'SMS správci se nepodařilo odeslat.'];
                $this->log($companyId, $reservationId, $phone, 'admin_new_reservation', $message, $result);
            }
            $results[] = ['adminId' => (int)$admin['id']] + $result;
        }
        return $results;
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
