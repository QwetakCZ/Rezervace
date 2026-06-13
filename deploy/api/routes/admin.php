<?php
/**
 * Admin endpointy - část 1 (login, companies, users, categories)
 */

// /api/admin/login
if ($path === '/admin/login' && $method === 'POST') {
    $b = getJson();
    $em = strtolower(trim($b['email'] ?? '')); $pw = $b['password'] ?? '';
    if (!$em || !$pw) errOut('Vyplňte e-mail a heslo.');

    $u = DB::queryOne('SELECT id,company_id,role,email,password_hash,first_name,last_name FROM users WHERE email=? LIMIT 1', [$em]);
    if (!$u || !in_array($u['role'], ['admin','superadmin'])) errOut('Neplatné přihlašovací údaje.', 401);

    $hash = $u['password_hash'] ?? ''; $valid = false;
    if (str_starts_with($hash, '$2y$') || str_starts_with($hash, '$2b$') || str_starts_with($hash, '$2a$')) {
        $valid = password_verify($pw, str_replace('$2y$', '$2b$', $hash));
    } else { $valid = $hash !== '' && $hash === $pw; }
    if (!$valid) errOut('Neplatné přihlašovací údaje.', 401);

    $token = $auth->createAdminToken($u);
    jsonOut(['token' => $token, 'user' => ['id' => (int)$u['id'], 'companyId' => ($u['role']==='superadmin' && empty($u['company_id'])) ? null : (int)$u['company_id'], 'role' => $u['role'], 'email' => $u['email'], 'firstName' => $u['first_name'], 'lastName' => $u['last_name']]]);
}

// /api/admin/me
if ($path === '/admin/me') {
    $a = getAdmin($auth);
    jsonOut(['user' => ['id' => (int)$a['id'], 'companyId' => ($a['role']==='superadmin' && empty($a['company_id'])) ? null : (int)$a['company_id'], 'role' => $a['role'], 'email' => $a['email'], 'firstName' => $a['first_name'], 'lastName' => $a['last_name']]]);
}

// /api/admin/companies
if ($path === '/admin/companies') {
    $a = getAdmin($auth);

    if ($method === 'GET') {
        $rows = DB::query('SELECT id,name,timezone,created_at,brand_color,background_color,text_color FROM companies ' . (isSA($a) ? '' : 'WHERE id=?') . ' ORDER BY id', isSA($a) ? [] : [(int)$a['company_id']]);
        if (empty($rows)) { jsonOut([]); return true; }

        $ids = array_column($rows, 'id');
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $users = DB::query("SELECT id,company_id,role,email,first_name,last_name,phone,current_credit,created_at FROM users WHERE company_id IN ($ph) ORDER BY company_id,id", $ids);

        $ubc = []; foreach ($users as $u) { $ubc[$u['company_id']][] = ['id' => (int)$u['id'], 'companyId' => (int)$u['company_id'], 'role' => $u['role'], 'email' => $u['email'], 'firstName' => $u['first_name'], 'lastName' => $u['last_name'], 'phone' => $u['phone'], 'currentCredit' => (float)$u['current_credit'], 'createdAt' => $u['created_at']]; }

        jsonOut(array_map(function($c) use ($ubc) {
            $cid = (int)$c['id'];
            return ['id' => $cid, 'name' => $c['name'], 'timezone' => $c['timezone'], 'createdAt' => $c['created_at'], 'brandColor' => normHex($c['brand_color'], '#10d2a2'), 'backgroundColor' => normHex($c['background_color'], '#06070c'), 'textColor' => normHex($c['text_color'], '#f4f5f7'), 'userCount' => count($ubc[$cid] ?? []), 'users' => $ubc[$cid] ?? []];
        }, $rows));
    }

    if ($method === 'POST') {
        if (!isSA($a)) errOut('Pouze superadmin může spravovat company.', 403);
        $b = getJson(); $n = trim($b['name'] ?? ''); $tz = trim($b['timezone'] ?? 'Europe/Prague') ?: 'Europe/Prague';
        if (!$n) errOut('Vyplňte název company.');
        $nid = DB::insert('INSERT INTO companies (name,timezone) VALUES(?,?)', [$n, $tz]);
        $nc = DB::queryOne('SELECT id,name,timezone,created_at,brand_color,background_color,text_color FROM companies WHERE id=? LIMIT 1', [$nid]);
        jsonOut(['id' => (int)$nc['id'], 'name' => $nc['name'], 'timezone' => $nc['timezone'], 'createdAt' => $nc['created_at'], 'brandColor' => normHex($nc['brand_color'], '#10d2a2'), 'backgroundColor' => normHex($nc['background_color'], '#06070c'), 'textColor' => normHex($nc['text_color'], '#f4f5f7')], 201);
    }

    errOut('Method not allowed.', 405);
}

