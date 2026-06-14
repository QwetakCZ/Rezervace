<?php
/**
 * Odesílání emailů přes PHP mail() (Active24)
 */

class Mailer
{
    private string $fromEmail;
    private string $fromName;

    public function __construct(string $fromEmail = 'info@rezervace.tt-denik.cz', string $fromName = 'Rezervace TT')
    {
        $this->fromEmail = $fromEmail;
        $this->fromName  = $fromName;
    }

    /**
     * Odešle email a zaloguje do DB
     */
    public function send(string $to, string $subject, string $bodyHtml, int $companyId, ?int $reservationId, string $type, string $recipientName = ''): bool
    {
        $messageId = sprintf('<%s.%s@%s>', $type, time(), parse_url('https://rezervace.tt-denik.cz', PHP_URL_HOST));
        $headers = [
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            'From: ' . $this->fromName . ' <' . $this->fromEmail . '>',
            'Reply-To: ' . $this->fromEmail,
            'Return-Path: ' . $this->fromEmail,
            'Message-ID: ' . $messageId,
            'X-Mailer: RezervacniSystem/1.0',
            'X-Priority: 3',
            'Organization: Rezervace TT',
        ];

        $sent = @mail($to, $subject, $bodyHtml, implode("\r\n", $headers));

        // Zalogovat (i když se nepovedlo — pro přehled)
        try {
            DB::exec(
                'INSERT INTO email_logs (company_id, reservation_id, recipient_email, recipient_name, type, subject) VALUES (?,?,?,?,?,?)',
                [$companyId, $reservationId, $to, $recipientName ?: '', $type, $subject]
            );
        } catch (\Throwable $e) {
            // tabulka nemusí ještě existovat — nevadí
        }

        return $sent;
    }

    /**
     * Email pro adminy — notifikace o nové rezervaci
     */
    public function sendAdminNotification(array $company, array $admins, array $reservation, int $reservationId): void
    {
        $subject = "Nová rezervace – {$company['name']}";
        $body = $this->buildAdminEmail($company, $reservation);

        foreach ($admins as $admin) {
            if (!empty($admin['email'])) {
                $name = trim(($admin['first_name'] ?? '') . ' ' . ($admin['last_name'] ?? ''));
                $this->send($admin['email'], $subject, $body, (int)$company['id'], $reservationId, 'admin_notification', $name);
            }
        }
    }

    /**
     * Email pro zákazníka — shrnutí rezervace
     */
    public function sendCustomerSummary(array $company, array $customer, array $reservation, int $reservationId): void
    {
        $cid = (int)$company['id'];

        // Zkusit DB šablonu
        $tpl = $this->getTemplate($cid, 'customer_summary');
        if ($tpl) {
            $slots = $reservation['slotStarts'] ?? [];
            $vars = [
                'firstName' => $customer['firstName'] ?? '',
                'lastName' => $customer['lastName'] ?? '',
                'email' => $customer['email'] ?? '',
                'phone' => $customer['phone'] ?? '',
                'companyName' => $company['name'] ?? '',
                'date' => $reservation['date'] ?? '',
                'slots' => implode(', ', array_map(fn($s) => substr($s, 0, 5), $slots)),
                'slotCount' => (string)count($slots),
                'totalPrice' => number_format((float)($reservation['totalPrice'] ?? 0), 0, ',', ' '),
                'note' => $reservation['note'] ?? '',
            ];
            $subject = $this->replaceVars($tpl['subject'], $vars);
            $body = $this->replaceVars($tpl['bodyHtml'], $vars);
        } else {
            $subject = "Shrnutí rezervace – {$company['name']}";
            $body = $this->buildCustomerEmail($company, $customer, $reservation);
        }

        $name = trim(($customer['firstName'] ?? '') . ' ' . ($customer['lastName'] ?? ''));
        $this->send($customer['email'], $subject, $body, $cid, $reservationId, 'customer_summary', $name);
    }

    /**
     * Email pro zákazníka — potvrzení rezervace (po schválení adminem)
     */
    public function sendConfirmation(array $company, array $customer, array $reservation, int $reservationId): void
    {
        $cid = (int)$company['id'];

        // Zkusit DB šablonu
        $tpl = $this->getTemplate($cid, 'confirmation');
        if ($tpl) {
            $slots = $reservation['slotStarts'] ?? [];
            $vars = [
                'firstName' => $customer['firstName'] ?? '',
                'lastName' => $customer['lastName'] ?? '',
                'email' => $customer['email'] ?? '',
                'phone' => $customer['phone'] ?? '',
                'companyName' => $company['name'] ?? '',
                'date' => $reservation['date'] ?? '',
                'slots' => implode(', ', array_map(fn($s) => substr($s, 0, 5), $slots)),
                'slotCount' => (string)count($slots),
                'totalPrice' => number_format((float)($reservation['totalPrice'] ?? 0), 0, ',', ' '),
                'note' => $reservation['note'] ?? '',
            ];
            $subject = $this->replaceVars($tpl['subject'], $vars);
            $body = $this->replaceVars($tpl['bodyHtml'], $vars);
        } else {
            $subject = "Rezervace potvrzena – {$company['name']}";
            $body = $this->buildConfirmationEmail($company, $customer, $reservation);
        }

        $name = trim(($customer['firstName'] ?? '') . ' ' . ($customer['lastName'] ?? ''));
        $this->send($customer['email'], $subject, $body, $cid, $reservationId, 'confirmation', $name);
    }

