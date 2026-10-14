<?php
// Fixed isolated port/database; no project DB credentials are used.
require __DIR__.'/../api/db.php'; require __DIR__.'/../api/auth.php';
$pdo=new PDO('mysql:host=127.0.0.1;port=13316;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE DATABASE IF NOT EXISTS rezervace_hall_qa CHARACTER SET utf8mb4');
DB::connect(['host'=>'127.0.0.1','port'=>13316,'dbname'=>'rezervace_hall_qa','charset'=>'utf8mb4','username'=>'root','password'=>'']);
$command=$argv[1]??'';
if ($command==='init') {
    if (!DB::query("SHOW TABLES LIKE 'companies'")) {
        foreach(explode(';',file_get_contents(__DIR__.'/hall-schema.sql')) as $sql) if(trim($sql)!=='') DB::exec($sql);
    }
    $cid=DB::insert('INSERT INTO companies(name) VALUES (?)',['Hall QA '.bin2hex(random_bytes(6))]);
    $other=DB::insert('INSERT INTO companies(name) VALUES (?)',['Hall QA other '.bin2hex(random_bytes(6))]);
    $admin=DB::insert("INSERT INTO users(company_id,role,email,password_hash,first_name,last_name) VALUES (?,'admin','admin@example.invalid','','Admin','QA')",[$cid]);
    $player=DB::insert("INSERT INTO users(company_id,role,email,password_hash,first_name,last_name) VALUES (?,'player','player@example.invalid','active','Player','QA')",[$cid]);
    $category=fn($company,$name,$duration)=>DB::insert('INSERT INTO categories(company_id,name,default_slot_duration) VALUES (?,?,?)',[$company,$name,$duration]);
    $tables=$category($cid,'Tables',30);$coaches=$category($cid,'Coaches',60);$empty=$category($cid,'Empty category',30);$foreign=$category($other,'Foreign',30);
    $resource=fn($cat,$name,$active=1)=>DB::insert('INSERT INTO resources(category_id,name,is_active) VALUES (?,?,?)',[$cat,$name,$active]);
    $table=$resource($tables,'Table 1');$table2=$resource($tables,'Table 2');$coach=$resource($coaches,'Coach 1');$inactive=$resource($tables,'Inactive',0);$outsider=$resource($foreign,'Foreign table');
    for($day=1;$day<=7;$day++) DB::exec("INSERT INTO pricing_windows(category_id,day_of_week,time_from,time_to,price_per_slot) VALUES (?,?,'08:00','22:00',50)",[$tables,$day]);
    $config=require __DIR__.'/../api/config.php';$auth=new Auth($config['auth']['secret']);
    echo json_encode(compact('cid','other','admin','tables','coaches','empty','foreign','table','table2','coach','inactive','outsider')+[
        'adminToken'=>$auth->createAdminToken(['id'=>$admin,'company_id'=>$cid,'role'=>'admin']),
        'playerToken'=>$auth->createPlayerToken(['id'=>$player,'company_id'=>$cid,'role'=>'player'])]);exit;
}
$cid=(int)($argv[2]??0);$company=DB::queryOne('SELECT name FROM companies WHERE id=?',[$cid]);
if(!$company||!str_starts_with($company['name'],'Hall QA '))throw new RuntimeException('Not synthetic QA data');
if($command==='inspect')echo json_encode(['reservations'=>DB::query('SELECT * FROM reservations WHERE company_id=?',[$cid]),'slots'=>DB::query('SELECT s.* FROM reservation_slots s JOIN reservations r ON r.id=s.reservation_id WHERE r.company_id=?',[$cid])]);
if($command==='coachWindows'){for($day=1;$day<=7;$day++)DB::exec("INSERT INTO pricing_windows(category_id,day_of_week,time_from,time_to,price_per_slot) SELECT id,?,'08:00','22:00',100 FROM categories WHERE company_id=? AND name='Coaches'",[$day,$cid]);}
if($command==='busy'){
    $resource=DB::queryOne('SELECT r.id,r.category_id FROM resources r JOIN categories c ON c.id=r.category_id WHERE c.company_id=? AND r.id=?',[$cid,(int)$argv[3]]);
    if(!$resource)throw new RuntimeException('Foreign resource');
    $admin=DB::queryOne("SELECT id FROM users WHERE company_id=? AND role='admin'",[$cid]);
    $rid=DB::insert("INSERT INTO reservations(company_id,user_id,category_id,status,label) VALUES (?,?,?,'confirmed','existing')",[$cid,$admin['id'],$resource['category_id']]);
    DB::exec('INSERT INTO reservation_slots(reservation_id,resource_id,date,time_start,time_end) VALUES (?,?,?,?,?)',[$rid,$resource['id'],$argv[4],$argv[5],$argv[6]]);
}
if($command==='cleanup')DB::exec('DELETE FROM companies WHERE id=?',[$cid]);