// /admin/companies/:id
if (preg_match('#^/admin/companies/(\d+)$#', $path, $m)) {
    $a = getAdmin($auth); $cid = (int)$m[1];

    if ($method === 'PATCH') {
        $b = getJson(); $n = trim($b['name'] ?? ''); $tz = trim($b['timezone'] ?? '');
        $bcp = array_key_exists('brandColor', $b ?? []); $bgp = array_key_exists('backgroundColor', $b ?? []);
        $tcp = array_key_exists('textColor', $b ?? []);
        $bc = normHex($b['brandColor'] ?? null); $bg = normHex($b['backgroundColor'] ?? null); $tc = normHex($b['textColor'] ?? null);

        if (!$cid) errOut('Neplatné ID company.');
        if (!$n && !$tz && !$bcp && !$bgp && !$tcp) errOut('Není co upravit.');
        if ($bcp && !$bc) errOut('Primární barva musí být ve formátu #RRGGBB.');
        if ($bgp && !$bg) errOut('Barva pozadí musí být ve formátu #RRGGBB.');
        if ($tcp && !$tc) errOut('Barva textu musí být ve formátu #RRGGBB.');
        if (!hasAccess($a, $cid)) errOut('K této company nemáte přístup.', 403);
        if (!DB::queryOne('SELECT id FROM companies WHERE id=? LIMIT 1', [$cid])) errOut('Company neexistuje.', 404);

        $f = []; $v = [];
        if ($n) { $f[] = 'name=?'; $v[] = $n; }
        if ($tz) { $f[] = 'timezone=?'; $v[] = $tz; }
        if ($bcp) { $f[] = 'brand_color=?'; $v[] = $bc; }
        if ($bgp) { $f[] = 'background_color=?'; $v[] = $bg; }
        if ($tcp) { $f[] = 'text_color=?'; $v[] = $tc; }
        $v[] = $cid;
        DB::exec('UPDATE companies SET ' . implode(',', $f) . ' WHERE id=?', $v);

        $up = DB::queryOne('SELECT id,name,timezone,created_at,brand_color,background_color,text_color FROM companies WHERE id=? LIMIT 1', [$cid]);
        jsonOut(['id' => (int)$up['id'], 'name' => $up['name'], 'timezone' => $up['timezone'], 'createdAt' => $up['created_at'], 'brandColor' => normHex($up['brand_color'], '#10d2a2'), 'backgroundColor' => normHex($up['background_color'], '#06070c'), 'textColor' => normHex($up['text_color'], '#f4f5f7')]);
    }

    errOut('Method not allowed.', 405);
}

// /api/admin/users
if ($path === '/admin/users') {
    $a = getAdmin($auth);

    if ($method === 'GET') {
        $rcid = qInt('companyId'); $cid = isSA($a) ? ($rcid ?: null) : (int)$a['company_id'];
        $rows = DB::query('SELECT id,company_id,role,email,first_name,last_name,phone,current_credit,created_at FROM users ' . ($cid ? 'WHERE company_id=?' : '') . ' ORDER BY company_id,id', $cid ? [$cid] : []);
        jsonOut(array_map(fn($u) => ['id' => (int)$u['id'], 'companyId' => (int)$u['company_id'], 'role' => $u['role'], 'email' => $u['email'], 'firstName' => $u['first_name'], 'lastName' => $u['last_name'], 'phone' => $u['phone'], 'currentCredit' => (float)$u['current_credit'], 'createdAt' => $u['created_at']], $rows));
    }

    if ($method === 'POST') {
        $sa = isSA($a); $b = getJson();
        $cid = $sa ? (int)($b['companyId'] ?? 0) : (int)$a['company_id'];
        $role = trim($b['role'] ?? 'admin'); $em = strtolower(trim($b['email'] ?? ''));
        $pw = $b['password'] ?? ''; $fn = trim($b['firstName'] ?? '');
        $ln = trim($b['lastName'] ?? ''); $ph = trim($b['phone'] ?? '');

        if (!$cid || !$em || !$pw || !$fn || !$ln) errOut('Vyplňte company, e-mail, heslo a jméno.');
        if (!$sa && $role !== 'admin') errOut('Můžete vytvářet pouze admin účty ve své company.', 403);
        if ($sa && !in_array($role, ['admin','coach','player'])) errOut('Neplatná role uživatele.');
        if (!DB::queryOne('SELECT id FROM companies WHERE id=? LIMIT 1', [$cid])) errOut('Company neexistuje.', 404);

        $pwh = hashPw($pw);
        $uid = DB::insert("INSERT INTO users (company_id,role,email,password_hash,first_name,last_name,phone,current_credit) VALUES(?,?,?,?,?,?,?,0.00)", [$cid, $role, $em, $pwh, $fn, $ln, $ph ?: null]);
        $cr = DB::queryOne('SELECT id,company_id,role,email,first_name,last_name,phone,current_credit,created_at FROM users WHERE id=? LIMIT 1', [$uid]);
        jsonOut(['id' => (int)$cr['id'], 'companyId' => (int)$cr['company_id'], 'role' => $cr['role'], 'email' => $cr['email'], 'firstName' => $cr['first_name'], 'lastName' => $cr['last_name'], 'phone' => $cr['phone'], 'currentCredit' => (float)$cr['current_credit'], 'createdAt' => $cr['created_at']], 201);
    }

    errOut('Method not allowed.', 405);
}

