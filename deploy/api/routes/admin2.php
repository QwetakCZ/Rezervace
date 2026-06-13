<?php
/**
 * Admin endpointy - část 2 (resources, pricing, booking settings, reservations)
 */

// /api/admin/resources
if ($path === '/admin/resources') {
    $a = getAdmin($auth);

    if ($method === 'GET') {
        $catId = qInt('categoryId'); if (!$catId) errOut('Chybí categoryId.');
        $cat = DB::queryOne('SELECT id,company_id FROM categories WHERE id=? LIMIT 1', [$catId]);
        if (!$cat) errOut('Kategorie neexistuje.', 404);
        if (!hasAccess($a, (int)$cat['company_id'])) errOut('K téhle kategorii nemáte přístup.', 403);

        $rows = DB::query('SELECT id,category_id,name,is_active FROM resources WHERE category_id=? ORDER BY id', [$catId]);
        jsonOut(array_map(fn($r) => ['id' => (int)$r['id'], 'categoryId' => (int)$r['category_id'], 'name' => $r['name'], 'isActive' => (bool)$r['is_active']], $rows));
    }

    if ($method === 'POST') {
        $b = getJson();
        $catId = (int)($b['categoryId'] ?? 0); $n = trim($b['name'] ?? '');
        $isActive = array_key_exists('isActive', $b ?? []) ? (bool)$b['isActive'] : true;
        if (!$catId || !$n) errOut('Vyplňte kategorii a název zdroje.');

        $cat = DB::queryOne('SELECT id,company_id FROM categories WHERE id=? LIMIT 1', [$catId]);
        if (!$cat) errOut('Kategorie neexistuje.', 404);
        if (!hasAccess($a, (int)$cat['company_id'])) errOut('K téhle kategorii nemáte přístup.', 403);

        $rid = DB::insert('INSERT INTO resources (category_id,name,is_active) VALUES(?,?,?)', [$catId, $n, $isActive ? 1 : 0]);
        $cr = DB::queryOne('SELECT id,category_id,name,is_active FROM resources WHERE id=? LIMIT 1', [$rid]);
        jsonOut(['id' => (int)$cr['id'], 'categoryId' => (int)$cr['category_id'], 'name' => $cr['name'], 'isActive' => (bool)$cr['is_active']], 201);
    }

    errOut('Method not allowed.', 405);
}

// /admin/resources/:id
if (preg_match('#^/admin/resources/(\d+)$#', $path, $m)) {
    $a = getAdmin($auth); $rid = (int)$m[1];
    if (!$rid) errOut('Neplatné ID zdroje.');

    $ex = DB::queryOne('SELECT r.id,r.category_id,r.name,r.is_active,c.company_id FROM resources r JOIN categories c ON c.id=r.category_id WHERE r.id=? LIMIT 1', [$rid]);
    if (!$ex) errOut('Zdroj neexistuje.', 404);
    if (!hasAccess($a, (int)$ex['company_id'])) errOut('K tomuto zdroji nemáte přístup.', 403);

    if ($method === 'PATCH') {
        $b = getJson();
        $catId = (int)($b['categoryId'] ?? 0); $n = trim($b['name'] ?? '');
        $ha = array_key_exists('isActive', $b ?? []);
        $f = []; $v = [];
        if ($catId) {
            $cat = DB::queryOne('SELECT id,company_id FROM categories WHERE id=? LIMIT 1', [$catId]);
            if (!$cat) errOut('Cílová kategorie neexistuje.', 404);
            if (!hasAccess($a, (int)$cat['company_id'])) errOut('Do cílové kategorie nemáte přístup.', 403);
            $f[] = 'category_id=?'; $v[] = $catId;
        }
        if ($n) { $f[] = 'name=?'; $v[] = $n; }
        if ($ha) { $f[] = 'is_active=?'; $v[] = $b['isActive'] ? 1 : 0; }
        if (empty($f)) errOut('Není co upravit.');

        $v[] = $rid;
        DB::exec('UPDATE resources SET ' . implode(',', $f) . ' WHERE id=?', $v);
        $up = DB::queryOne('SELECT id,category_id,name,is_active FROM resources WHERE id=? LIMIT 1', [$rid]);
        jsonOut(['id' => (int)$up['id'], 'categoryId' => (int)$up['category_id'], 'name' => $up['name'], 'isActive' => (bool)$up['is_active']]);
    }

    if ($method === 'DELETE') {
        DB::exec('DELETE FROM resources WHERE id=?', [$rid]);
        jsonOut(['ok' => true, 'resourceId' => $rid]);
    }

    errOut('Method not allowed.', 405);
}

