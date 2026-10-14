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

    /** Vrátí český název dne v týdnu pro datum rezervace. */
    public static function weekdayName(string $date): string
    {
        $raw = trim($date);
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $raw);
        if (!$parsed || $parsed->format('Y-m-d') !== $raw) {
            return '';
        }

        return [
            1 => 'pondělí',
            2 => 'úterý',
            3 => 'středa',
            4 => 'čtvrtek',
            5 => 'pátek',
            6 => 'sobota',
            7 => 'neděle',
        ][(int)$parsed->format('N')] ?? '';
    }

    /** Souvislé intervaly, včetně skutečného konce posledního bloku. */
    public static function timeVariables(array $reservation): array
    {
        $rows = $reservation['detailSlots'] ?? [];
        if (!$rows) {
            foreach ($reservation['slotStarts'] ?? [] as $start) {
                $date = (string)($reservation['date'] ?? '');
                $end = DateTimeImmutable::createFromFormat('!H:i:s', strlen($start) === 5 ? $start.':00' : $start);
                if (!$end) continue;
                $rows[] = ['date'=>$date, 'time_start'=>$start, 'time_end'=>$end->modify('+'.max(1,(int)($reservation['slotMinutes'] ?? 30)).' minutes')->format('H:i:s')];
            }
        }
        $days = [];
        foreach ($rows as $row) $days[$row['date'] ?? ''][] = [substr($row['time_start'],0,5), substr($row['time_end'],0,5)];
        ksort($days);
        $ranges = []; $first = ''; $last = '';
        foreach ($days as $date=>$intervals) {
            usort($intervals, fn($a,$b)=>strcmp($a[0],$b[0]));
            $merged = [];
            foreach ($intervals as [$start,$end]) {
                $index = count($merged)-1;
                if ($index >= 0 && $start <= $merged[$index][1]) $merged[$index][1] = max($merged[$index][1],$end);
                else $merged[] = [$start,$end];
            }
            foreach ($merged as [$start,$end]) {
                if ($first === '') $first = $start;
                $last = $end;
                $ranges[] = (count($days)>1 ? $date.' ' : '').$start.' - '.$end;
            }
        }
        return ['time'=>implode(', ',$ranges), 'timeRange'=>implode(', ',$ranges), 'timeFrom'=>$first, 'timeTo'=>$last];
    }

    /**
     * Odešle email a zaloguje do DB
     */
    public function send(string $to, string $subject, string $bodyHtml, int $companyId, ?int $reservationId, string $type, string $recipientName = '', ?string $replyTo = null): bool
    {
        $messageId = sprintf('<%s.%s@%s>', $type, time(), parse_url('https://rezervace.tt-denik.cz', PHP_URL_HOST));
        $headers = [
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            'From: ' . $this->fromName . ' <' . $this->fromEmail . '>',
            'Reply-To: ' . ($replyTo && filter_var($replyTo,FILTER_VALIDATE_EMAIL) ? $replyTo : $this->fromEmail),
            'Return-Path: ' . $this->fromEmail,
            'Message-ID: ' . $messageId,
            'X-Mailer: RezervacniSystem/1.0',
            'X-Priority: 3',
            'Organization: Rezervace TT',
        ];

        $sent = @mail($to, $subject, $bodyHtml, implode("\r\n", $headers));
        $deliveryStatus = $sent ? 'sent' : 'failed';
        $errorMessage = $sent ? null : 'PHP mail() vrátil false';

        // Zalogovat (i když se nepovedlo — pro přehled)
        try {
            DB::exec(
                'INSERT INTO email_logs (company_id, reservation_id, recipient_email, recipient_name, type, subject, delivery_status, error_message) VALUES (?,?,?,?,?,?,?,?)',
                [$companyId, $reservationId, $to, $recipientName ?: '', $type, $subject, $deliveryStatus, $errorMessage]
            );
        } catch (\Throwable $e) {
            // tabulka nemusí ještě existovat — nevadí
        }

        return $sent;
    }

    /** Provozní zpráva jednomu příjemci; nesdílí adresy dalších kontaktů. */
    public function sendDirectoryMessage(array $company, array $contact, string $subject, string $message, string $replyTo): bool
    {
        $safe=fn($value)=>htmlspecialchars((string)$value,ENT_QUOTES,'UTF-8');
        $body="<!DOCTYPE html><html><head><meta charset='utf-8'><style>{$this->style()}</style></head><body><div class='card'><h2>".$safe($company['name'])."</h2><div style='color:#333;font-size:15px;line-height:1.6'>".nl2br($safe($message))."</div><div class='footer'>Zpráva od administrátora klubu ".$safe($company['name']).". Odpovědět můžete přímo na tento e-mail.</div></div></body></html>";
        return $this->send($contact['email'],$subject,$body,(int)$company['id'],null,'directory_message',trim($contact['firstName'].' '.$contact['lastName']),$replyTo);
    }

    /**
     * Email pro adminy — notifikace o nové rezervaci
     */
    public function sendAdminNotification(array $company, array $admins, array $reservation, int $reservationId): void
    {
        $subject = "Nová rezervace – {$company['name']}";
        foreach ($admins as $admin) {
            if (!empty($admin['email'])) {
                $ref = $reservation;
                $ref['approveUrl'] = $reservation['adminActions'][(int)$admin['id']]['approve'] ?? '';
                $ref['adminCancelUrl'] = $reservation['adminActions'][(int)$admin['id']]['cancel'] ?? '';
                $body = $this->buildAdminEmail($company, $ref);
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
                'weekday' => self::weekdayName((string)($reservation['date'] ?? '')),
                'slots' => implode(', ', array_map(fn($s) => substr($s, 0, 5), $slots)),
                'slotCount' => (string)count($slots),
                'totalPrice' => number_format((float)($reservation['totalPrice'] ?? 0), 0, ',', ' '),
                'note' => $reservation['note'] ?? '',
                'cancelUrl' => $reservation['cancelUrl'] ?? '',
            ];
            $vars = array_merge($vars, self::timeVariables($reservation));
            $subject = $this->replaceVars($tpl['subject'], $vars);
            $body = $this->replaceVars($tpl['bodyHtml'], $vars);
            // Starší uložené šablony nemusí znát {{cancelUrl}}. Odkaz proto
            // doplníme automaticky, aby storno hosta fungovalo i bez ruční úpravy šablony.
            if (!empty($vars['cancelUrl']) && !str_contains($tpl['bodyHtml'], '{{cancelUrl}}')) {
                $safeCancelUrl = htmlspecialchars((string)$vars['cancelUrl'], ENT_QUOTES, 'UTF-8');
                $cancelLink = "<p style='margin-top:18px'><a href='{$safeCancelUrl}' style='display:inline-block;padding:10px 16px;border-radius:8px;background:#e11d48;color:#fff;text-decoration:none;font-weight:700'>Zrušit rezervaci</a></p>";
                $body = stripos($body, '</body>') !== false
                    ? (string)preg_replace('/<\/body>/i', $cancelLink . '</body>', $body, 1)
                    : $body . $cancelLink;
            }
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
                'weekday' => self::weekdayName((string)($reservation['date'] ?? '')),
                'slots' => implode(', ', array_map(fn($s) => substr($s, 0, 5), $slots)),
                'slotCount' => (string)count($slots),
                'totalPrice' => number_format((float)($reservation['totalPrice'] ?? 0), 0, ',', ' '),
                'note' => $reservation['note'] ?? '',
            ];
            $vars = array_merge($vars, self::timeVariables($reservation));
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
                'weekday' => self::weekdayName((string)($reservation['date'] ?? '')),
                'slots' => implode(', ', array_map(fn($s) => substr($s, 0, 5), $slots)),
                'slotCount' => (string)count($slots),
                'totalPrice' => number_format((float)($reservation['totalPrice'] ?? 0), 0, ',', ' '),
                'note' => $reservation['note'] ?? '',
                'reason' => $reason ?: 'Zrušeno administrátorem',
            ];
            $vars = array_merge($vars, self::timeVariables($reservation));
            $subject = $this->replaceVars($tpl['subject'], $vars);
            $body = $this->replaceVars($tpl['bodyHtml'], $vars);
        } else {
            $subject = "Rezervace stornována – {$company['name']}";
            $body = $this->buildCancellationEmail($company, $customer, $reservation, $reason);
        }

        $name = trim(($customer['firstName'] ?? '') . ' ' . ($customer['lastName'] ?? ''));
        $this->send($customer['email'], $subject, $body, $cid, $reservationId, 'cancellation', $name);
    }

    /** Email při zamítnutí čekající rezervace. */
    public function sendRejection(array $company, array $customer, array $reservation, int $reservationId, string $reason = ''): void
    {
        $cid=(int)$company['id']; $slots=$reservation['slotStarts']??[];
        $vars=[
            'firstName'=>$customer['firstName']??'', 'lastName'=>$customer['lastName']??'',
            'email'=>$customer['email']??'', 'companyName'=>$company['name']??'',
            'date'=>$reservation['date']??'',
            'weekday'=>self::weekdayName((string)($reservation['date']??'')),
            'slots'=>implode(', ',array_map(fn($s)=>substr($s,0,5),$slots)),
            'slotCount'=>(string)count($slots), 'reason'=>$reason?:'Rezervace nebyla schválena',
        ];
        $vars = array_merge($vars, self::timeVariables($reservation));
        $tpl=$this->getTemplate($cid,'rejection');
        if($tpl){$subject=$this->replaceVars($tpl['subject'],$vars);$body=$this->replaceVars($tpl['bodyHtml'],$vars);}
        else{
            $subject="Rezervace zamítnuta – {$company['name']}";
            $safeReason=htmlspecialchars($vars['reason'],ENT_QUOTES,'UTF-8');
            $body="<!DOCTYPE html><html><head><meta charset='utf-8'><style>{$this->style()}</style></head><body><div class='card'><h2>Rezervace nebyla schválena</h2><p>Vaše rezervace v <strong>".htmlspecialchars((string)$company['name'],ENT_QUOTES,'UTF-8')."</strong> byla zamítnuta.</p><div class='note'>Důvod: {$safeReason}</div><div class='footer'>Rezervační systém • ".htmlspecialchars((string)$company['name'],ENT_QUOTES,'UTF-8')."</div></div></body></html>";
        }
        $name=trim(($customer['firstName']??'').' '.($customer['lastName']??''));
        $this->send($customer['email'],$subject,$body,$cid,$reservationId,'rejection',$name);
    }

    /** Potvrzení, že zákazník sám rezervaci zrušil. */
    public function sendCustomerCancellationConfirmation(array $company, array $customer, array $reservation, int $reservationId): void
    {
        $slots=$reservation['slotStarts']??[]; $slotList=implode(', ',array_map(fn($s)=>substr($s,0,5),$slots));
        $companyName=htmlspecialchars((string)($company['name']??''),ENT_QUOTES,'UTF-8');
        $date=htmlspecialchars((string)($reservation['date']??''),ENT_QUOTES,'UTF-8');
        $body="<!DOCTYPE html><html><head><meta charset='utf-8'><style>{$this->style()}</style></head><body><div class='card'><h2>Storno potvrzeno</h2><p>Vaše rezervace v <strong>{$companyName}</strong> byla zrušena a termín je znovu volný.</p><table><tr><th>Datum</th><td>{$date}</td></tr><tr><th>Časy</th><td>".htmlspecialchars($slotList,ENT_QUOTES,'UTF-8')."</td></tr></table><div class='footer'>Rezervační systém • {$companyName}</div></div></body></html>";
        $name=trim(($customer['firstName']??'').' '.($customer['lastName']??''));
        $vars = array_merge(self::timeVariables($reservation), [
            'companyName'=>$company['name'], 'firstName'=>$customer['firstName']??'', 'lastName'=>$customer['lastName']??'',
            'email'=>$customer['email']??'', 'phone'=>$customer['phone']??'', 'date'=>$reservation['date']??'',
            'weekday'=>self::weekdayName((string)($reservation['date']??'')), 'slots'=>$slotList,
            'slotCount'=>(string)count($slots), 'reason'=>'Zrušeno zákazníkem',
        ]);
        $tpl = $this->getTemplate((int)$company['id'], 'customer_cancellation');
        $subject = $tpl ? $this->replaceVars($tpl['subject'],$vars) : "Storno rezervace potvrzeno – {$company['name']}";
        if ($tpl) $body = $this->replaceVars($tpl['bodyHtml'],$vars);
        $this->send($customer['email'],$subject,$body,(int)$company['id'],$reservationId,'customer_cancellation',$name);

        $tpl = $this->getTemplate((int)$company['id'], 'admin_customer_cancellation');
        $subject = $tpl ? $this->replaceVars($tpl['subject'],$vars) : "Zákazník stornoval rezervaci – {$company['name']}";
        $body = $tpl ? $this->replaceVars($tpl['bodyHtml'],$vars) : $this->replaceVars(
            "<!DOCTYPE html><html><head><meta charset='utf-8'><style>{$this->style()}</style></head><body><div class='card'><h2>Zákazník stornoval rezervaci</h2><p>{{firstName}} {{lastName}} ({{email}}) zrušil rezervaci v {{companyName}}.</p><table><tr><th>Datum</th><td>{{weekday}} {{date}}</td></tr><tr><th>Čas</th><td>{{time}}</td></tr></table><p>Termín je opět volný.</p></div></body></html>", $vars);
        $admins = DB::query("SELECT email,first_name,last_name FROM users WHERE company_id=? AND role='admin' AND notify_emails=1", [(int)$company['id']]);
        foreach ($admins as $admin) {
            if (!empty($admin['email'])) $this->send($admin['email'],$subject,$body,(int)$company['id'],$reservationId,'admin_customer_cancellation',trim($admin['first_name'].' '.$admin['last_name']));
        }
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
        $company['name'] = htmlspecialchars((string)$company['name'],ENT_QUOTES,'UTF-8');
        foreach (['firstName','lastName','email','phone','note','date'] as $field) {
            $reservation[$field] = htmlspecialchars((string)($reservation[$field]??''),ENT_QUOTES,'UTF-8');
        }
        $slots = $reservation['slotStarts'] ?? [];
        $slotList = htmlspecialchars(self::timeVariables($reservation)['time'],ENT_QUOTES,'UTF-8');
        $count = count($slots); $slotMinutes=(int)($reservation['slotMinutes']??30);

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
            . "<tr><th>Časy</th><td>{$slotList} ({$count}× {$slotMinutes} min)</td></tr>"
            . "<tr><th>Cena</th><td class='price'>" . number_format($reservation['totalPrice'], 0, ',', ' ') . " Kč</td></tr>"
            . "</table>"
            . ($reservation['note'] ? "<div class='note'>📝 Poznámka: {$reservation['note']}</div>" : "")
            . (!empty($reservation['approveUrl']) ? "<p><a style='display:inline-block;padding:12px;border-radius:8px;background:#10b981;color:#fff;text-decoration:none' href='".htmlspecialchars($reservation['approveUrl'],ENT_QUOTES,'UTF-8')."'>Schválit rezervaci</a> <a style='display:inline-block;padding:12px;border-radius:8px;background:#e11d48;color:#fff;text-decoration:none' href='".htmlspecialchars($reservation['adminCancelUrl'],ENT_QUOTES,'UTF-8')."'>Stornovat rezervaci</a></p>" : '')
            . "<p style='margin-top:12px;color:#888;font-size:13px'>Rezervaci můžete spravovat také v <a href='https://rezervace.tt-denik.cz/admin/dashboard'>administraci</a>.</p>"
            . "<div class='footer'>Tento email byl vygenerován automaticky rezervačním systémem.</div>"
            . "</div></body></html>";
    }

    private function buildCustomerEmail(array $company, array $customer, array $reservation): string
    {
        $s = $this->style();
        $slots = $reservation['slotStarts'] ?? [];
        $slotList = implode(', ', array_map(fn($s) => substr($s, 0, 5), $slots));
        $count = count($slots); $slotMinutes=(int)($reservation['slotMinutes']??30);

        return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>{$s}</style></head><body>"
            . "<div class='card'>"
            . "<h2>🏓 Rezervace přijata</h2>"
            . "<p>Děkujeme, <strong>{$customer['firstName']}</strong>! Vaše rezervace v <strong>{$company['name']}</strong> byla přijata.</p>"
            . "<hr style='border:0;border-top:1px solid #eee;margin:12px 0'>"
            . "<table>"
            . "<tr><th>Datum</th><td>{$reservation['date']}</td></tr>"
            . "<tr><th>Časy</th><td>{$slotList}</td></tr>"
            . "<tr><th>Počet bloků</th><td>{$count} × {$slotMinutes} min</td></tr>"
            . "<tr><th>Cena celkem</th><td class='price'>" . number_format($reservation['totalPrice'], 0, ',', ' ') . " Kč</td></tr>"
            . "</table>"
            . "<div class='note'>⏳ Po schválení administrátorem Vám přijde potvrzovací email.</div>"
            . ($reservation['note'] ? "<p style='color:#888;font-size:13px'>📝 Vaše poznámka: {$reservation['note']}</p>" : "")
            . (!empty($reservation['cancelUrl']) ? "<p style='margin-top:18px'><a href='".htmlspecialchars((string)$reservation['cancelUrl'],ENT_QUOTES,'UTF-8')."' style='display:inline-block;padding:10px 16px;border-radius:8px;background:#e11d48;color:#fff;text-decoration:none;font-weight:700'>Zrušit rezervaci</a></p>" : "")
            . "<div class='footer'>Rezervační systém • {$company['name']}</div>"
            . "</div></body></html>";
    }

    private function buildConfirmationEmail(array $company, array $customer, array $reservation): string
    {
        $s = $this->style();
        $slots = $reservation['slotStarts'] ?? [];
        $slotList = htmlspecialchars(self::timeVariables($reservation)['time'],ENT_QUOTES,'UTF-8');

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
