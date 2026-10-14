<?php
// Lokální, syntetická data; nikdy nevolat nad produkční konfigurací.
$config = require __DIR__.'/../api/config.php';
if (!in_array($config['db']['host'], ['127.0.0.1','localhost','::1'], true)) throw new RuntimeException('Local DB only');
require __DIR__.'/../api/db.php';
require __DIR__.'/../api/auth.php';
require __DIR__.'/../api/mail.php';
$pdo = DB::connect($config['db']);
$command = $argv[1] ?? '';
if ($command === 'init') {
    $cid = DB::insert('INSERT INTO companies (name) VALUES (?)',['QA-client-20261002-'.bin2hex(random_bytes(6))]);
    $users = [];
    foreach (['admin','muted','player'] as $kind) {
        $users[$kind] = DB::insert('INSERT INTO users (company_id,role,email,password_hash,first_name,last_name,notify_emails) VALUES (?,?,?,?,?,?,?)',
            [$cid,$kind==='player'?'player':'admin',$kind.'@example.invalid',password_hash('QA-only-password',PASSWORD_DEFAULT),$kind,'QA',$kind==='muted'?0:1]);
    }
    $cat = DB::insert("INSERT INTO categories (company_id,name,default_slot_duration,min_booking_slots) VALUES (?,'QA tables',30,3)",[$cid]);
    DB::exec('INSERT INTO company_booking_settings (company_id,min_advance_minutes,sms_enabled) VALUES (?,0,0)',[$cid]);
    $resources = [];
    for ($i=1;$i<=4;$i++) $resources[] = DB::insert('INSERT INTO resources (category_id,name,is_active) VALUES (?,?,1)',[$cat,'QA table '.$i]);
    $windows = [];
    for ($day=1;$day<=7;$day++) foreach ($resources as $resource) {
        $windows[$day][] = DB::insert("INSERT INTO pricing_windows (category_id,resource_id,day_of_week,time_from,time_to,price_per_slot) VALUES (?,?,?,'08:00','22:00',50)",[$cat,$resource,$day]);
    }
    $auth = new Auth($config['auth']['secret']);
    echo json_encode(['cid'=>$cid,'cat'=>$cat,'resources'=>$resources,'windows'=>$windows,'users'=>$users,
        'adminToken'=>$auth->createAdminToken(['id'=>$users['admin'],'company_id'=>$cid,'role'=>'admin']),
        'playerToken'=>$auth->createPlayerToken(['id'=>$users['player'],'company_id'=>$cid,'role'=>'player'])]);
    exit;
}
$cid = (int)($argv[2]??0);
$company = DB::queryOne('SELECT name FROM companies WHERE id=?',[$cid]);
if (!$company || !str_starts_with($company['name'],'QA-client-20261002-')) throw new RuntimeException('Not a QA fixture');
if ($command === 'inspect') {
    echo json_encode(['reservations'=>DB::query('SELECT * FROM reservations WHERE company_id=?',[$cid]),
        'slots'=>DB::query('SELECT rs.* FROM reservation_slots rs JOIN reservations r ON r.id=rs.reservation_id WHERE r.company_id=?',[$cid]),
        'windows'=>DB::query('SELECT pw.* FROM pricing_windows pw JOIN categories c ON c.id=pw.category_id WHERE c.company_id=?',[$cid]),
        'logs'=>DB::query('SELECT * FROM email_logs WHERE company_id=?',[$cid]),
        'templates'=>DB::query('SELECT * FROM email_templates WHERE company_id=?',[$cid])]);
} elseif ($command === 'shared') {
    $cat = DB::queryOne('SELECT id FROM categories WHERE company_id=?',[$cid]);
    echo DB::insert("INSERT INTO pricing_windows (category_id,resource_id,day_of_week,time_from,time_to,price_per_slot) VALUES (?,NULL,7,'06:00','07:00',20)",[(int)$cat['id']]);
} elseif ($command === 'vary') {
    $cat=DB::queryOne('SELECT id FROM categories WHERE company_id=?',[$cid]);
    $resource=DB::queryOne('SELECT id FROM resources WHERE category_id=? ORDER BY id DESC LIMIT 1',[(int)$cat['id']]);
    DB::exec('UPDATE pricing_windows SET price_per_slot=55 WHERE category_id=? AND resource_id=? AND day_of_week=?',[(int)$cat['id'],(int)$resource['id'],(int)$argv[3]]);
    echo 'varied one table price';
} elseif ($command === 'cleanup') {
    DB::exec('DELETE FROM email_logs WHERE company_id=?',[$cid]);
    DB::exec('DELETE FROM sms_logs WHERE company_id=?',[$cid]);
    DB::exec('DELETE rs FROM reservation_slots rs JOIN reservations r ON r.id=rs.reservation_id WHERE r.company_id=?',[$cid]);
    DB::exec('DELETE FROM reservations WHERE company_id=?',[$cid]);
    DB::exec('DELETE FROM companies WHERE id=?',[$cid]);
    echo 'removed QA fixture';
} elseif ($command === 'token') {
    $path=''; $method='';
    require __DIR__.'/../api/reservation-actions.php';
    echo reservationActionToken((int)$argv[3],$cid,(int)$argv[4],$argv[5],(int)$argv[6],$config['auth']['secret']);
} elseif ($command === 'times') {
    $rows = [['date'=>'2026-12-01','time_start'=>'09:00:00','time_end'=>'09:45:00'],
        ['date'=>'2026-12-01','time_start'=>'09:45:00','time_end'=>'10:30:00'],
        ['date'=>'2026-12-01','time_start'=>'09:00:00','time_end'=>'09:45:00']];
    echo json_encode([Mailer::timeVariables(['detailSlots'=>$rows]),Mailer::timeVariables(['detailSlots'=>array_merge($rows,[['date'=>'2026-12-01','time_start'=>'12:00:00','time_end'=>'12:45:00']])])]);
}
