<?php
declare(strict_types=1);
ob_start();
ini_set('display_errors','0');
error_reporting(0);
require_once __DIR__.'/config.php';
require_once __DIR__.'/db.php';
require_once __DIR__.'/auth.php';
require_once __DIR__.'/slots.php';
$config=require __DIR__.'/config.php';
try{DB::connect($config['db']);}catch(\Throwable $e){http_response_code(500);header('Content-Type: application/json');echo json_encode(['ok'=>false,'error'=>'DB']);exit;}
$auth=new Auth($config['auth']['secret'],$config['auth']['admin_token_ttl']);
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Authorization');
if($_SERVER['REQUEST_METHOD']==='OPTIONS'){http_response_code(204);exit;}
$requestUri=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH);
$apiPos=strpos($requestUri,'/api/');
$path=$apiPos!==false?'/'.trim(substr($requestUri,$apiPos+4),'/'):'/';
$method=$_SERVER['REQUEST_METHOD'];
function getJson():array{$r=file_get_contents('php://input');return json_decode($r?:'{}',true)?:[];}
function jsonOut(array $data,int $code=200):void{if(ob_get_level())ob_end_clean();http_response_code($code);header('Content-Type: application/json; charset=utf-8');echo json_encode($data,JSON_UNESCAPED_UNICODE);exit;}
function errOut(string $m,int $c=400):void{jsonOut(['error'=>$m],$c);}
function qInt(string $k,int $d=0):int{return(int)($_GET[$k]??$d);}
function qStr(string $k,string $d=''):string{return trim($_GET[$k]??$d);}
function requireAuth(Auth $auth):array{$t=Auth::extractBearerToken();$p=$auth->verifyToken($t);if(!$p)errOut('Neplatne nebo expirovane prihlaseni.',401);return $p;}
function getAdmin(Auth $auth):array{$p=requireAuth($auth);$a=DB::queryOne('SELECT id,company_id,role,email,first_name,last_name FROM users WHERE id=? LIMIT 1',[(int)$p['sub']]);if(!$a||!in_array($a['role'],['admin','superadmin'])||($a['role']!=='superadmin'&&(int)$a['company_id']!==(int)($p['companyId']??0)))errOut('Prihlaseni uz neni platne.',401);return $a;}
function isSA(array $a):bool{return strtolower($a['role'])==='superadmin';}
function hasAccess(array $a,int $c):bool{return isSA($a)||(int)$a['company_id']===$c;}
function normHex(?string $v,?string $fb=null):?string{$r=trim($v??'');if($r==='')return $fb;if(preg_match('/^#([0-9a-f]{3})$/i',$r,$m))return '#'.$m[1][0].$m[1][0].$m[1][1].$m[1][1].$m[1][2].$m[1][2];if(preg_match('/^#([0-9a-f]{6})$/i',$r,$m))return '#'.strtolower($m[1]);return $fb;}
function normTime(string $v):string{$r=trim($v);if(preg_match('/^\d{2}:\d{2}$/',$r))return $r.':00';if(preg_match('/^\d{2}:\d{2}:\d{2}$/',$r))return $r;return '';}
function getBS(int $cid,int $def):array{$row=DB::queryOne('SELECT company_id,min_advance_minutes FROM company_booking_settings WHERE company_id=? LIMIT 1',[$cid]);if(!$row){DB::exec('INSERT INTO company_booking_settings (company_id,min_advance_minutes) VALUES(?,?) ON DUPLICATE KEY UPDATE company_id=company_id',[$cid,$def]);return['companyId'=>$cid,'minAdvanceMinutes'=>$def];}return['companyId'=>(int)$row['company_id'],'minAdvanceMinutes'=>max((int)$row['min_advance_minutes'],0)];}
function hashPw(string $p):string{return password_hash($p,PASSWORD_BCRYPT,['cost'=>10]);}
function getBookingSettings(int $cid,int $def):array{return getBS($cid,$def);}
$routed=require __DIR__.'/routes/public.php';if($routed)exit;
$routed=require __DIR__.'/routes/player.php';if($routed)exit;
$routed=require __DIR__.'/routes/admin.php';if($routed)exit;
$routed=require __DIR__.'/routes/admin2.php';if($routed)exit;
errOut('Endpoint nenalezen: '.$path,404);