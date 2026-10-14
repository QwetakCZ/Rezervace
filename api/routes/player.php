<?php
/** Hráčské endpointy: bezpečná registrace, přihlášení, obnova hesla a účet. */

function playerResponse(array $user): array
{
    return [
        'id' => (int)$user['id'], 'companyId' => (int)$user['company_id'], 'role' => $user['role'],
        'email' => $user['email'], 'firstName' => $user['first_name'], 'lastName' => $user['last_name'],
        'phone' => $user['phone'], 'currentCredit' => (float)$user['current_credit'], 'createdAt' => $user['created_at'],
    ];
}

function playerAccount(int $userId): ?array
{
    return DB::queryOne('SELECT id,company_id,role,email,password_hash,first_name,last_name,phone,current_credit,created_at FROM users WHERE id=? AND role=? LIMIT 1', [$userId, 'player']);
}

function validatePlayerPassword(string $password): void
{
    if (strlen($password) < 8) errOut('Heslo musí mít alespoň 8 znaků.');
    if (strlen($password) > 128) errOut('Heslo může mít nejvýše 128 znaků.');
}

function validatePlayerProfile(string $email, string $firstName, string $lastName, string $phone): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) errOut('Zadejte platnou e-mailovou adresu.');
    if ($firstName === '' || $lastName === '') errOut('Vyplňte jméno a příjmení.');
    if (mb_strlen($firstName) > 100 || mb_strlen($lastName) > 100) errOut('Jméno nebo příjmení je příliš dlouhé.');
    if (mb_strlen($phone) > 50) errOut('Telefonní číslo je příliš dlouhé.');
}

function playerAccountMail(string $title, string $message, string $buttonLabel, string $url): string
{
    $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $safeMessage = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    $safeLabel = htmlspecialchars($buttonLabel, ENT_QUOTES, 'UTF-8');
    $safeUrl = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
    return "<!doctype html><html><head><meta charset='utf-8'></head><body style='margin:0;padding:24px;background:#f5f5f5;font-family:Arial,sans-serif;color:#172033'><div style='max-width:560px;margin:auto;background:#fff;border-radius:14px;padding:28px'><h2 style='margin:0 0 12px'>{$safeTitle}</h2><p style='line-height:1.6'>{$safeMessage}</p><p style='margin:24px 0'><a href='{$safeUrl}' style='display:inline-block;padding:12px 18px;border-radius:9px;background:#10b981;color:#fff;text-decoration:none;font-weight:700'>{$safeLabel}</a></p><p style='font-size:12px;color:#687083'>Odkaz je platný 60 minut. Pokud jste o tuto akci nežádali, e-mail můžete ignorovat.</p></div></body></html>";
}

function createPlayerAccountToken(int $companyId, int $userId, string $purpose, array $pendingData = []): string
{
    $token = bin2hex(random_bytes(32));
    DB::exec('UPDATE player_account_tokens SET used_at=NOW() WHERE user_id=? AND purpose=? AND used_at IS NULL', [$userId, $purpose]);
    DB::insert(
        'INSERT INTO player_account_tokens (company_id,user_id,purpose,token_hash,pending_data,expires_at) VALUES (?,?,?,?,?,DATE_ADD(NOW(), INTERVAL 60 MINUTE))',
        [$companyId, $userId, $purpose, hash('sha256', $token), $pendingData ? json_encode($pendingData, JSON_UNESCAPED_UNICODE) : null]
    );
    return $token;
}

