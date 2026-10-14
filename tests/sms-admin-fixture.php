<?php
require __DIR__.'/../api/db.php';
DB::connect(['host'=>'127.0.0.1','port'=>13316,'dbname'=>'rezervace_hall_qa','charset'=>'utf8mb4','username'=>'root','password'=>'']);
$command=$argv[1]??'';
if($command==='schema'){
    foreach(['sms_enabled TINYINT NOT NULL DEFAULT 0','sms_api_key_encrypted TEXT DEFAULT NULL','sms_confirmation_template TEXT DEFAULT NULL'] as $column)DB::exec('ALTER TABLE company_booking_settings ADD COLUMN IF NOT EXISTS '.$column);
    foreach(explode(';',file_get_contents(__DIR__.'/../deploy/migrace_sms_admin_notifications.sql')) as $sql)if(trim($sql))DB::exec($sql);
    DB::exec('CREATE TABLE IF NOT EXISTS sms_logs (id INT AUTO_INCREMENT PRIMARY KEY,company_id INT,reservation_id INT,recipient_phone VARCHAR(50),type VARCHAR(50),message TEXT,delivery_status VARCHAR(20),request_id VARCHAR(100),message_id VARCHAR(100),error_message VARCHAR(1000),sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE)');
    exit;
}
$cid=(int)($argv[2]??0);$company=DB::queryOne('SELECT name FROM companies WHERE id=?',[$cid]);
if(!$company||!str_starts_with($company['name'],'Hall QA '))throw new RuntimeException('Not QA data');
if($command==='users'){
    DB::exec("UPDATE users SET phone='111111111',notify_emails=0 WHERE company_id=? AND role='admin'",[$cid]);
    $create=fn($role,$name,$phone)=>DB::insert('INSERT INTO users(company_id,role,email,password_hash,first_name,last_name,phone,notify_emails) VALUES (?,?,?,\'\',?,\'QA\',?,0)',[$cid,$role,$name.'@example.invalid',$name,$phone]);
    echo json_encode(['second'=>$create('admin','Second','222222222'),'duplicate'=>$create('admin','Same phone','+420 111 111 111'),'invalid'=>$create('admin','No phone',''),'coach'=>$create('coach','Coach','333333333'),'player'=>$create('player','PlayerPhone','444444444')]);
}
if($command==='inspect')echo json_encode(['settings'=>DB::queryOne('SELECT * FROM company_booking_settings WHERE company_id=?',[$cid]),'logs'=>DB::query('SELECT * FROM sms_logs WHERE company_id=? ORDER BY id',[$cid]),'bookings'=>DB::query('SELECT * FROM reservations WHERE company_id=?',[$cid])]);
if($command==='changeRole')DB::exec("UPDATE users SET role='player' WHERE id=? AND company_id=?",[(int)$argv[3],$cid]);
if($command==='clearPhone')DB::exec("UPDATE users SET phone='' WHERE id=? AND company_id=?",[(int)$argv[3],$cid]);
if($command==='poisonIds')DB::exec('UPDATE company_booking_settings SET sms_admin_recipient_ids=? WHERE company_id=?',[$argv[3],$cid]);
