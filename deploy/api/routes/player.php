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

// /api/player/reservations — vlastní rezervace přihlášeného hráče
if ($path === '/player/reservations' && $method === 'GET') {
    $payload = requireAuth($auth);
    if (strtolower((string)$payload['role']) !== 'player') errOut('Neplatné přihlášení hráče.', 401);
    $uid = (int)$payload['sub']; $cid = (int)($payload['companyId'] ?? 0);
    $rows = DB::query(
        "SELECT r.id,r.status,r.total_price,r.note,r.created_at,c.name AS category_name
         FROM reservations r JOIN categories c ON c.id=r.category_id
         WHERE r.user_id=? AND r.company_id=? AND r.booking_type='customer'
         ORDER BY r.created_at DESC LIMIT 100",
        [$uid,$cid]
    );
    if (!$rows) jsonOut([]);
    $ids=array_column($rows,'id'); $ph=implode(',',array_fill(0,count($ids),'?'));
    $slots=DB::query("SELECT rs.reservation_id,rs.date,rs.time_start,rs.time_end,r.name AS resource_name FROM reservation_slots rs JOIN resources r ON r.id=rs.resource_id WHERE rs.reservation_id IN ($ph) ORDER BY rs.date,rs.time_start",$ids);
    $by=[]; foreach($slots as $slot){$by[(int)$slot['reservation_id']][]=$slot;}
    jsonOut(array_map(fn($r)=>array_merge($r,['id'=>(int)$r['id'],'total_price'=>(float)$r['total_price'],'slots'=>$by[(int)$r['id']]??[]]),$rows));
}

// /api/player/reservations/:id/cancel — storno vlastní rezervace
if (preg_match('#^/player/reservations/(\d+)/cancel$#',$path,$m) && $method === 'PATCH') {
    $payload=requireAuth($auth);
    if (strtolower((string)$payload['role']) !== 'player') errOut('Neplatné přihlášení hráče.',401);
    $rid=(int)$m[1]; $uid=(int)$payload['sub']; $cid=(int)($payload['companyId']??0);
    $row=DB::queryOne(
        "SELECT r.id,r.status,r.company_id,r.user_id,
                COALESCE(NULLIF(r.customer_email,''),u.email) AS email,
                COALESCE(NULLIF(r.customer_first_name,''),u.first_name) AS first_name,
                COALESCE(NULLIF(r.customer_last_name,''),u.last_name) AS last_name,
                co.name AS company_name
         FROM reservations r JOIN users u ON u.id=r.user_id JOIN companies co ON co.id=r.company_id
         WHERE r.id=? AND r.user_id=? AND r.company_id=? LIMIT 1",
        [$rid,$uid,$cid]
    );
    if(!$row) errOut('Rezervace neexistuje.',404);
    if(in_array($row['status'],['cancelled','rejected'],true)) errOut('Rezervace už není aktivní.',409);
    $slots=reservationSlots($rid);
    if(!$slots) errOut('Rezervace už nemá aktivní termín.',409);
    $startsAt=strtotime($slots[0]['date'].' '.$slots[0]['time_start']);
    if($startsAt<=time()) errOut('Probíhající nebo proběhlou rezervaci už nelze stornovat.',409);
    DB::beginTransaction();
    try{
        DB::exec("UPDATE reservations SET status='cancelled',cancelled_by='customer',cancelled_at=NOW(),cancel_token_hash=NULL,note=CONCAT(IFNULL(note,''),'\n[storno zákazníkem]') WHERE id=?",[$rid]);
        DB::exec('DELETE FROM reservation_slots WHERE reservation_id=?',[$rid]);
        DB::commit();
    }catch(\Throwable $e){DB::rollback();errOut('Storno se nepodařilo uložit.',500);}
    try{
        $ref=['date'=>$slots[0]['date'],'slotStarts'=>array_column($slots,'time_start')];
        $mailer->sendCustomerCancellationConfirmation(
            ['id'=>$cid,'name'=>$row['company_name']],
            ['firstName'=>$row['first_name'],'lastName'=>$row['last_name'],'email'=>$row['email']],
            $ref,$rid
        );
    }catch(\Throwable $e){}
    jsonOut(['ok'=>true,'reservationId'=>$rid,'status'=>'cancelled']);
}

return false;