if ($path === '/player/register' && $method === 'POST') {
    $b = getJson();
    $cid = (int)($b['companyId'] ?? qInt('companyId')) ?: $config['defaults']['company_id'];
    $em = strtolower(trim((string)($b['email'] ?? ''))); $pw = (string)($b['password'] ?? '');
    $fn = trim((string)($b['firstName'] ?? '')); $ln = trim((string)($b['lastName'] ?? '')); $ph = trim((string)($b['phone'] ?? ''));
    validatePlayerProfile($em, $fn, $ln, $ph); validatePlayerPassword($pw);
    $company = DB::queryOne('SELECT id,name FROM companies WHERE id=? LIMIT 1', [$cid]);
    if (!$company) errOut('Klub neexistuje.', 404);
    $existing = DB::queryOne('SELECT id,role,password_hash FROM users WHERE company_id=? AND email=? LIMIT 1', [$cid, $em]);
    if ($existing && $existing['role'] !== 'player') errOut('Tento e-mail už v klubu používá jiný typ účtu.', 409);
    if ($existing && !empty($existing['password_hash'])) errOut('Hráčský účet s tímto e-mailem už existuje. Přihlaste se nebo použijte obnovu hesla.', 409);

    DB::beginTransaction();
    try {
        $uid = $existing ? (int)$existing['id'] : DB::insert("INSERT INTO users (company_id,role,email,password_hash,first_name,last_name,phone,current_credit) VALUES (?,'player',?,'',?,?,?,0.00)", [$cid, $em, $fn, $ln, $ph ?: null]);
        $token = createPlayerAccountToken($cid, $uid, 'activation', ['firstName' => $fn, 'lastName' => $ln, 'phone' => $ph, 'passwordHash' => hashPw($pw)]);
        DB::commit();
    } catch (\Throwable $e) { DB::rollback(); errOut('Registraci se nepodařilo uložit.', 500); }

    $url = appUrl($config).'/?companyId='.$cid.'&activatePlayerToken='.rawurlencode($token);
    $sent = $mailer->send($em, 'Dokončení registrace – '.$company['name'], playerAccountMail('Dokončení registrace', 'Kliknutím na tlačítko ověříte e-mail a aktivujete svůj hráčský účet.', 'Aktivovat účet', $url), $cid, null, 'player_activation', trim($fn.' '.$ln));
    if (!$sent) errOut('Ověřovací e-mail se nepodařilo odeslat. Zkuste registraci znovu za chvíli.', 503);
    jsonOut(['ok' => true, 'message' => 'Na e-mail jsme poslali odkaz pro aktivaci účtu. Odkaz platí 60 minut.'], 201);
}

if ($path === '/player/activate' && $method === 'POST') {
    $b = getJson(); $token = trim((string)($b['token'] ?? ''));
    if (!preg_match('/^[a-f0-9]{64}$/i', $token)) errOut('Aktivační odkaz není platný.', 400);
    $row = DB::queryOne("SELECT id,user_id,pending_data FROM player_account_tokens WHERE token_hash=? AND purpose='activation' AND used_at IS NULL AND expires_at>NOW() LIMIT 1", [hash('sha256', $token)]);
    if (!$row) errOut('Aktivační odkaz není platný nebo už vypršel.', 410);
    $pending = json_decode((string)$row['pending_data'], true) ?: [];
    if (empty($pending['passwordHash'])) errOut('Aktivační údaje jsou neúplné.', 500);
    DB::beginTransaction();
    try {
        DB::exec('UPDATE users SET first_name=?,last_name=?,phone=?,password_hash=? WHERE id=? AND role=?', [$pending['firstName'] ?? '', $pending['lastName'] ?? '', ($pending['phone'] ?? '') ?: null, $pending['passwordHash'], (int)$row['user_id'], 'player']);
        DB::exec('UPDATE player_account_tokens SET used_at=NOW() WHERE id=?', [(int)$row['id']]); DB::commit();
    } catch (\Throwable $e) { DB::rollback(); errOut('Účet se nepodařilo aktivovat.', 500); }
    $user = playerAccount((int)$row['user_id']); if (!$user) errOut('Hráčský účet neexistuje.', 404);
    jsonOut(['token' => $auth->createPlayerToken($user), 'user' => playerResponse($user), 'message' => 'Účet je aktivní a jste přihlášeni.']);
}

if ($path === '/player/login' && $method === 'POST') {
    $b = getJson(); $cid = (int)($b['companyId'] ?? qInt('companyId')) ?: $config['defaults']['company_id'];
    $em = strtolower(trim((string)($b['email'] ?? ''))); $pw = (string)($b['password'] ?? '');
    if (!filter_var($em, FILTER_VALIDATE_EMAIL) || $pw === '') errOut('Vyplňte platný e-mail a heslo.');
    $u = DB::queryOne('SELECT id,company_id,role,email,password_hash,first_name,last_name,phone,current_credit,created_at FROM users WHERE company_id=? AND email=? LIMIT 1', [$cid, $em]);
    if (!$u || $u['role'] !== 'player' || empty($u['password_hash'])) errOut('Neplatné přihlašovací údaje.', 401);
    $hash = (string)$u['password_hash'];
    $valid = password_verify($pw, $hash) || (!str_starts_with($hash, '$2') && hash_equals($hash, $pw));
    if (!$valid) errOut('Neplatné přihlašovací údaje.', 401);
    if (!str_starts_with($hash, '$2') || password_needs_rehash($hash, PASSWORD_BCRYPT, ['cost' => 10])) DB::exec('UPDATE users SET password_hash=? WHERE id=?', [hashPw($pw), (int)$u['id']]);
    jsonOut(['token' => $auth->createPlayerToken($u), 'user' => playerResponse($u)]);
}

