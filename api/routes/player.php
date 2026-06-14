<?php
/**
 * Hráčské endpointy
 */

// /api/player/register
if ($path === '/player/register' && $method === 'POST') {
    $b = getJson();
    $cid = (int)($b['companyId'] ?? qInt('companyId')) ?: $config['defaults']['company_id'];
    $em = strtolower(trim($b['email'] ?? ''));
    $pw = $b['password'] ?? ''; $fn = trim($b['firstName'] ?? '');
    $ln = trim($b['lastName'] ?? ''); $ph = trim($b['phone'] ?? '');

    if (!$cid || !$em || !$pw || !$fn || !$ln) errOut('Vyplňte e-mail, heslo, jméno a příjmení.');
    if (!DB::queryOne('SELECT id FROM companies WHERE id=? LIMIT 1', [$cid])) errOut('Company neexistuje.', 404);

    $ex = DB::queryOne('SELECT id, role, password_hash FROM users WHERE company_id=? AND email=? LIMIT 1', [$cid, $em]);
    if ($ex) {
        if ($ex['role'] !== 'player') errOut('Tento e-mail už v klubu používá jiný typ účtu.', 409);
        if (!empty($ex['password_hash'])) errOut('Hráčský účet s tímto e-mailem už existuje.', 409);
        $pwh = hashPw($pw);
        DB::exec('UPDATE users SET first_name=?, last_name=?, phone=?, password_hash=? WHERE id=?', [$fn, $ln, $ph ?: null, $pwh, $ex['id']]);
        $uid = (int)$ex['id'];
    } else {
        $pwh = hashPw($pw);
        $uid = DB::insert("INSERT INTO users (company_id,role,email,password_hash,first_name,last_name,phone,current_credit) VALUES (?,'player',?,?,?,?,?,0.00)", [$cid, $em, $pwh, $fn, $ln, $ph ?: null]);
    }

    $p = DB::queryOne('SELECT id,company_id,role,email,first_name,last_name,phone,current_credit,created_at FROM users WHERE id=? LIMIT 1', [$uid]);
    $token = $auth->createPlayerToken($p);

    jsonOut(['token' => $token, 'user' => ['id' => (int)$p['id'], 'companyId' => (int)$p['company_id'], 'role' => $p['role'], 'email' => $p['email'], 'firstName' => $p['first_name'], 'lastName' => $p['last_name'], 'phone' => $p['phone'], 'currentCredit' => (float)$p['current_credit'], 'createdAt' => $p['created_at']]], 201);
}

// /api/player/login
if ($path === '/player/login' && $method === 'POST') {
    $b = getJson();
    $cid = (int)($b['companyId'] ?? qInt('companyId')) ?: $config['defaults']['company_id'];
    $em = strtolower(trim($b['email'] ?? '')); $pw = $b['password'] ?? '';

    if (!$cid || !$em || !$pw) errOut('Vyplňte e-mail a heslo.');

    $u = DB::queryOne('SELECT id,company_id,role,email,password_hash,first_name,last_name,phone,current_credit,created_at FROM users WHERE company_id=? AND email=? LIMIT 1', [$cid, $em]);
    if (!$u || $u['role'] !== 'player') errOut('Neplatné přihlašovací údaje.', 401);

    $hash = $u['password_hash'] ?? '';
    if (!password_verify($pw, $hash) && ($hash === '' || $hash !== $pw)) errOut('Neplatné přihlašovací údaje.', 401);

    $token = $auth->createPlayerToken($u);
    jsonOut(['token' => $token, 'user' => ['id' => (int)$u['id'], 'companyId' => (int)$u['company_id'], 'role' => $u['role'], 'email' => $u['email'], 'firstName' => $u['first_name'], 'lastName' => $u['last_name'], 'phone' => $u['phone'], 'currentCredit' => (float)$u['current_credit'], 'createdAt' => $u['created_at']]]);
}

// /api/player/me
if ($path === '/player/me') {
    $payload = requireAuth($auth);
    if (strtolower($payload['role']) !== 'player') errOut('Neplatné přihlášení hráče.', 401);

    $p = DB::queryOne('SELECT id,company_id,role,email,first_name,last_name,phone,current_credit,created_at FROM users WHERE id=? AND role=? LIMIT 1', [(int)$payload['sub'], 'player']);
    if (!$p || (int)$p['company_id'] !== (int)($payload['companyId'] ?? 0)) errOut('Přihlášení hráče už není platné.', 401);

    jsonOut(['user' => ['id' => (int)$p['id'], 'companyId' => (int)$p['company_id'], 'role' => $p['role'], 'email' => $p['email'], 'firstName' => $p['first_name'], 'lastName' => $p['last_name'], 'phone' => $p['phone'], 'currentCredit' => (float)$p['current_credit'], 'createdAt' => $p['created_at']]]);
}

return false;
