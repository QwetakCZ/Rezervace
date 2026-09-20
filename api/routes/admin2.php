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

        $rows = DB::query('SELECT r.id,r.category_id,r.name,r.is_active,r.min_booking_slots,c.min_booking_slots AS category_min_booking_slots FROM resources r JOIN categories c ON c.id=r.category_id WHERE r.category_id=? ORDER BY r.id', [$catId]);
        jsonOut(array_map(fn($r) => [
            'id' => (int)$r['id'],
            'categoryId' => (int)$r['category_id'],
            'name' => $r['name'],
            'isActive' => (bool)$r['is_active'],
            'minBookingSlots' => $r['min_booking_slots'] !== null ? (int)$r['min_booking_slots'] : null,
            'effectiveMinBookingSlots' => max((int)($r['min_booking_slots'] ?? $r['category_min_booking_slots'] ?? 1), 1),
        ], $rows));
    }

    if ($method === 'POST') {
        $b = getJson();
        $catId = (int)($b['categoryId'] ?? 0); $n = trim($b['name'] ?? '');
        $isActive = array_key_exists('isActive', $b ?? []) ? (bool)$b['isActive'] : true;
        $resourceMinSlots = isset($b['minBookingSlots']) && $b['minBookingSlots'] !== '' ? (int)$b['minBookingSlots'] : null;
        if (!$catId || !$n) errOut('Vyplňte kategorii a název zdroje.');
        if ($resourceMinSlots !== null && ($resourceMinSlots < 1 || $resourceMinSlots > 48)) errOut('Minimální počet bloků musí být 1 až 48.');

        $cat = DB::queryOne('SELECT id,company_id FROM categories WHERE id=? LIMIT 1', [$catId]);
        if (!$cat) errOut('Kategorie neexistuje.', 404);
        if (!hasAccess($a, (int)$cat['company_id'])) errOut('K téhle kategorii nemáte přístup.', 403);

        $rid = DB::insert('INSERT INTO resources (category_id,name,is_active,min_booking_slots) VALUES(?,?,?,?)', [$catId, $n, $isActive ? 1 : 0, $resourceMinSlots]);
        $cr = DB::queryOne('SELECT r.id,r.category_id,r.name,r.is_active,r.min_booking_slots,c.min_booking_slots AS category_min_booking_slots FROM resources r JOIN categories c ON c.id=r.category_id WHERE r.id=? LIMIT 1', [$rid]);
        jsonOut(['id' => (int)$cr['id'], 'categoryId' => (int)$cr['category_id'], 'name' => $cr['name'], 'isActive' => (bool)$cr['is_active'], 'minBookingSlots' => $cr['min_booking_slots'] !== null ? (int)$cr['min_booking_slots'] : null, 'effectiveMinBookingSlots' => max((int)($cr['min_booking_slots'] ?? $cr['category_min_booking_slots'] ?? 1), 1)], 201);
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
        $hasMinSlots = array_key_exists('minBookingSlots', $b ?? []);
        $f = []; $v = [];
        if ($catId) {
            $cat = DB::queryOne('SELECT id,company_id FROM categories WHERE id=? LIMIT 1', [$catId]);
            if (!$cat) errOut('Cílová kategorie neexistuje.', 404);
            if (!hasAccess($a, (int)$cat['company_id'])) errOut('Do cílové kategorie nemáte přístup.', 403);
            $f[] = 'category_id=?'; $v[] = $catId;
        }
        if ($n) { $f[] = 'name=?'; $v[] = $n; }
        if ($ha) { $f[] = 'is_active=?'; $v[] = $b['isActive'] ? 1 : 0; }
        if ($hasMinSlots) {
            $minSlots = $b['minBookingSlots'] === null || $b['minBookingSlots'] === '' ? null : (int)$b['minBookingSlots'];
            if ($minSlots !== null && ($minSlots < 1 || $minSlots > 48)) errOut('Minimální počet bloků musí být 1 až 48.');
            $f[] = 'min_booking_slots=?'; $v[] = $minSlots;
        }
        if (empty($f)) errOut('Není co upravit.');

        $v[] = $rid;
        DB::exec('UPDATE resources SET ' . implode(',', $f) . ' WHERE id=?', $v);
        $up = DB::queryOne('SELECT r.id,r.category_id,r.name,r.is_active,r.min_booking_slots,c.min_booking_slots AS category_min_booking_slots FROM resources r JOIN categories c ON c.id=r.category_id WHERE r.id=? LIMIT 1', [$rid]);
        jsonOut(['id' => (int)$up['id'], 'categoryId' => (int)$up['category_id'], 'name' => $up['name'], 'isActive' => (bool)$up['is_active'], 'minBookingSlots' => $up['min_booking_slots'] !== null ? (int)$up['min_booking_slots'] : null, 'effectiveMinBookingSlots' => max((int)($up['min_booking_slots'] ?? $up['category_min_booking_slots'] ?? 1), 1)]);
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
        $settings = getBookingSettings($cid, $config['defaults']['min_advance_minutes']);
        $sms = DB::queryOne('SELECT sms_enabled,sms_api_key_encrypted,sms_confirmation_template FROM company_booking_settings WHERE company_id=? LIMIT 1', [$cid]);
        $encryptedKey = (string)($sms['sms_api_key_encrypted'] ?? '');
        jsonOut(array_merge($settings, [
            'smsEnabled' => !empty($sms['sms_enabled']),
            'smsApiKeyConfigured' => $encryptedKey !== '',
            'smsApiKeyMasked' => $encryptedKey !== '' ? $smsManager->maskApiKey($encryptedKey) : '',
            'smsConfirmationTemplate' => trim((string)($sms['sms_confirmation_template'] ?? '')) ?: SmsManagerClient::DEFAULT_CONFIRMATION_TEMPLATE,
        ]));
    }

    if ($method === 'PATCH') {
        $b = getJson();
        $rcid = (int)($b['companyId'] ?? 0); $cid = isSA($a) ? ($rcid ?: null) : (int)$a['company_id'];
        $mam = (int)($b['minAdvanceMinutes'] ?? -1);
        $smsEnabled = !empty($b['smsEnabled']);
        $smsApiKey = trim((string)($b['smsApiKey'] ?? ''));
        $smsTemplate = trim((string)($b['smsConfirmationTemplate'] ?? ''));
        if (!$cid) errOut('Chybí companyId.');
        if ($mam < 0 || $mam > 10080) errOut('Minimální předstih musí být číslo 0 až 10080 minut.');
        if ($smsApiKey !== '' && (strlen($smsApiKey) < 8 || strlen($smsApiKey) > 512)) errOut('API klíč SMSManageru nemá platnou délku.');
        if ($smsTemplate === '') $smsTemplate = SmsManagerClient::DEFAULT_CONFIRMATION_TEMPLATE;
        if (strlen($smsTemplate) > 2000) errOut('SMS šablona je příliš dlouhá.');
        if (!DB::queryOne('SELECT id FROM companies WHERE id=? LIMIT 1', [$cid])) errOut('Company neexistuje.', 404);
        if (!hasAccess($a, $cid)) errOut('K této company nemáte přístup.', 403);

        getBookingSettings($cid, $config['defaults']['min_advance_minutes']);
        $current = DB::queryOne('SELECT sms_api_key_encrypted FROM company_booking_settings WHERE company_id=? LIMIT 1', [$cid]);
        $encryptedKey = (string)($current['sms_api_key_encrypted'] ?? '');
        if ($smsApiKey !== '') {
            $encryptedKey = $smsManager->encryptApiKey($smsApiKey);
        }
        if ($smsEnabled && $encryptedKey === '') errOut('Nejprve vložte API klíč SMSManageru.');

        DB::exec(
            'UPDATE company_booking_settings SET min_advance_minutes=?,sms_enabled=?,sms_api_key_encrypted=?,sms_confirmation_template=? WHERE company_id=?',
            [$mam, $smsEnabled ? 1 : 0, $encryptedKey ?: null, $smsTemplate, $cid]
        );
        jsonOut([
            'companyId' => $cid,
            'minAdvanceMinutes' => $mam,
            'smsEnabled' => $smsEnabled,
            'smsApiKeyConfigured' => $encryptedKey !== '',
            'smsApiKeyMasked' => $encryptedKey !== '' ? $smsManager->maskApiKey($encryptedKey) : '',
            'smsConfirmationTemplate' => $smsTemplate,
        ]);
    }

    errOut('Method not allowed.', 405);
}