    /**
     * Email pro zákazníka — storno rezervace
     */
    public function sendCancellation(array $company, array $customer, array $reservation, int $reservationId, string $reason = ''): void
    {
        $cid = (int)$company['id'];

        $tpl = $this->getTemplate($cid, 'cancellation');
        if ($tpl) {
            $slots = $reservation['slotStarts'] ?? [];
            $vars = [
                'firstName' => $customer['firstName'] ?? '',
                'lastName' => $customer['lastName'] ?? '',
                'email' => $customer['email'] ?? '',
                'phone' => $customer['phone'] ?? '',
                'companyName' => $company['name'] ?? '',
                'date' => $reservation['date'] ?? '',
                'slots' => implode(', ', array_map(fn($s) => substr($s, 0, 5), $slots)),
                'slotCount' => (string)count($slots),
                'totalPrice' => number_format((float)($reservation['totalPrice'] ?? 0), 0, ',', ' '),
                'note' => $reservation['note'] ?? '',
                'reason' => $reason ?: 'Zrušeno administrátorem',
            ];
            $subject = $this->replaceVars($tpl['subject'], $vars);
            $body = $this->replaceVars($tpl['bodyHtml'], $vars);
        } else {
            $subject = "Rezervace stornována – {$company['name']}";
            $body = $this->buildCancellationEmail($company, $customer, $reservation, $reason);
        }

        $name = trim(($customer['firstName'] ?? '') . ' ' . ($customer['lastName'] ?? ''));
        $this->send($customer['email'], $subject, $body, $cid, $reservationId, 'cancellation', $name);
    }

    // --- HTML šablony ---

    /**
     * Vrátí [subject, bodyHtml] z DB šablony, nebo null pokud neexistuje
     */
    private function getTemplate(int $companyId, string $type): ?array
    {
        try {
            $row = DB::queryOne(
                'SELECT subject, body_html FROM email_templates WHERE company_id=? AND type=? LIMIT 1',
                [$companyId, $type]
            );
            if ($row && !empty($row['body_html'])) {
                return ['subject' => $row['subject'], 'bodyHtml' => $row['body_html']];
            }
        } catch (\Throwable $e) {
            // tabulka nemusí existovat
        }
        return null;
    }