if ($path === '/player/password-reset/request' && $method === 'POST') {
    $b = getJson(); $cid = (int)($b['companyId'] ?? qInt('companyId')) ?: $config['defaults']['company_id'];
    $em = strtolower(trim((string)($b['email'] ?? ''))); $message = 'Pokud k e-mailu existuje aktivní účet, poslali jsme odkaz pro nastavení nového hesla.';
    if (!filter_var($em, FILTER_VALIDATE_EMAIL)) jsonOut(['ok' => true, 'message' => $message]);
    $u = DB::queryOne("SELECT u.id,u.company_id,u.email,u.first_name,u.last_name,c.name AS company_name FROM users u JOIN companies c ON c.id=u.company_id WHERE u.company_id=? AND u.email=? AND u.role='player' AND u.password_hash<>'' LIMIT 1", [$cid, $em]);
    if ($u) {
        $recent = DB::queryOne("SELECT id FROM player_account_tokens WHERE user_id=? AND purpose='password_reset' AND created_at>DATE_SUB(NOW(),INTERVAL 2 MINUTE) LIMIT 1", [(int)$u['id']]);
        if (!$recent) {
            $token = createPlayerAccountToken($cid, (int)$u['id'], 'password_reset'); $url = appUrl($config).'/?companyId='.$cid.'&resetPlayerToken='.rawurlencode($token);
            $mailer->send($em, 'Obnova hesla – '.$u['company_name'], playerAccountMail('Obnova hesla', 'Kliknutím na tlačítko nastavíte nové heslo ke svému hráčskému účtu.', 'Nastavit nové heslo', $url), $cid, null, 'password_reset', trim($u['first_name'].' '.$u['last_name']));
        }
    }
    jsonOut(['ok' => true, 'message' => $message]);
}

if ($path === '/player/password-reset/confirm' && $method === 'POST') {
    $b = getJson(); $token = trim((string)($b['token'] ?? '')); $password = (string)($b['password'] ?? ''); validatePlayerPassword($password);
    if (!preg_match('/^[a-f0-9]{64}$/i', $token)) errOut('Odkaz pro obnovu hesla není platný.', 400);
    $row = DB::queryOne("SELECT id,user_id FROM player_account_tokens WHERE token_hash=? AND purpose='password_reset' AND used_at IS NULL AND expires_at>NOW() LIMIT 1", [hash('sha256', $token)]);
    if (!$row) errOut('Odkaz pro obnovu hesla není platný nebo už vypršel.', 410);
    DB::beginTransaction();
    try {
        DB::exec('UPDATE users SET password_hash=? WHERE id=? AND role=?', [hashPw($password), (int)$row['user_id'], 'player']);
        DB::exec('UPDATE player_account_tokens SET used_at=NOW() WHERE user_id=? AND purpose=? AND used_at IS NULL', [(int)$row['user_id'], 'password_reset']); DB::commit();
    } catch (\Throwable $e) { DB::rollback(); errOut('Nové heslo se nepodařilo uložit.', 500); }
    $user = playerAccount((int)$row['user_id']); if (!$user) errOut('Hráčský účet neexistuje.', 404);
    jsonOut(['token' => $auth->createPlayerToken($user), 'user' => playerResponse($user), 'message' => 'Heslo bylo změněno a jste přihlášeni.']);
}

if ($path === '/player/me' && in_array($method, ['GET', 'PATCH'], true)) {
    $payload = requireAuth($auth); if (strtolower((string)$payload['role']) !== 'player') errOut('Neplatné přihlášení hráče.', 401);
    $user = playerAccount((int)$payload['sub']);
    if (!$user || (int)$user['company_id'] !== (int)($payload['companyId'] ?? 0)) errOut('Přihlášení hráče už není platné.', 401);
    if ($method === 'PATCH') {
        $b = getJson(); $fn = trim((string)($b['firstName'] ?? $user['first_name'])); $ln = trim((string)($b['lastName'] ?? $user['last_name'])); $ph = trim((string)($b['phone'] ?? ($user['phone'] ?? '')));
        validatePlayerProfile($user['email'], $fn, $ln, $ph); DB::exec('UPDATE users SET first_name=?,last_name=?,phone=? WHERE id=?', [$fn, $ln, $ph ?: null, (int)$user['id']]); $user = playerAccount((int)$user['id']);
    }
    jsonOut(['user' => playerResponse($user)]);
}

