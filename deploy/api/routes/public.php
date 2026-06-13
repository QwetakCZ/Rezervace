<?php
/**
 * Veřejné (neautentizované) endpointy
 * Return true = routa zpracována, false = pokračovat
 */

// /api/health
if ($path === '/health' || $path === '/') {
    jsonOut(['ok' => true, 'service' => 'rezervace-api-php']);
}

// /api/health/db
if ($path === '/health/db') {
    try {
        DB::query('SELECT 1 AS ok');
        $rows = DB::query('SELECT COUNT(*) AS cnt FROM categories');
        jsonOut(['ok' => true, 'database' => 'connected', 'categoriesCount' => (int)($rows[0]['cnt'] ?? 0)]);
    } catch (\Throwable $e) {
        jsonOut(['ok' => false, 'database' => 'disconnected', 'error' => $e->getMessage()], 500);
    }
}

// /api/company
if ($path === '/company') {
    $cid = qInt('companyId') ?: $config['defaults']['company_id'];
    $c = DB::queryOne('SELECT id, name, timezone, created_at, brand_color, background_color, text_color FROM companies WHERE id=? LIMIT 1', [$cid]);
    if (!$c) errOut('Company neexistuje.', 404);
    jsonOut([
        'id' => (int)$c['id'], 'name' => $c['name'], 'timezone' => $c['timezone'],
        'createdAt' => $c['created_at'],
        'brandColor' => normHex($c['brand_color'], '#10d2a2'),
        'backgroundColor' => normHex($c['background_color'], '#06070c'),
        'textColor' => normHex($c['text_color'], '#f4f5f7'),
    ]);
}