    /**
     * Nahradí proměnné v šabloně {{variable}}
     */
    private function replaceVars(string $html, array $vars): string
    {
        foreach ($vars as $key => $value) {
            $html = str_replace('{{' . $key . '}}', htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'), $html);
        }
        return $html;
    }

    private function style(): string
    {
        return 'body{font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;margin:0;padding:20px}'
            . '.card{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}'
            . 'h2{color:#1a1a1a;margin:0 0 8px;font-size:20px}'
            . 'h3{color:#444;margin:16px 0 8px;font-size:15px;border-bottom:1px solid #eee;padding-bottom:6px}'
            . 'p{margin:4px 0;color:#555;font-size:14px;line-height:1.6}'
            . '.label{color:#888;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}'
            . '.price{font-size:18px;font-weight:700;color:#10b981}'
            . '.note{background:#fff8e1;border-left:4px solid #ffc107;padding:12px;margin:12px 0;font-size:13px;color:#795548}'
            . '.footer{margin-top:24px;padding-top:16px;border-top:1px solid #eee;color:#aaa;font-size:12px}'
            . 'table{width:100%;border-collapse:collapse;margin:8px 0}'
            . 'td,th{padding:8px 12px;text-align:left;border-bottom:1px solid #eee;font-size:14px}'
            . 'th{color:#888;font-weight:600;font-size:12px;text-transform:uppercase}';
    }

    private function buildAdminEmail(array $company, array $reservation): string
    {
        $s = $this->style();
        $slots = $reservation['slotStarts'] ?? [];
        $slotList = implode(', ', array_map(fn($s) => substr($s, 0, 5), $slots));
        $count = count($slots);

        return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>{$s}</style></head><body>"
            . "<div class='card'>"
            . "<h2>📋 Nová rezervace</h2>"
            . "<p><strong>{$company['name']}</strong></p>"
            . "<hr style='border:0;border-top:1px solid #eee;margin:12px 0'>"
            . "<table>"
            . "<tr><th>Zákazník</th><td>{$reservation['firstName']} {$reservation['lastName']}</td></tr>"
            . "<tr><th>E-mail</th><td>{$reservation['email']}</td></tr>"
            . "<tr><th>Telefon</th><td>" . ($reservation['phone'] ?: '—') . "</td></tr>"
            . "<tr><th>Datum</th><td>{$reservation['date']}</td></tr>"
            . "<tr><th>Časy</th><td>{$slotList} ({$count}x 30 min)</td></tr>"
            . "<tr><th>Cena</th><td class='price'>" . number_format($reservation['totalPrice'], 0, ',', ' ') . " Kč</td></tr>"
            . "</table>"
            . ($reservation['note'] ? "<div class='note'>📝 Poznámka: {$reservation['note']}</div>" : "")
            . "<p style='margin-top:12px;color:#888;font-size:13px'>Přihlaste se do <a href='https://rezervace.tt-denik.cz/admin/dashboard'>admin dashboardu</a> pro správu rezervací.</p>"
            . "<div class='footer'>Tento email byl vygenerován automaticky rezervačním systémem.</div>"
            . "</div></body></html>";
    }

    private function buildCustomerEmail(array $company, array $customer, array $reservation): string
    {
        $s = $this->style();
        $slots = $reservation['slotStarts'] ?? [];
        $slotList = implode(', ', array_map(fn($s) => substr($s, 0, 5), $slots));
        $count = count($slots);

        return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>{$s}</style></head><body>"
            . "<div class='card'>"
            . "<h2>🏓 Rezervace přijata</h2>"
            . "<p>Děkujeme, <strong>{$customer['firstName']}</strong>! Vaše rezervace v <strong>{$company['name']}</strong> byla přijata.</p>"
            . "<hr style='border:0;border-top:1px solid #eee;margin:12px 0'>"
            . "<table>"
            . "<tr><th>Datum</th><td>{$reservation['date']}</td></tr>"
            . "<tr><th>Časy</th><td>{$slotList}</td></tr>"
            . "<tr><th>Počet bloků</th><td>{$count} × 30 min</td></tr>"
            . "<tr><th>Cena celkem</th><td class='price'>" . number_format($reservation['totalPrice'], 0, ',', ' ') . " Kč</td></tr>"
            . "</table>"
            . "<div class='note'>⏳ Po schválení administrátorem Vám přijde potvrzovací email.</div>"
            . ($reservation['note'] ? "<p style='color:#888;font-size:13px'>📝 Vaše poznámka: {$reservation['note']}</p>" : "")
            . "<div class='footer'>Rezervační systém • {$company['name']}</div>"
            . "</div></body></html>";
    }

    private function buildConfirmationEmail(array $company, array $customer, array $reservation): string
    {
        $s = $this->style();
        $slots = $reservation['slotStarts'] ?? [];
        $slotList = implode(', ', array_map(fn($s) => substr($s, 0, 5), $slots));

        return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>{$s}</style></head><body>"
            . "<div class='card'>"
            . "<h2>✅ Rezervace potvrzena</h2>"
            . "<p>Vaše rezervace v <strong>{$company['name']}</strong> byla <strong>potvrzena</strong> administrátorem.</p>"
            . "<hr style='border:0;border-top:1px solid #eee;margin:12px 0'>"
            . "<table>"
            . "<tr><th>Datum</th><td>{$reservation['date']}</td></tr>"
            . "<tr><th>Časy</th><td>{$slotList}</td></tr>"
            . "</table>"
            . "<p style='margin-top:16px;color:#10b981;font-weight:600'>Těšíme se na Vás! 🏓</p>"
            . "<div class='footer'>Rezervační systém • {$company['name']}</div>"
            . "</div></body></html>";
    }

    private function buildCancellationEmail(array $company, array $customer, array $reservation, string $reason = ''): string
    {
        $s = $this->style();
        $slots = $reservation['slotStarts'] ?? [];
        $slotList = implode(', ', array_map(fn($s) => substr($s, 0, 5), $slots));

        return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>{$s}</style></head><body>"
            . "<div class='card'>"
            . "<h2>❌ Rezervace stornována</h2>"
            . "<p>Vaše rezervace v <strong>{$company['name']}</strong> byla <strong>zrušena</strong> administrátorem.</p>"
            . "<hr style='border:0;border-top:1px solid #eee;margin:12px 0'>"
            . "<table>"
            . "<tr><th>Datum</th><td>{$reservation['date']}</td></tr>"
            . "<tr><th>Časy</th><td>{$slotList}</td></tr>"
            . "</table>"
            . ($reason ? "<div class='note'>📝 Důvod: {$reason}</div>" : "")
            . "<p style='margin-top:16px;color:#e11d48;font-weight:600'>Pokud máte dotazy, kontaktujte nás.</p>"
            . "<div class='footer'>Rezervační systém • {$company['name']}</div>"
            . "</div></body></html>";
    }
}