// /admin/users/:id
if (preg_match('#^/admin/users/(\d+)$#', $path, $m)) {
    $a = getAdmin($auth); $uid = (int)$m[1]; $sa = isSA($a);

    if ($method === 'PATCH') {
        $b = getJson();
        $cid = (int)($b['companyId'] ?? 0); $role = trim($b['role'] ?? '');
        $em = strtolower(trim($b['email'] ?? '')); $pw = $b['password'] ?? '';
        $fn = trim($b['firstName'] ?? ''); $ln = trim($b['lastName'] ?? '');
        $ph = trim($b['phone'] ?? '');

        if (!$uid) errOut('Neplatné ID uživatele.');

        $f = []; $v = [];
        if ($cid) { if (!$sa) errOut('Změnu company může provést pouze superadmin.', 403); $f[] = 'company_id=?'; $v[] = $cid; }
        if ($role) { if (!$sa && $role !== 'admin') errOut('Můžete spravovat pouze admin účty.', 403); if ($sa && !in_array($role, ['admin','coach','player'])) errOut('Neplatná role.'); $f[] = 'role=?'; $v[] = $role; }
        if ($em) { $f[] = 'email=?'; $v[] = $em; }
        if ($fn) { $f[] = 'first_name=?'; $v[] = $fn; }
        if ($ln) { $f[] = 'last_name=?'; $v[] = $ln; }
        if ($ph) { $f[] = 'phone=?'; $v[] = $ph; }
        if ($pw) { $f[] = 'password_hash=?'; $v[] = hashPw($pw); }
        if (empty($f)) errOut('Není co upravit.');

        $ex = DB::queryOne('SELECT id,company_id FROM users WHERE id=? LIMIT 1', [$uid]);
        if (!$ex) errOut('Uživatel neexistuje.', 404);
        if (!$sa && (int)$ex['company_id'] !== (int)$a['company_id']) errOut('K tomuto uživateli nemáte přístup.', 403);
        if ($cid && !DB::queryOne('SELECT id FROM companies WHERE id=? LIMIT 1', [$cid])) errOut('Company neexistuje.', 404);

        $v[] = $uid;
        DB::exec('UPDATE users SET ' . implode(',', $f) . ' WHERE id=?', $v);

        $up = DB::queryOne('SELECT id,company_id,role,email,first_name,last_name,phone,current_credit,created_at FROM users WHERE id=? LIMIT 1', [$uid]);
        jsonOut(['id' => (int)$up['id'], 'companyId' => (int)$up['company_id'], 'role' => $up['role'], 'email' => $up['email'], 'firstName' => $up['first_name'], 'lastName' => $up['last_name'], 'phone' => $up['phone'], 'currentCredit' => (float)$up['current_credit'], 'createdAt' => $up['created_at']]);
    }

    errOut('Method not allowed.', 405);
}

