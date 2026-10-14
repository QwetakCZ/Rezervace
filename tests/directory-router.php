<?php
if (PHP_SAPI!=='cli-server' || function_exists('mail') || !getenv('REZERVACE_TEST_MAIL_FILE')) {http_response_code(403);exit;}
if (!function_exists('mail')) {
    function mail($to,$subject,$body,$headers='',$params='') {
        file_put_contents(getenv('REZERVACE_TEST_MAIL_FILE'),json_encode(compact('to','subject','body','headers'),JSON_UNESCAPED_UNICODE)."\n",FILE_APPEND|LOCK_EX);
        return $to!=='fail@example.invalid';
    }
}
require __DIR__.'/../api/db.php';
DB::connect(['host'=>'127.0.0.1','port'=>13316,'dbname'=>'rezervace_directory_qa','charset'=>'utf8mb4','username'=>'root','password'=>'']);
require __DIR__.'/../api/index.php';