if ($path === '/player/reservations' && $method === 'GET') {
    $payload = requireAuth($auth); if (strtolower((string)$payload['role']) !== 'player') errOut('Neplatné přihlášení hráče.', 401);
    $uid = (int)$payload['sub']; $cid = (int)($payload['companyId'] ?? 0);
    $rows = DB::query("SELECT r.id,r.status,r.total_price,r.note,r.created_at,r.customer_first_name,r.customer_last_name,r.customer_email,r.customer_phone,c.name AS category_name FROM reservations r JOIN categories c ON c.id=r.category_id WHERE r.user_id=? AND r.company_id=? AND r.booking_type='customer' ORDER BY r.created_at DESC LIMIT 100", [$uid, $cid]);
    if (!$rows) jsonOut([]);
    $ids = array_column($rows, 'id'); $ph = implode(',', array_fill(0, count($ids), '?'));
    $slots = DB::query("SELECT rs.reservation_id,rs.date,rs.time_start,rs.time_end,r.name AS resource_name FROM reservation_slots rs JOIN resources r ON r.id=rs.resource_id WHERE rs.reservation_id IN ($ph) ORDER BY rs.date,rs.time_start", $ids);
    $by = []; foreach ($slots as $slot) { $by[(int)$slot['reservation_id']][] = $slot; }
    jsonOut(array_map(fn($r) => array_merge($r, ['id' => (int)$r['id'], 'total_price' => (float)$r['total_price'], 'slots' => $by[(int)$r['id']] ?? []]), $rows));
}

if (preg_match('#^/player/reservations/(\d+)/cancel$#', $path, $m) && $method === 'PATCH') {
    $payload = requireAuth($auth); if (strtolower((string)$payload['role']) !== 'player') errOut('Neplatné přihlášení hráče.', 401);
    $rid = (int)$m[1]; $uid = (int)$payload['sub']; $cid = (int)($payload['companyId'] ?? 0);
    $row = DB::queryOne("SELECT r.id,r.status,r.company_id,r.user_id,COALESCE(NULLIF(r.customer_email,''),u.email) AS email,COALESCE(NULLIF(r.customer_first_name,''),u.first_name) AS first_name,COALESCE(NULLIF(r.customer_last_name,''),u.last_name) AS last_name,co.name AS company_name FROM reservations r JOIN users u ON u.id=r.user_id JOIN companies co ON co.id=r.company_id WHERE r.id=? AND r.user_id=? AND r.company_id=? LIMIT 1", [$rid, $uid, $cid]);
    if (!$row) errOut('Rezervace neexistuje.', 404); if (in_array($row['status'], ['cancelled', 'rejected'], true)) errOut('Rezervace už není aktivní.', 409);
    $slots = reservationSlots($rid); if (!$slots) errOut('Rezervace už nemá aktivní termín.', 409);
    if (strtotime($slots[0]['date'].' '.$slots[0]['time_start']) <= time()) errOut('Probíhající nebo proběhlou rezervaci už nelze stornovat.', 409);
    DB::beginTransaction();
    try {
        if (DB::exec("UPDATE reservations SET status='cancelled',cancelled_by='customer',cancelled_at=NOW(),cancel_token_hash=NULL,note=CONCAT(IFNULL(note,''),'\n[storno zákazníkem]') WHERE id=? AND status IN ('pending','confirmed')", [$rid]) !== 1) {
            DB::rollback(); errOut('Rezervace už byla stornována nebo vyřízena.',409);
        }
        DB::exec('DELETE FROM reservation_slots WHERE reservation_id=?', [$rid]); DB::commit();
    } catch (\Throwable $e) { DB::rollback(); errOut('Storno se nepodařilo uložit.', 500); }
    try {
        $ref = ['date' => $slots[0]['date'], 'slotStarts' => array_column($slots, 'time_start'), 'detailSlots' => $slots];
        $mailer->sendCustomerCancellationConfirmation(['id' => $cid, 'name' => $row['company_name']], ['firstName' => $row['first_name'], 'lastName' => $row['last_name'], 'email' => $row['email']], $ref, $rid);
    } catch (\Throwable $e) {}
    jsonOut(['ok' => true, 'reservationId' => $rid, 'status' => 'cancelled']);
}

return false;