// /api/admin/reservations/recurring — hromadná interní blokace termínů
if ($path === '/admin/reservations/recurring' && $method === 'POST') {
    $a=getAdmin($auth); if(isSA($a)) errOut('Vyberte admina konkrétní company.',403);
    $b=getJson();
    $catId=(int)($b['categoryId']??0); $resourceId=(int)($b['resourceId']??0);
    $startDate=trim((string)($b['startDate']??'')); $startTime=normTime((string)($b['startTime']??''));
    $durationMinutes=(int)($b['durationMinutes']??0); $repeatEveryWeeks=(int)($b['repeatEveryWeeks']??0);
    $occurrences=(int)($b['occurrences']??0); $label=trim((string)($b['label']??'Interní rezervace'));
    if(!$catId||!$resourceId||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$startDate)||!$startTime) errOut('Vyplňte kategorii, zdroj, datum a čas.');
    if($repeatEveryWeeks<1||$repeatEveryWeeks>12||$occurrences<1||$occurrences>52) errOut('Opakování musí být 1–12 týdnů a počet termínů 1–52.');
    $cat=DB::queryOne('SELECT id,company_id,default_slot_duration,min_booking_slots FROM categories WHERE id=? LIMIT 1',[$catId]);
    if(!$cat||!hasAccess($a,(int)$cat['company_id'])) errOut('Kategorie neexistuje nebo k ní nemáte přístup.',404);
    $resource=DB::queryOne('SELECT id FROM resources WHERE id=? AND category_id=? AND is_active=1 LIMIT 1',[$resourceId,$catId]);
    if(!$resource) errOut('Zdroj neexistuje nebo není aktivní.',404);
    $slotMinutes=max((int)$cat['default_slot_duration'],1); $minSlots=max((int)$cat['min_booking_slots'],1);
    if($durationMinutes<=0||$durationMinutes%$slotMinutes!==0) errOut("Délka musí být násobkem {$slotMinutes} minut.");
    $slotCount=(int)($durationMinutes/$slotMinutes);
    if($slotCount<$minSlots) errOut("Minimální délka je ".($minSlots*$slotMinutes).' minut.');
    $start=DateTimeImmutable::createFromFormat('!H:i:s',$startTime); if(!$start) errOut('Neplatný čas.');
    $slotStarts=[]; for($i=0;$i<$slotCount;$i++){$slotStarts[]=$start->modify('+'.($i*$slotMinutes).' minutes')->format('H:i:s');}
    $baseDate=DateTimeImmutable::createFromFormat('!Y-m-d',$startDate); if(!$baseDate) errOut('Neplatné datum.');
    if($baseDate < new DateTimeImmutable('today')) errOut('První termín nesmí být v minulosti.');
    $hex=bin2hex(random_bytes(16)); $group=substr($hex,0,8).'-'.substr($hex,8,4).'-'.substr($hex,12,4).'-'.substr($hex,16,4).'-'.substr($hex,20);
    $created=[]; DB::beginTransaction();
    try{
        for($i=0;$i<$occurrences;$i++){
            $date=$baseDate->modify('+'.($i*$repeatEveryWeeks).' weeks')->format('Y-m-d');
            $dow=Slots::dayOfWeekForPricing($date);
            $windows=DB::query('SELECT resource_id,time_from,time_to FROM pricing_windows WHERE category_id=? AND day_of_week=? AND (resource_id IS NULL OR resource_id=?)',[$catId,$dow,$resourceId]);
            $allowed=[]; foreach($windows as $window){foreach(Slots::buildSlotsForWindow($window['time_from'],$window['time_to'],$slotMinutes) as $slot){$allowed[$slot['time_start']]=$slot['time_end'];}}
            foreach($slotStarts as $slotStart){if(!isset($allowed[$slotStart])) throw new RuntimeException("Termín $date $slotStart není v rezervačním okně.");}
            $ph=implode(',',array_fill(0,count($slotStarts),'?'));
            $conflict=DB::queryOne("SELECT id FROM reservation_slots WHERE resource_id=? AND date=? AND time_start IN ($ph) LIMIT 1",array_merge([$resourceId,$date],$slotStarts));
            if($conflict) throw new RuntimeException("Termín $date koliduje s existující rezervací.");
            $rid=DB::insert("INSERT INTO reservations (company_id,user_id,category_id,total_price,status,booking_type,label,recurrence_group,note) VALUES (?,?,?,0,'confirmed','internal',?,?,?)",[(int)$cat['company_id'],(int)$a['id'],$catId,$label?:'Interní rezervace',$group,$label?:null]);
            foreach($slotStarts as $slotStart){$dt=DateTimeImmutable::createFromFormat('!H:i:s',$slotStart);$end=$dt->modify("+{$slotMinutes} minutes")->format('H:i:s');DB::exec('INSERT INTO reservation_slots (reservation_id,resource_id,date,time_start,time_end,price) VALUES (?,?,?,?,?,0)',[$rid,$resourceId,$date,$slotStart,$end]);}
            $created[]=['reservationId'=>$rid,'date'=>$date];
        }
        DB::commit();
    }catch(\Throwable $e){DB::rollback();errOut('Opakované rezervace nebyly vytvořeny: '.$e->getMessage(),409);}
    jsonOut(['ok'=>true,'recurrenceGroup'=>$group,'created'=>$created],201);
}

