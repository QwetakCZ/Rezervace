<?php
// Tento fixture nikdy nepoužije projektovou databázi ani vzdálený server.
require __DIR__.'/../api/db.php'; require __DIR__.'/../api/auth.php';
$config=require __DIR__.'/../api/config.php';
DB::connect(['host'=>'127.0.0.1','port'=>13316,'dbname'=>'rezervace_directory_qa','charset'=>'utf8mb4','username'=>'root','password'=>'']);
$command=$argv[1]??'';
if ($command==='init') {
    $cid=DB::insert('INSERT INTO companies (name) VALUES (?)',['Directory QA '.bin2hex(random_bytes(6))]);
    $other=DB::insert('INSERT INTO companies (name) VALUES (?)',['Directory QA other '.bin2hex(random_bytes(6))]);
    $newUser=fn($company,$role,$email,$first,$last,$phone,$registered)=>DB::insert('INSERT INTO users (company_id,role,email,password_hash,first_name,last_name,phone) VALUES (?,?,?,?,?,?,?)',[$company,$role,$email,$registered?password_hash('QA-only',PASSWORD_DEFAULT):'',$first,$last,$phone]);
    $admin=$newUser($cid,'admin','admin@example.invalid','Admin','QA','',true);
    $player=$newUser($cid,'player','family@example.invalid','Radek','QA','+420111111111',true);
    $guest=$newUser($cid,'player','guest@example.invalid','Guest','QA','+420222222222',false);
    $pending=$newUser($cid,'player','pending@example.invalid','Pending','QA','',false);
    $foreign=$newUser($other,'player','foreign@example.invalid','Foreign','QA','',true);
    $foreignAdmin=$newUser($other,'admin','foreign-admin@example.invalid','ForeignAdmin','QA','',true);
    $coach=$newUser($cid,'coach','coach@example.invalid','Coach','QA','',true);
    $super=$newUser($cid,'superadmin','super@example.invalid','Super','QA','',true);
    $booking=fn($uid,$first,$email,$phone,$type='customer')=>DB::insert('INSERT INTO reservations (company_id,user_id,booking_type,customer_first_name,customer_last_name,customer_email,customer_phone) VALUES (?,?,?,?,?,?,?)',[$cid,$uid,$type,$first,'QA',$email,$phone]);
    $booking($player,'Radek','family@example.invalid','+420111111111');
    $booking($player,'Father','family@example.invalid','+420333333333');
    $booking($player,'Father','family@example.invalid','+420333333333');
    $booking($player,'Brother','family@example.invalid','+420444444444');
    $booking($guest,'Guest','guest@example.invalid','+420222222222');
    $booking($guest,'NoPhone','family@example.invalid',null);
    $booking($admin,'Internal','internal@example.invalid','+420999999999','internal');
    $newUser($cid,'player','invalid-email','Invalid','QA','',false);
    $newUser($cid,'player','fail@example.invalid','Fail','QA','',false);
    $auth=new Auth($config['auth']['secret']);
    echo json_encode(['cid'=>$cid,'other'=>$other,'player'=>$player,'foreign'=>$foreign,
        'adminToken'=>$auth->createAdminToken(['id'=>$admin,'company_id'=>$cid,'role'=>'admin']),
        'foreignToken'=>$auth->createAdminToken(['id'=>$foreignAdmin,'company_id'=>$other,'role'=>'admin']),
        'playerToken'=>$auth->createPlayerToken(['id'=>$player,'company_id'=>$cid,'role'=>'player']),
        'superToken'=>$auth->createAdminToken(['id'=>$super,'company_id'=>$cid,'role'=>'superadmin'])]); exit;
}
$cid=(int)($argv[2]??0);$company=DB::queryOne('SELECT name FROM companies WHERE id=?',[$cid]);
if (!$company || !str_starts_with($company['name'],'Directory QA ')) throw new RuntimeException('Not QA data');
if ($command==='inspect') echo json_encode(['logs'=>DB::query('SELECT * FROM email_logs WHERE company_id=?',[$cid]),'batches'=>DB::query('SELECT * FROM directory_mail_batches WHERE company_id=?',[$cid])]);
if ($command==='many') {for($i=0;$i<101;$i++)DB::exec("INSERT INTO users (company_id,role,email,password_hash,first_name,last_name) VALUES (?,'player',?,'','Many','QA')",[$cid,'many'.$i.'@example.invalid']);}
if ($command==='pending') DB::exec("UPDATE directory_mail_batches SET status='processing',result_json=NULL WHERE company_id=? AND id=?",[$cid,$argv[3]]);
if ($command==='deletePlayer') DB::exec("DELETE FROM users WHERE id=? AND company_id=? AND role='player'",[(int)$argv[3],$cid]);
if ($command==='cleanup') {DB::exec('DELETE FROM companies WHERE id=?',[$cid]); echo 'QA data removed';}