// /api/categories
if ($path === '/categories') {
    $cid = qInt('companyId') ?: $config['defaults']['company_id'];
    $cats = DB::query(
        "SELECT c.id, c.name, c.description, c.icon, c.default_slot_duration, COUNT(r.id) AS active_resource_count
         FROM categories c LEFT JOIN resources r ON r.category_id=c.id AND r.is_active=1
         WHERE c.company_id=? GROUP BY c.id ORDER BY c.id", [$cid]);
    jsonOut(array_map(fn($c) => [
        'id' => (int)$c['id'], 'name' => $c['name'], 'description' => $c['description'],
        'icon' => $c['icon'] ?: null, 'default_slot_duration' => (int)$c['default_slot_duration'],
        'activeResourceCount' => (int)$c['active_resource_count'],
    ], $cats));
}

// /api/resources
if ($path === '/resources') {
    $catId = qInt('categoryId'); $cid = qInt('companyId') ?: $config['defaults']['company_id'];
    if (!$catId) errOut('Chybí categoryId.');
    $res = DB::query("SELECT r.id, r.name FROM resources r JOIN categories c ON c.id=r.category_id WHERE r.category_id=? AND c.company_id=? AND r.is_active=1 ORDER BY r.id", [$catId, $cid]);
    jsonOut(array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name']], $res));
}

// /api/availability
if ($path === '/availability') {
    $catId = qInt('categoryId'); $date = qStr('date'); $cid = qInt('companyId') ?: $config['defaults']['company_id'];
    if (!$catId || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) errOut('Je potřeba categoryId a date ve formátu YYYY-MM-DD.');

    $dow = Slots::dayOfWeekForPricing($date);
    $bs = getBookingSettings($cid, $config['defaults']['min_advance_minutes']);
    $cat = DB::queryOne('SELECT default_slot_duration FROM categories WHERE id=? AND company_id=? LIMIT 1', [$catId, $cid]);
    if (!$cat) errOut('Kategorie neexistuje.', 404);

    $windows = DB::query('SELECT id, resource_id, time_from, time_to, price_per_slot FROM pricing_windows WHERE category_id=? AND day_of_week=? ORDER BY resource_id IS NULL DESC, time_from', [$catId, $dow]);
    $resources = DB::query("SELECT r.id, r.name FROM resources r JOIN categories c ON c.id=r.category_id WHERE r.category_id=? AND c.company_id=? AND r.is_active=1 ORDER BY r.id", [$catId, $cid]);

    $slotMins = (int)($cat['default_slot_duration'] ?? 30);
    $catSlots = []; $resSlots = [];

    foreach ($windows as $w) {
        $ws = array_map(fn($s) => ['time_start' => $s['time_start'], 'time_end' => $s['time_end'], 'price' => (float)$w['price_per_slot']], Slots::buildSlotsForWindow($w['time_from'], $w['time_to'], $slotMins));
        if (empty($w['resource_id'])) { $catSlots = array_merge($catSlots, $ws); }
        else { $rid = (int)$w['resource_id']; if (!isset($resSlots[$rid])) $resSlots[$rid] = []; $resSlots[$rid] = array_merge($resSlots[$rid], $ws); }
    }

    $rwc = array_map(function($r) use ($catSlots, $resSlots) {
        $rid = (int)$r['id']; $r['slots'] = array_merge($catSlots, $resSlots[$rid] ?? []); return $r;
    }, $resources);

    $reserved = DB::query("SELECT resource_id, time_start FROM reservation_slots WHERE date=? AND resource_id IN (SELECT id FROM resources WHERE category_id=?)", [$date, $catId]);
    $rwa = Slots::groupSlotsByResource($rwc, $reserved);
    $ltf = Slots::filterSlotsByLeadTime($rwa, $date, $bs['minAdvanceMinutes']);

    jsonOut(['date' => $date, 'categoryId' => $catId, 'slotMinutes' => $slotMins, 'minAdvanceMinutes' => $bs['minAdvanceMinutes'], 'resources' => $ltf]);
}

// /api/reservations POST
if ($path === '/reservations' && $method === 'POST') {
    $b = getJson();
    $catId = (int)($b['categoryId'] ?? 0); $resId = (int)($b['resourceId'] ?? 0);
    $date = trim($b['date'] ?? ''); $slots = $b['slotStarts'] ?? [];
    $fn = trim($b['firstName'] ?? ''); $ln = trim($b['lastName'] ?? '');
    $em = trim($b['email'] ?? ''); $ph = trim($b['phone'] ?? '');
    $reqCid = (int)($b['companyId'] ?? qInt('companyId')); $fcid = $reqCid ?: $config['defaults']['company_id'];

    if (!$catId || !$resId || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !is_array($slots) || empty($slots) || !$fn || !$ln || !$em)
        errOut('Neplatná data rezervace.');

    try {
        $dow = Slots::dayOfWeekForPricing($date);
        $bs = getBookingSettings($fcid, $config['defaults']['min_advance_minutes']);
        $windows = DB::query('SELECT resource_id, time_from, time_to, price_per_slot FROM pricing_windows WHERE category_id=? AND day_of_week=? AND (resource_id IS NULL OR resource_id=?) ORDER BY resource_id IS NULL DESC, time_from', [$catId, $dow, $resId]);
        $cat = DB::queryOne('SELECT default_slot_duration FROM categories WHERE id=? LIMIT 1', [$catId]);
        $sm = (int)($cat['default_slot_duration'] ?? 30);

        $allowed = [];
        foreach ($windows as $w) {
            foreach (Slots::buildSlotsForWindow($w['time_from'], $w['time_to'], $sm) as $s) {
                $allowed[$s['time_start']] = ['time_start' => $s['time_start'], 'time_end' => $s['time_end'], 'price' => (float)$w['price_per_slot']];
            }
        }

        $uss = array_values(array_unique($slots)); sort($uss);
        $sel = array_values(array_filter(array_map(fn($s) => $allowed[$s] ?? null, $uss), fn($x) => $x !== null));
        if (count($sel) !== count($uss)) errOut('Vybrané sloty nejsou povolené.');

        foreach ($uss as $s) {
            if (!Slots::isSlotBookableWithLeadTime($date, $s, $bs['minAdvanceMinutes']))
                errOut("Rezervaci je nutné vytvořit alespoň {$bs['minAdvanceMinutes']} minut před začátkem.");
        }

        $tp = array_sum(array_column($sel, 'price'));
        DB::beginTransaction();

        if (!DB::queryOne('SELECT id FROM categories WHERE id=? AND company_id=? LIMIT 1', [$catId, $fcid])) { DB::rollback(); errOut('Kategorie neexistuje.', 404); }
        if (!DB::queryOne('SELECT id FROM resources WHERE id=? AND category_id=? AND is_active=1 LIMIT 1', [$resId, $catId])) { DB::rollback(); errOut('Prostředky neodpovídají kategorii.'); }

        $eu = DB::queryOne('SELECT id FROM users WHERE email=? AND company_id=? LIMIT 1', [$em, $fcid]);
        $uid = $eu ? (int)$eu['id'] : DB::insert("INSERT INTO users (company_id,role,email,password_hash,first_name,last_name,phone,current_credit) VALUES (?,'player',?,'',?,?,?,0.00)", [$fcid, $em, $fn, $ln, $ph ?: null]);

        // Check conflicts
        $timeList = array_map(fn($s) => $s . ':00', $uss);
        $inPlaceholders = implode(',', array_fill(0, count($timeList), '?'));
        $conflicts = DB::query("SELECT time_start FROM reservation_slots WHERE resource_id=? AND date=? AND time_start IN ($inPlaceholders)", array_merge([$resId, $date], $timeList));
        if (!empty($conflicts)) { DB::rollback(); errOut('Některé vybrané časy už byly zarezervovány.'); }

        $reservationId = DB::insert("INSERT INTO reservations (company_id,user_id,resource_id,start_time,end_time,total_price,payment_method,status) VALUES (?,?,?,?,?,?,?,?)", [$fcid, $uid, $resId, "$date 00:00:00", "$date 23:59:59", $tp, 'credit', 'confirmed']);
        $pps = $tp / count($sel);

        foreach ($sel as $slot) {
            $ss = $slot['time_start']; $so = DateTime::createFromFormat('H:i:s', $ss);
            $et = $ss; if ($so) { $so->modify('+30 minutes'); $et = $so->format('H:i:s'); }
            DB::exec('INSERT INTO reservation_slots (reservation_id,resource_id,slot_datetime,date,time_start,time_end,price) VALUES (?,?,?,?,?,?,?)', [$reservationId, $resId, "$date $ss", $date, $ss, $et, $pps]);
        }

        DB::commit();
        jsonOut(['status' => 'success', 'message' => 'Rezervace byla úspěšně vytvořena.', 'data' => ['reservation_id' => $reservationId, 'totalPrice' => $tp]], 201);
    } catch (\Throwable $e) {
        DB::rollback(); errOut('Nepodařilo se vytvořit rezervaci: ' . $e->getMessage(), 500);
    }
}

return false; // pokračovat na další routy