// /api/admin/hall-blocks — jednorázové nebo opakované uzavření všech stolů / trenérů v typu rezervace
if ($path === '/admin/hall-blocks' && $method === 'POST') {
    $a = getAdmin($auth);
    if (isSA($a)) errOut('Vyberte administrátora konkrétního klubu.', 403);
    $b = getJson();
    $categoryId = (int)($b['categoryId'] ?? 0);
    $label = trim((string)($b['label'] ?? 'Soukromá akce'));
    $mode = (string)($b['mode'] ?? 'single');
    $singleDate = trim((string)($b['singleDate'] ?? ''));
    $dateFrom = trim((string)($b['dateFrom'] ?? ''));
    $dateTo = trim((string)($b['dateTo'] ?? ''));
    $weekdays = array_values(array_unique(array_map('intval', is_array($b['weekdays'] ?? null) ? $b['weekdays'] : [])));
    $repeatEveryWeeks = max(1, (int)($b['repeatEveryWeeks'] ?? 1));
    $allDay = !empty($b['allDay']);
    $timeFrom = normTime((string)($b['timeFrom'] ?? ''));
    $timeTo = normTime((string)($b['timeTo'] ?? ''));

    if (!$categoryId || $label === '') errOut('Vyberte typ rezervace a zadejte název akce.');
    if (!in_array($mode, ['single', 'recurring'], true)) errOut('Neplatný režim blokace.');
    if (!$allDay && (!$timeFrom || !$timeTo || $timeFrom >= $timeTo)) errOut('Zadejte platný časový rozsah akce.');
    if ($repeatEveryWeeks < 1 || $repeatEveryWeeks > 12) errOut('Opakování musí být po 1 až 12 týdnech.');

    $category = DB::queryOne('SELECT id,company_id,name,default_slot_duration FROM categories WHERE id=? LIMIT 1', [$categoryId]);
    if (!$category || !hasAccess($a, (int)$category['company_id'])) errOut('Typ rezervace neexistuje nebo k němu nemáte přístup.', 404);
    $resources = DB::query('SELECT id,name FROM resources WHERE category_id=? AND is_active=1 ORDER BY id', [$categoryId]);
    if (!$resources) errOut('Tento typ rezervace nemá žádné aktivní stoly ani trenéry.', 409);

    $todayDate = new DateTimeImmutable('today');
    $dates = [];
    if ($mode === 'single') {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $singleDate);
        if (!$date || $date->format('Y-m-d') !== $singleDate || $date < $todayDate) errOut('Vyberte dnešní nebo budoucí datum.');
        $dates[] = $date;
    } else {
        $from = DateTimeImmutable::createFromFormat('!Y-m-d', $dateFrom);
        $to = DateTimeImmutable::createFromFormat('!Y-m-d', $dateTo);
        if (!$from || !$to || $from->format('Y-m-d') !== $dateFrom || $to->format('Y-m-d') !== $dateTo || $from < $todayDate || $to < $from) errOut('Zadejte platné období opakování.');
        if ($to > $from->modify('+370 days')) errOut('Opakovanou blokaci lze vytvořit nejvýše na 12 měsíců.');
        $weekdays = array_values(array_filter($weekdays, fn($day) => $day >= 1 && $day <= 7));
        if (!$weekdays) errOut('Vyberte alespoň jeden den v týdnu.');
        for ($cursor = $from; $cursor <= $to; $cursor = $cursor->modify('+1 day')) {
            $dayOffset = (int)$from->diff($cursor)->format('%a');
            $weekIndex = intdiv($dayOffset, 7);
            if ($weekIndex % $repeatEveryWeeks === 0 && in_array((int)$cursor->format('N'), $weekdays, true)) {
                $dates[] = $cursor;
            }
        }
        if (!$dates) errOut('V zadaném období není žádný vybraný den.');
        if (count($dates) > 100) errOut('Jednou akcí lze vytvořit nejvýše 100 termínů.');
    }

    $hex = bin2hex(random_bytes(16));
    $group = substr($hex,0,8).'-'.substr($hex,8,4).'-'.substr($hex,12,4).'-'.substr($hex,16,4).'-'.substr($hex,20);
    $slotMinutes = max((int)$category['default_slot_duration'], 1);
    $resourceIds = array_map(fn($resource) => (int)$resource['id'], $resources);
    $created = [];

    DB::beginTransaction();
    try {
        foreach ($dates as $dateObject) {
            $date = $dateObject->format('Y-m-d');
            $dow = (int)$dateObject->format('N');
            $windows = DB::query(
                'SELECT resource_id,time_from,time_to FROM pricing_windows WHERE category_id=? AND day_of_week=? ORDER BY resource_id IS NULL DESC,time_from',
                [$categoryId, $dow]
            );
            $slotsToCreate = [];
            foreach ($resources as $resource) {
                $resourceId = (int)$resource['id'];
                $allowed = [];
                foreach ($windows as $window) {
                    if ($window['resource_id'] !== null && (int)$window['resource_id'] !== $resourceId) continue;
                    foreach (Slots::buildSlotsForWindow($window['time_from'], $window['time_to'], $slotMinutes) as $slot) {
                        if (!$allDay && ($slot['time_start'] < $timeFrom || $slot['time_end'] > $timeTo)) continue;
                        $allowed[$slot['time_start']] = $slot['time_end'];
                    }
                }
                foreach ($allowed as $slotStart => $slotEnd) {
                    $slotsToCreate[] = ['resourceId' => $resourceId, 'start' => $slotStart, 'end' => $slotEnd];
                }
            }
            if (!$slotsToCreate) throw new RuntimeException("Pro datum {$date} nejsou v nastavené otevírací době žádné bloky.");

            $placeholders = implode(',', array_fill(0, count($resourceIds), '?'));
            $existing = DB::query(
                "SELECT resource_id,time_start FROM reservation_slots WHERE date=? AND resource_id IN ($placeholders)",
                array_merge([$date], $resourceIds)
            );
            $occupied = [];
            foreach ($existing as $slot) $occupied[(int)$slot['resource_id'] . '|' . $slot['time_start']] = true;
            foreach ($slotsToCreate as $slot) {
                if (isset($occupied[$slot['resourceId'] . '|' . $slot['start']])) {
                    throw new RuntimeException("Termín {$date} koliduje s existující rezervací. Nejdříve ji přesuňte nebo stornujte.");
                }
            }

            $reservationId = DB::insert(
                "INSERT INTO reservations (company_id,user_id,category_id,total_price,status,booking_type,label,recurrence_group,note) VALUES (?,?,?,0,'confirmed','internal',?,?,?)",
                [(int)$category['company_id'], (int)$a['id'], $categoryId, $label, $group, '[uzavření haly] ' . $label]
            );
            foreach ($slotsToCreate as $slot) {
                DB::exec(
                    'INSERT INTO reservation_slots (reservation_id,resource_id,date,time_start,time_end,price) VALUES (?,?,?,?,?,0)',
                    [$reservationId, $slot['resourceId'], $date, $slot['start'], $slot['end']]
                );
            }
            $created[] = ['reservationId' => $reservationId, 'date' => $date, 'blockedSlots' => count($slotsToCreate)];
        }
        DB::commit();
    } catch (Throwable $e) {
        DB::rollback();
        errOut('Soukromou akci se nepodařilo uložit: ' . $e->getMessage(), 409);
    }

    jsonOut(['ok' => true, 'recurrenceGroup' => $group, 'created' => $created], 201);
}