// /api/admin/pricing-windows
if ($path === '/admin/pricing-windows') {
    $a = getAdmin($auth);

    if ($method === 'GET') {
        $catId = qInt('categoryId'); if (!$catId) errOut('Chybí categoryId.');
        $cat = DB::queryOne('SELECT id,company_id FROM categories WHERE id=? LIMIT 1', [$catId]);
        if (!$cat) errOut('Kategorie neexistuje.', 404);
        if (!hasAccess($a, (int)$cat['company_id'])) errOut('K téhle kategorii nemáte přístup.', 403);

        $rows = DB::query("SELECT pw.id,pw.category_id,pw.resource_id,pw.day_of_week,pw.time_from,pw.time_to,pw.price_per_slot,r.name AS resource_name FROM pricing_windows pw LEFT JOIN resources r ON r.id=pw.resource_id WHERE pw.category_id=? ORDER BY day_of_week,time_from,id", [$catId]);
        jsonOut(array_map(fn($pw) => ['id' => (int)$pw['id'], 'categoryId' => (int)$pw['category_id'], 'resourceId' => $pw['resource_id'] ? (int)$pw['resource_id'] : null, 'resourceName' => $pw['resource_name'] ?: null, 'dayOfWeek' => (int)$pw['day_of_week'], 'timeFrom' => $pw['time_from'], 'timeTo' => $pw['time_to'], 'pricePerSlot' => (float)$pw['price_per_slot']], $rows));
    }

    if ($method === 'POST') {
        $b = getJson();
        $catId = (int)($b['categoryId'] ?? 0); $dow = (int)($b['dayOfWeek'] ?? 0);
        $tf = normTime($b['timeFrom'] ?? ''); $tt = normTime($b['timeTo'] ?? '');
        $pps = (float)($b['pricePerSlot'] ?? 0);
        $rids = is_array($b['resourceIds'] ?? null) ? $b['resourceIds'] : [];
        $frid = (int)($b['resourceId'] ?? 0);
        $targets = !empty($rids) ? $rids : ($frid ? [$frid] : []);

        if (!$catId || $dow < 1 || $dow > 7 || !$tf || !$tt || $pps < 0) errOut('Vyplňte kategorii, den, časové rozmezí a cenu za slot.');
        if ($tf >= $tt) errOut('Čas od musí být dřív než čas do.');

        $cat = DB::queryOne('SELECT id,company_id FROM categories WHERE id=? LIMIT 1', [$catId]);
        if (!$cat) errOut('Kategorie neexistuje.', 404);
        if (!hasAccess($a, (int)$cat['company_id'])) errOut('K téhle kategorii nemáte přístup.', 403);

        $targets = !empty($targets) ? $targets : [null];
        $created = [];
        foreach ($targets as $rid) {
            $wid = DB::insert('INSERT INTO pricing_windows (category_id,resource_id,day_of_week,time_from,time_to,price_per_slot) VALUES(?,?,?,?,?,?)', [$catId, $rid, $dow, $tf, $tt, $pps]);
            $cw = DB::queryOne("SELECT pw.id,pw.category_id,pw.resource_id,pw.day_of_week,pw.time_from,pw.time_to,pw.price_per_slot,r.name AS resource_name FROM pricing_windows pw LEFT JOIN resources r ON r.id=pw.resource_id WHERE pw.id=? LIMIT 1", [$wid]);
            $created[] = ['id' => (int)$cw['id'], 'categoryId' => (int)$cw['category_id'], 'resourceId' => $cw['resource_id'] ? (int)$cw['resource_id'] : null, 'resourceName' => $cw['resource_name'] ?: null, 'dayOfWeek' => (int)$cw['day_of_week'], 'timeFrom' => $cw['time_from'], 'timeTo' => $cw['time_to'], 'pricePerSlot' => (float)$cw['price_per_slot']];
        }
        jsonOut(count($created) === 1 ? $created[0] : ['created' => $created], 201);
    }

    errOut('Method not allowed.', 405);
}

