<?php
if(PHP_SAPI!=='cli-server'||function_exists('mail')){http_response_code(403);exit;}
if(!function_exists('mail')){function mail($to,$subject,$body,$headers='',$params=''){return false;}}
require __DIR__.'/../api/db.php';
DB::connect(['host'=>'127.0.0.1','port'=>13316,'dbname'=>'rezervace_hall_qa','charset'=>'utf8mb4','username'=>'root','password'=>'']);
require __DIR__.'/../api/index.php';
