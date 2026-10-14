<?php
// Real mail AND cURL functions must be disabled. Nothing can reach the SMS provider.
if(PHP_SAPI!=='cli-server'||function_exists('mail')||function_exists('curl_init')||!getenv('REZERVACE_SMS_CAPTURE')){http_response_code(403);exit;}
if(!function_exists('mail')){function mail($to,$subject,$body,$headers='',$params=''){return false;}}
if(!function_exists('curl_init')){
    function curl_init($url=null){return (object)['url'=>$url,'options'=>[],'code'=>200];}
    function curl_setopt_array($handle,$options){$handle->options=$options;return true;}
    function curl_exec($handle){
        $payload=json_decode($handle->options[CURLOPT_POSTFIELDS],true);
        file_put_contents(getenv('REZERVACE_SMS_CAPTURE'),json_encode(['url'=>$handle->url,'payload'=>$payload])."\n",FILE_APPEND|LOCK_EX);
        if(getenv('REZERVACE_SMS_FAIL')==='1'){$handle->code=503;return '{}';}
        return json_encode(['request_id'=>'qa-request','accepted'=>[['message_id'=>'qa-message']]]);
    }
    function curl_error($handle){return '';}
    function curl_getinfo($handle,$option){return $handle->code;}
    function curl_close($handle){}
}
require __DIR__.'/../api/db.php';
DB::connect(['host'=>'127.0.0.1','port'=>13316,'dbname'=>'rezervace_hall_qa','charset'=>'utf8mb4','username'=>'root','password'=>'']);
require __DIR__.'/../api/index.php';