// /admin/pricing-windows/:id
if (preg_match('#^/admin/pricing-windows/(\d+)$#', $path, $m)) {
    $a = getAdmin($auth); $wid = (int)$m[1];
    if (!$wid) errOut('Neplatné ID cenového okna.');

    $ex = DB::queryOne("SELECT pw.id,pw.category_id,pw.resource_id,pw.day_of_week,pw.time_from,pw.time_to,pw.price_per_slot,c.company_id FROM pricing_windows pw JOIN categories c ON c.id=pw.category_id WHERE pw.id=? LIMIT 1", [$wid]);
    if (!$ex) errOut('Cenové okno neexistuje.', 404);
    if (!hasAccess($a, (int)$ex['company_id'])) errOut('K tomuto cenovému oknu nemáte přístup.', 403);

    if ($method === 'PATCH') {
        $b = getJson();
        $catId = (int)($b['categoryId'] ?? 0); $dowR = $b['dayOfWeek'] ?? null;
        $tfR = $b['timeFrom'] ?? null; $ttR = $b['timeTo'] ?? null;
        $ppsR = $b['pricePerSlot'] ?? null; $ridR = $b['resourceId'] ?? null;

        $f = []; $v = [];
        if ($catId) {
            $cat = DB::queryOne('SELECT id,company_id FROM categories WHERE id=? LIMIT 1', [$catId]);
            if (!$cat) errOut('Cílová kategorie neexistuje.', 404);
            if (!hasAccess($a, (int)$cat['company_id'])) errOut('Do cílové kategorie nemáte přístup.', 403);
            $f[] = 'category_id=?'; $v[] = $catId;
        }
        if ($dowR !== null) { $d = (int)$dowR; if ($d < 1 || $d > 7) errOut('Den v týdnu musí být 1 až 7.'); $f[] = 'day_of_week=?'; $v[] = $d; }
        if ($tfR !== null) { $t = normTime($tfR); if (!$t) errOut('Čas od nemá platný formát.'); $f[] = 'time_from=?'; $v[] = $t; }
        if ($ttR !== null) { $t = normTime($ttR); if (!$t) errOut('Čas do nemá platný formát.'); $f[] = 'time_to=?'; $v[] = $t; }
        if ($ppsR !== null) { $p = (float)$ppsR; if ($p < 0) errOut('Cena za slot musí být nezáporné číslo.'); $f[] = 'price_per_slot=?'; $v[] = $p; }
        if ($ridR !== null) { $r = (int)$ridR; $f[] = 'resource_id=?'; $v[] = $r > 0 ? $r : null; }
        if (empty($f)) errOut('Není co upravit.');

        $v[] = $wid;
        DB::exec('UPDATE pricing_windows SET ' . implode(',', $f) . ' WHERE id=?', $v);
        $up = DB::queryOne("SELECT pw.id,pw.category_id,pw.resource_id,pw.day_of_week,pw.time_from,pw.time_to,pw.price_per_slot,r.name AS resource_name FROM pricing_windows pw LEFT JOIN resources r ON r.id=pw.resource_id WHERE pw.id=? LIMIT 1", [$wid]);
        jsonOut(['id' => (int)$up['id'], 'categoryId' => (int)$up['category_id'], 'resourceId' => $up['resource_id'] ? (int)$up['resource_id'] : null, 'resourceName' => $up['resource_name'] ?: null, 'dayOfWeek' => (int)$up['day_of_week'], 'timeFrom' => $up['time_from'], 'timeTo' => $up['time_to'], 'pricePerSlot' => (float)$up['price_per_slot']]);
    }

    if ($method === 'DELETE') {
        DB::exec('DELETE FROM pricing_windows WHERE id=?', [$wid]);
        jsonOut(['ok' => true, 'windowId' => $wid]);
    }

    errOut('Method not allowed.', 405);
}

// /api/admin/booking-settings
if ($path === '/admin/booking-settings') {
    $a = getAdmin($auth);

    if ($method === 'GET') {
        $rcid = qInt('companyId'); $cid = isSA($a) ? ($rcid ?: null) : (int)$a['company_id'];
        if (!$cid) errOut('Chybí companyId.');
        if (!DB::queryOne('SELECT id FROM companies WHERE id=? LIMIT 1', [$cid])) errOut('Company neexistuje.', 404);
        if (!hasAccess($a, $cid)) errOut('K této company nemáte přístup.', 403);
        jsonOut(getBookingSettings($cid, $config['defaults']['min_advance_minutes']));
    }

    if ($method === 'PATCH') {
        $b = getJson();
        $rcid = (int)($b['companyId'] ?? 0); $cid = isSA($a) ? ($rcid ?: null) : (int)$a['company_id'];
        $mam = (int)($b['minAdvanceMinutes'] ?? -1);
        if (!$cid) errOut('Chybí companyId.');
        if ($mam < 0 || $mam > 10080) errOut('Minimální předstih musí být číslo 0 až 10080 minut.');
        if (!DB::queryOne('SELECT id FROM companies WHERE id=? LIMIT 1', [$cid])) errOut('Company neexistuje.', 404);
        if (!hasAccess($a, $cid)) errOut('K této company nemáte přístup.', 403);

        DB::exec('INSERT INTO company_booking_settings (company_id,min_advance_minutes) VALUES(?,?) ON DUPLICATE KEY UPDATE min_advance_minutes=VALUES(min_advance_minutes)', [$cid, $mam]);
        jsonOut(['companyId' => $cid, 'minAdvanceMinutes' => $mam]);
    }

    errOut('Method not allowed.', 405);
}