// /api/admin/reservations
if ($path === '/admin/reservations') {
    $a = getAdmin($auth);

    if ($method === 'GET') {
        $status = qStr('status');
        $date = qStr('date');
        $dateFrom = qStr('dateFrom');
        $dateTo = qStr('dateTo');
        $limit = min(qInt('limit') ?: 50, 500);

        $conds = []; $vals = [];
        if (!isSA($a)) { $conds[] = 'r.company_id=?'; $vals[] = (int)$a['company_id']; }
        if ($status) { $conds[] = 'r.status=?'; $vals[] = $status; }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) { $conds[] = 'EXISTS (SELECT 1 FROM reservation_slots s WHERE s.reservation_id=r.id AND s.date=?)'; $vals[] = $date; }
        if ($dateFrom !== '' || $dateTo !== '') {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo) || $dateFrom > $dateTo) {
                errOut('Neplatné období kalendáře.');
            }
            $conds[] = 'EXISTS (SELECT 1 FROM reservation_slots s_range WHERE s_range.reservation_id=r.id AND s_range.date BETWEEN ? AND ?)';
            $vals[] = $dateFrom;
            $vals[] = $dateTo;
        }
        $where = !empty($conds) ? 'WHERE ' . implode(' AND ', $conds) : '';

        $res = DB::query("SELECT r.id,r.status,r.booking_type,r.label,r.recurrence_group,r.cancelled_by,r.total_price,r.note,r.created_at,c.name AS category_name,
                                COALESCE(NULLIF(r.customer_first_name,''),u.first_name) AS first_name,
                                COALESCE(NULLIF(r.customer_last_name,''),u.last_name) AS last_name,
                                COALESCE(NULLIF(r.customer_email,''),u.email) AS email,
                                COALESCE(NULLIF(r.customer_phone,''),u.phone) AS phone
                         FROM reservations r JOIN users u ON u.id=r.user_id JOIN categories c ON c.id=r.category_id $where ORDER BY r.created_at DESC LIMIT ?", [...$vals, $limit]);

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
if (preg_match('#^/admin/reservations/(\d+)/approve$#', $path, $m) && $method === 'PATCH') {
    $a = getAdmin($auth); $rid = (int)$m[1];
    if (!$rid) errOut('Neplatné ID rezervace.');
    $ex = DB::queryOne(
        "SELECT r.id,r.company_id,r.status,r.user_id,r.total_price,r.booking_type,
                COALESCE(NULLIF(r.customer_first_name,''),u.first_name) AS customer_first_name,
                COALESCE(NULLIF(r.customer_last_name,''),u.last_name) AS customer_last_name,
                COALESCE(NULLIF(r.customer_email,''),u.email) AS customer_email,
                COALESCE(NULLIF(r.customer_phone,''),u.phone) AS customer_phone
         FROM reservations r JOIN users u ON u.id=r.user_id WHERE r.id=? LIMIT 1",
        [$rid]
    );
    if (!$ex) errOut('Rezervace neexistuje.', 404);
    if (!isSA($a) && (int)$ex['company_id'] !== (int)$a['company_id']) errOut('K této rezervaci nemáte přístup.', 403);
    if ($ex['status'] !== 'pending') errOut('Schválit lze pouze čekající rezervaci.', 409);
    DB::exec("UPDATE reservations SET status='confirmed' WHERE id=?", [$rid]);

    // Poslat potvrzovací email zákazníkovi
    try {
        $company = DB::queryOne('SELECT id, name FROM companies WHERE id=? LIMIT 1', [(int)$ex['company_id']]);
        $slots = DB::query('SELECT date, time_start FROM reservation_slots WHERE reservation_id=? ORDER BY date, time_start', [$rid]);
        if ($company && $slots) {
            $ref = ['date' => $slots[0]['date'], 'slotStarts' => array_column($slots, 'time_start')];
            $mailer->sendConfirmation($company, ['firstName' => $ex['customer_first_name'], 'lastName' => $ex['customer_last_name'], 'email' => $ex['customer_email'], 'phone' => $ex['customer_phone']], $ref, $rid);
        }
    } catch (\Throwable $e) { /* email selhal — nevadí */ }

    // Pokud má klub aktivní SMSManager, odeslat zákazníkovi SMS potvrzení.
    $smsResult = ['status' => 'disabled'];
    try {
        $smsSettings = DB::queryOne('SELECT sms_enabled,sms_api_key_encrypted,sms_confirmation_template FROM company_booking_settings WHERE company_id=? LIMIT 1', [(int)$ex['company_id']]);
        if (!empty($smsSettings['sms_enabled']) && !empty($smsSettings['sms_api_key_encrypted']) && ($ex['booking_type'] ?? 'customer') === 'customer') {
            $company = $company ?? DB::queryOne('SELECT id,name FROM companies WHERE id=? LIMIT 1', [(int)$ex['company_id']]);
            $detailSlots = DB::query(
                'SELECT rs.date,rs.time_start,rs.time_end,r.name AS resource_name FROM reservation_slots rs JOIN resources r ON r.id=rs.resource_id WHERE rs.reservation_id=? ORDER BY rs.date,rs.time_start',
                [$rid]
            );
            if ($company && $detailSlots) {
                $firstSlot = $detailSlots[0];
                $lastSlot = $detailSlots[count($detailSlots) - 1];
                $dateValue = DateTimeImmutable::createFromFormat('!Y-m-d', (string)$firstSlot['date']);
                $resources = array_values(array_unique(array_column($detailSlots, 'resource_name')));
                $template = trim((string)($smsSettings['sms_confirmation_template'] ?? '')) ?: SmsManagerClient::DEFAULT_CONFIRMATION_TEMPLATE;
                $message = SmsManagerClient::renderTemplate($template, [
                    '{{companyName}}' => (string)$company['name'],
                    '{{firstName}}' => (string)$ex['customer_first_name'],
                    '{{lastName}}' => (string)$ex['customer_last_name'],
                    '{{date}}' => $dateValue ? $dateValue->format('d.m.Y') : (string)$firstSlot['date'],
                    '{{weekday}}' => Mailer::weekdayName((string)$firstSlot['date']),
                    '{{time}}' => substr((string)$firstSlot['time_start'], 0, 5) . '-' . substr((string)$lastSlot['time_end'], 0, 5),
                    '{{resource}}' => implode(', ', $resources),
                    '{{reservationId}}' => (string)$rid,
                    '{{totalPrice}}' => number_format((float)$ex['total_price'], 0, ',', ' '),
                ]);
                $smsResult = $smsManager->send(
                    (int)$ex['company_id'],
                    $rid,
                    (string)$smsSettings['sms_api_key_encrypted'],
                    (string)($ex['customer_phone'] ?? ''),
                    $message,
                    'confirmation'
                );
            }
        }
    } catch (\Throwable $e) {
        $smsResult = ['status' => 'failed', 'error' => 'SMS se nepodařilo odeslat.'];
    }

    jsonOut(['ok' => true, 'reservationId' => $rid, 'status' => 'confirmed', 'sms' => $smsResult]);
}

// /admin/reservations/:id/reject
if (preg_match('#^/admin/reservations/(\d+)/reject$#', $path, $m) && $method === 'PATCH') {
    $a=getAdmin($auth); $rid=(int)$m[1]; $b=getJson(); $reason=trim((string)($b['reason']??''));
    $ex=DB::queryOne(
        "SELECT r.id,r.company_id,r.status,r.user_id,r.note,
                COALESCE(NULLIF(r.customer_first_name,''),u.first_name) AS customer_first_name,
                COALESCE(NULLIF(r.customer_last_name,''),u.last_name) AS customer_last_name,
                COALESCE(NULLIF(r.customer_email,''),u.email) AS customer_email
         FROM reservations r JOIN users u ON u.id=r.user_id WHERE r.id=? LIMIT 1",
        [$rid]
    );
    if(!$ex) errOut('Rezervace neexistuje.',404);
    if(!isSA($a)&&(int)$ex['company_id']!==(int)$a['company_id']) errOut('K této rezervaci nemáte přístup.',403);
    if($ex['status']!=='pending') errOut('Zamítnout lze pouze čekající rezervaci.',409);
    $slots=reservationSlots($rid);
    DB::beginTransaction();
    try{
        $suffix=$reason?"\n[zamítnuto] $reason":"\n[zamítnuto]";
        DB::exec("UPDATE reservations SET status='rejected',cancelled_by='admin',cancelled_at=NOW(),cancel_token_hash=NULL,note=CONCAT(IFNULL(note,''),?) WHERE id=?",[$suffix,$rid]);
        DB::exec('DELETE FROM reservation_slots WHERE reservation_id=?',[$rid]);
        DB::commit();
    }catch(\Throwable $e){DB::rollback();errOut('Zamítnutí se nepodařilo uložit.',500);}
    try{
        $company=DB::queryOne('SELECT id,name FROM companies WHERE id=? LIMIT 1',[(int)$ex['company_id']]);
        if($company&&$slots){$ref=['date'=>$slots[0]['date'],'slotStarts'=>array_column($slots,'time_start')];$mailer->sendRejection($company,['firstName'=>$ex['customer_first_name'],'lastName'=>$ex['customer_last_name'],'email'=>$ex['customer_email']],$ref,$rid,$reason);}
    }catch(\Throwable $e){}
    jsonOut(['ok'=>true,'reservationId'=>$rid,'status'=>'rejected']);
}

// /admin/reservations/:id/cancel
if (preg_match('#^/admin/reservations/(\d+)/cancel$#', $path, $m) && $method === 'PATCH') {
    $a = getAdmin($auth); $rid = (int)$m[1];
    $b = getJson(); $reason = trim($b['reason'] ?? '');
    if (!$rid) errOut('Neplatné ID rezervace.');
    $ex = DB::queryOne(
        "SELECT r.id,r.company_id,r.status,r.booking_type,r.note,r.user_id,
                COALESCE(NULLIF(r.customer_first_name,''),u.first_name) AS customer_first_name,
                COALESCE(NULLIF(r.customer_last_name,''),u.last_name) AS customer_last_name,
                COALESCE(NULLIF(r.customer_email,''),u.email) AS customer_email
         FROM reservations r JOIN users u ON u.id=r.user_id WHERE r.id=? LIMIT 1",
        [$rid]
    );
    if (!$ex) errOut('Rezervace neexistuje.', 404);
    if (!isSA($a) && (int)$ex['company_id'] !== (int)$a['company_id']) errOut('K této rezervaci nemáte přístup.', 403);
    if ($ex['status'] !== 'confirmed') errOut('Stornovat lze pouze potvrzenou rezervaci.', 409);

    $slots = reservationSlots($rid);
    $suffix = $reason ? "\n[storno] $reason" : "\n[storno]";
    DB::exec("UPDATE reservations SET status='cancelled',cancelled_by='admin',cancelled_at=NOW(),cancel_token_hash=NULL,note=CONCAT(IFNULL(note,''),?) WHERE id=?", [$suffix, $rid]);

    // Uvolnit sloty, aby je mohli rezervovat jiní
    DB::exec('DELETE FROM reservation_slots WHERE reservation_id=?', [$rid]);

    // Poslat storno email zákazníkovi
    try {
        $company = DB::queryOne('SELECT id, name FROM companies WHERE id=? LIMIT 1', [(int)$ex['company_id']]);
        if ($ex['booking_type'] === 'customer' && $company && $slots) {
            $ref = ['date' => $slots[0]['date'], 'slotStarts' => array_column($slots, 'time_start')];
            $mailer->sendCancellation($company, ['firstName' => $ex['customer_first_name'], 'lastName' => $ex['customer_last_name'], 'email' => $ex['customer_email']], $ref, $rid, $reason);
        }
    } catch (\Throwable $e) { /* email selhal — nevadí */ }

    jsonOut(['ok' => true, 'reservationId' => $rid]);
}

// /api/admin/email-logs
if ($path === '/admin/email-logs') {
    $a = getAdmin($auth);
    if (isSA($a)) errOut('Email logy jsou dostupné pouze pro adminy konkrétní company.', 403);

    $cid = (int)$a['company_id'];
    $limit = min(qInt('limit') ?: 100, 500);

    $rows = DB::query(
        'SELECT id, reservation_id, recipient_email, recipient_name, type, subject, delivery_status, error_message, sent_at
         FROM email_logs
         WHERE company_id=?
         ORDER BY sent_at DESC
         LIMIT ?',
        [$cid, $limit]
    );

    jsonOut(array_map(fn($r) => [
        'id' => (int)$r['id'],
        'reservationId' => $r['reservation_id'] ? (int)$r['reservation_id'] : null,
        'recipientEmail' => $r['recipient_email'],
        'recipientName' => $r['recipient_name'],
        'type' => $r['type'],
        'subject' => $r['subject'],
        'deliveryStatus' => $r['delivery_status'],
        'errorMessage' => $r['error_message'],
        'sentAt' => $r['sent_at'],
    ], $rows));
}

// /api/admin/sms-logs
if ($path === '/admin/sms-logs') {
    $a = getAdmin($auth);
    if (isSA($a)) errOut('SMS logy jsou dostupné pouze pro adminy konkrétní company.', 403);
    $cid = (int)$a['company_id'];
    $limit = min(qInt('limit') ?: 100, 500);
    $rows = DB::query(
        'SELECT id,reservation_id,recipient_phone,type,message,delivery_status,request_id,message_id,error_message,sent_at FROM sms_logs WHERE company_id=? ORDER BY sent_at DESC LIMIT ?',
        [$cid, $limit]
    );
    jsonOut(array_map(fn($r) => [
        'id' => (int)$r['id'],
        'reservationId' => $r['reservation_id'] ? (int)$r['reservation_id'] : null,
        'recipientPhone' => $r['recipient_phone'],
        'type' => $r['type'],
        'message' => $r['message'],
        'deliveryStatus' => $r['delivery_status'],
        'requestId' => $r['request_id'],
        'messageId' => $r['message_id'],
        'errorMessage' => $r['error_message'],
        'sentAt' => $r['sent_at'],
    ], $rows));
}

// /api/admin/email-templates
if ($path === '/admin/email-templates') {
    $a = getAdmin($auth);
    if (isSA($a)) errOut('Email šablony jsou dostupné pouze pro adminy konkrétní company.', 403);
    $cid = (int)$a['company_id'];

    if ($method === 'GET') {
        $rows = DB::query(
            'SELECT id, type, subject, body_html, updated_at FROM email_templates WHERE company_id=?',
            [$cid]
        );
        $out = [];
        foreach ($rows as $r) {
            $out[$r['type']] = [
                'id' => (int)$r['id'],
                'type' => $r['type'],
                'subject' => $r['subject'],
                'bodyHtml' => $r['body_html'],
                'updatedAt' => $r['updated_at'],
            ];
        }
        jsonOut($out);
    }

    if ($method === 'PUT') {
        $b = getJson();
        $type = trim($b['type'] ?? '');
        if (!in_array($type, ['customer_summary', 'confirmation', 'cancellation', 'rejection'], true)) {
            errOut('Neplatný typ emailové šablony.');
        }
        $subject = trim($b['subject'] ?? '');
        $bodyHtml = trim($b['bodyHtml'] ?? '');
        if (!$subject || !$bodyHtml) errOut('Vyplňte předmět i tělo šablony.');

        DB::exec(
            'INSERT INTO email_templates (company_id, type, subject, body_html)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE subject=VALUES(subject), body_html=VALUES(body_html)',
            [$cid, $type, $subject, $bodyHtml]
        );

        $row = DB::queryOne(
            'SELECT id, type, subject, body_html, updated_at FROM email_templates WHERE company_id=? AND type=? LIMIT 1',
            [$cid, $type]
        );
        jsonOut([
            'id' => (int)$row['id'],
            'type' => $row['type'],
            'subject' => $row['subject'],
            'bodyHtml' => $row['body_html'],
            'updatedAt' => $row['updated_at'],
        ]);
    }

    errOut('Method not allowed.', 405);
}

// pokud žádná routa nezpracovala, vrátíme false
return false;
