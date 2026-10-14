<?php
// Only the isolated test database on :13316, never the configured project DB.
require __DIR__.'/../api/db.php';
DB::connect(['host'=>'127.0.0.1','port'=>13316,'dbname'=>'rezervace_hall_qa','charset'=>'utf8mb4','username'=>'root','password'=>'']);
$command=$argv[1]??'';
if($command==='schema') {
    DB::exec(explode(';',file_get_contents(__DIR__.'/../deploy/migrace_player_accounts.sql'))[0]);
    exit;
}
$cid=(int)($argv[2]??0);$company=DB::queryOne('SELECT name FROM companies WHERE id=?',[$cid]);
if(!$company||!str_starts_with($company['name'],'Hall QA '))throw new RuntimeException('Not synthetic QA data');
if($command==='expire') DB::exec('UPDATE player_account_tokens SET expires_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE company_id=? AND token_hash=?',[$cid,hash('sha256',$argv[3])]);
if($command==='inspect')echo json_encode(DB::query("SELECT id,company_id,email,password_hash FROM users WHERE company_id=? AND role='player'",[$cid]));