// /api/admin/reservations
if ($path === '/admin/reservations') {
    $a = getAdmin($auth);

    if ($method === 'GET') {
        $status = qStr('status'); $date = qStr('date'); $limit = min(qInt('limit') ?: 50, 200);

        $conds = []; $vals = [];
        if (!isSA($a)) { $conds[] = 'r.company_id=?'; $vals[] = (int)$a['company_id']; }
        if ($status) { $conds[] = 'r.status=?'; $vals[] = $status; }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) { $conds[] = 'EXISTS (SELECT 1 FROM reservation_slots s WHERE s.reservation_id=r.id AND s.date=?)'; $vals[] = $date; }
        $where = !empty($conds) ? 'WHERE ' . implode(' AND ', $conds) : '';

        $res = DB::query("SELECT r.id,r.status,r.total_price,r.note,r.created_at,c.name AS category_name,u.first_name,u.last_name,u.email,u.phone FROM reservations r JOIN users u ON u.id=r.user_id JOIN categories c ON c.id=r.category_id $where ORDER BY r.created_at DESC LIMIT ?", [...$vals, $limit]);

        if (empty($res)) { jsonOut([]); return true; }

        $ids = array_column($res, 'id');
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $slots = DB::query("SELECT rs.reservation_id,rs.date,rs.time_start,rs.time_end,rs.price,r.name AS resource_name FROM reservation_slots rs JOIN resources r ON r.id=rs.resource_id WHERE rs.reservation_id IN ($ph) ORDER BY rs.date,rs.time_start", $ids);

        $sbr = []; foreach ($slots as $s) { $sbr[$s['reservation_id']][] = $s; }
        jsonOut(array_map(fn($r) => array_merge($r, ['slots' => $sbr[(int)$r['id']] ?? []]), $res));
    }

    errOut('Method not allowed.', 405);
}

// /api/admin/reservations/pending-count
if ($path === '/admin/reservations/pending-count') {
    $a = getAdmin($auth);
    $r = DB::queryOne("SELECT COUNT(*) AS pending_count FROM reservations r WHERE r.status='pending' " . (isSA($a) ? '' : 'AND r.company_id=?'), isSA($a) ? [] : [(int)$a['company_id']]);
    jsonOut(['pendingCount' => (int)($r['pending_count'] ?? 0)]);
}

// /admin/reservations/:id/approve
if (preg_match('#^/admin/reservations/(\d+)/approve$#', $path, $m)) {
    $a = getAdmin($auth); $rid = (int)$m[1];
    if (!$rid) errOut('Neplatné ID rezervace.');
    $ex = DB::queryOne('SELECT id,company_id,status FROM reservations WHERE id=? LIMIT 1', [$rid]);
    if (!$ex) errOut('Rezervace neexistuje.', 404);
    if (!isSA($a) && (int)$ex['company_id'] !== (int)$a['company_id']) errOut('K této rezervaci nemáte přístup.', 403);
    if ($ex['status'] === 'cancelled') errOut('Stornovanou rezervaci nelze schválit.', 409);
    if ($ex['status'] === 'confirmed') errOut('Rezervace už je schválena.', 409);
    DB::exec("UPDATE reservations SET status='confirmed' WHERE id=?", [$rid]);
    jsonOut(['ok' => true, 'reservationId' => $rid, 'status' => 'confirmed']);
}

// /admin/reservations/:id/cancel
if (preg_match('#^/admin/reservations/(\d+)/cancel$#', $path, $m)) {
    $a = getAdmin($auth); $rid = (int)$m[1];
    $b = getJson(); $reason = trim($b['reason'] ?? '');
    if (!$rid) errOut('Neplatné ID rezervace.');
    $ex = DB::queryOne('SELECT id,company_id,status,note FROM reservations WHERE id=? LIMIT 1', [$rid]);
    if (!$ex) errOut('Rezervace neexistuje.', 404);
    if (!isSA($a) && (int)$ex['company_id'] !== (int)$a['company_id']) errOut('K této rezervaci nemáte přístup.', 403);
    if ($ex['status'] === 'cancelled') errOut('Rezervace už je stornována.', 409);

    $suffix = $reason ? "\n[storno] $reason" : "\n[storno]";
    DB::exec("UPDATE reservations SET status='cancelled', note=CONCAT(IFNULL(note,''),?) WHERE id=?", [$suffix, $rid]);
    jsonOut(['ok' => true, 'reservationId' => $rid]);
}

// pokud žádná routa nezpracovala, vrátíme false
return false;
