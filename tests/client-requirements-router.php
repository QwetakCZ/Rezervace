<?php
// Spouští se výhradně přes CLI test server s vypnutou skutečnou funkcí mail.
if (PHP_SAPI !== 'cli-server' || function_exists('mail') || !getenv('REZERVACE_TEST_MAIL_FILE')) {
    http_response_code(403); exit;
}
if (!function_exists('mail')) {
function mail($to,$subject,$body,$headers='',$params='') {
    file_put_contents(getenv('REZERVACE_TEST_MAIL_FILE'),json_encode(compact('to','subject','body'),JSON_UNESCAPED_UNICODE)."\n",FILE_APPEND|LOCK_EX);
    return true;
}
}
require __DIR__.'/../api/index.php';