// /api/admin/categories
if ($path === '/admin/categories') {
    $a = getAdmin($auth);

    if ($method === 'GET') {
        $rcid = qInt('companyId'); $cid = isSA($a) ? ($rcid ?: null) : (int)$a['company_id'];
        $rows = DB::query('SELECT id,company_id,name,description,default_slot_duration,icon FROM categories ' . ($cid ? 'WHERE company_id=?' : '') . ' ORDER BY id', $cid ? [$cid] : []);
        jsonOut(array_map(fn($c) => ['id' => (int)$c['id'], 'companyId' => (int)$c['company_id'], 'name' => $c['name'], 'description' => $c['description'], 'icon' => $c['icon'] ?: null, 'defaultSlotDuration' => (int)$c['default_slot_duration']], $rows));
    }

    if ($method === 'POST') {
        $b = getJson();
        $cid = isSA($a) ? (int)($b['companyId'] ?? 0) : (int)$a['company_id'];
        $n = trim($b['name'] ?? ''); $desc = trim($b['description'] ?? '');
        $dsd = (int)($b['defaultSlotDuration'] ?? 0);
        $icon = in_array(($b['icon'] ?? ''), ['trophy','cpu','dumbbell','calendar','users','star']) ? $b['icon'] : null;

        if (!$cid || !$n || $dsd <= 0) errOut('Vyplňte company, název a délku slotu v minutách.');
        if (!DB::queryOne('SELECT id FROM companies WHERE id=? LIMIT 1', [$cid])) errOut('Company neexistuje.', 404);

        $nid = DB::insert('INSERT INTO categories (company_id,name,description,icon,default_slot_duration) VALUES(?,?,?,?,?)', [$cid, $n, $desc ?: null, $icon, $dsd]);
        $cr = DB::queryOne('SELECT id,company_id,name,description,default_slot_duration,icon FROM categories WHERE id=? LIMIT 1', [$nid]);
        jsonOut(['id' => (int)$cr['id'], 'companyId' => (int)$cr['company_id'], 'name' => $cr['name'], 'description' => $cr['description'], 'icon' => $cr['icon'] ?: null, 'defaultSlotDuration' => (int)$cr['default_slot_duration']], 201);
    }

    errOut('Method not allowed.', 405);
}

// /admin/categories/:id
if (preg_match('#^/admin/categories/(\d+)$#', $path, $m)) {
    $a = getAdmin($auth); $catId = (int)$m[1];

    if ($method === 'PATCH') {
        $b = getJson();
        $n = trim($b['name'] ?? ''); $dp = array_key_exists('description', $b ?? []);
        $desc = trim($b['description'] ?? ''); $dsdr = $b['defaultSlotDuration'] ?? null;
        $ip = array_key_exists('icon', $b ?? []);
        $icon = in_array(($b['icon'] ?? ''), ['trophy','cpu','dumbbell','calendar','users','star']) ? $b['icon'] : null;

        if (!$catId) errOut('Neplatné ID kategorie.');
        $ex = DB::queryOne('SELECT id,company_id FROM categories WHERE id=? LIMIT 1', [$catId]);
        if (!$ex) errOut('Kategorie neexistuje.', 404);
        if (!hasAccess($a, (int)$ex['company_id'])) errOut('K této kategorii nemáte přístup.', 403);

        $f = []; $v = [];
        if ($n) { $f[] = 'name=?'; $v[] = $n; }
        if ($dp) { $f[] = 'description=?'; $v[] = $desc ?: null; }
        if ($ip) { $f[] = 'icon=?'; $v[] = $icon; }
        if ($dsdr !== null) { $d = (int)$dsdr; if ($d <= 0) errOut('Délka slotu musí být kladné číslo.'); $f[] = 'default_slot_duration=?'; $v[] = $d; }
        if (empty($f)) errOut('Není co upravit.');

        $v[] = $catId;
        DB::exec('UPDATE categories SET ' . implode(',', $f) . ' WHERE id=?', $v);
        $up = DB::queryOne('SELECT id,company_id,name,description,default_slot_duration,icon FROM categories WHERE id=? LIMIT 1', [$catId]);
        jsonOut(['id' => (int)$up['id'], 'companyId' => (int)$up['company_id'], 'name' => $up['name'], 'description' => $up['description'], 'icon' => $up['icon'] ?: null, 'defaultSlotDuration' => (int)$up['default_slot_duration']]);
    }

    if ($method === 'DELETE') {
        if (!$catId) errOut('Neplatné ID kategorie.');
        $ex = DB::queryOne('SELECT id,company_id FROM categories WHERE id=? LIMIT 1', [$catId]);
        if (!$ex) errOut('Kategorie neexistuje.', 404);
        if (!hasAccess($a, (int)$ex['company_id'])) errOut('K této kategorii nemáte přístup.', 403);
        DB::exec('DELETE FROM categories WHERE id=?', [$catId]);
        jsonOut(['ok' => true, 'categoryId' => $catId]);
    }

    errOut('Method not allowed.', 405);
}

return false; // pokračovat na admin2.php
