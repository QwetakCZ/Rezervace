<?php
/** Adresář vždy patří pouze klubu přihlášeného administrátora. */
function directoryIdentity(array $contact): string
{
    $name=fn($value)=>mb_strtolower(preg_replace('/\s+/u',' ',trim((string)$value)),'UTF-8');
    return hash('sha256',json_encode([strtolower(trim($contact['email'])),$name($contact['firstName']),$name($contact['lastName']),preg_replace('/[^0-9+]/','',(string)($contact['phone']??''))],JSON_UNESCAPED_UNICODE));
}

function directoryContacts(int $companyId): array
{
    $contacts=[]; $registered=[];
    $users=DB::query("SELECT id,email,first_name,last_name,phone,created_at,(password_hash IS NOT NULL AND password_hash<>'') AS registered FROM users WHERE company_id=? AND role='player' ORDER BY id",[$companyId]);
    foreach ($users as $user) {
        $contact=['firstName'=>$user['first_name'],'lastName'=>$user['last_name'],'email'=>strtolower(trim($user['email'])),'phone'=>$user['phone']??'',
            'createdAt'=>$user['created_at'],'bookingCount'=>0,'lastBookingAt'=>null,'registered'=>(bool)$user['registered']];
        $identity=directoryIdentity($contact); $id=$user['registered'] ? 'player:'.$user['id'] : 'guest:'.$identity;
        $contact['id']=$id; $contacts[$id]=$contact;
        if ($user['registered']) $registered[$identity]=$id;
    }
    $bookings=DB::query("SELECT r.created_at,
        COALESCE(NULLIF(r.customer_first_name,''),u.first_name,'') AS first_name,
        COALESCE(NULLIF(r.customer_last_name,''),u.last_name,'') AS last_name,
        COALESCE(NULLIF(r.customer_email,''),u.email,'') AS email,
        CASE WHEN r.customer_email IS NOT NULL THEN r.customer_phone ELSE u.phone END AS phone
        FROM reservations r LEFT JOIN users u ON u.id=r.user_id AND u.company_id=r.company_id
        WHERE r.company_id=? AND r.booking_type='customer' ORDER BY r.created_at,r.id",[$companyId]);
    foreach ($bookings as $booking) {
        $contact=['firstName'=>$booking['first_name'],'lastName'=>$booking['last_name'],'email'=>strtolower(trim($booking['email'])),'phone'=>$booking['phone']??'',
            'createdAt'=>$booking['created_at'],'bookingCount'=>0,'lastBookingAt'=>null];
        if ($contact['email']==='' && $contact['firstName']==='' && $contact['lastName']==='') continue;
        $identity=directoryIdentity($contact); $id=$registered[$identity] ?? 'guest:'.$identity;
        if (!isset($contacts[$id])) { $contact['id']=$id; $contact['registered']=false; $contacts[$id]=$contact; }
        $contacts[$id]['bookingCount']++; $contacts[$id]['lastBookingAt']=$booking['created_at'];
        if (!$contacts[$id]['registered']) $contacts[$id]['createdAt']=min($contacts[$id]['createdAt'],$booking['created_at']);
    }
    foreach ($contacts as &$contact) $contact['canEmail']=(bool)filter_var($contact['email'],FILTER_VALIDATE_EMAIL);
    unset($contact); $contacts=array_values($contacts);
    usort($contacts,fn($a,$b)=>strcmp(mb_strtolower($a['lastName'].' '.$a['firstName']),mb_strtolower($b['lastName'].' '.$b['firstName'])) ?: strcmp($a['id'],$b['id']));
    return $contacts;
}

function directoryValidationError(string $message, int $status=400): void
{
    jsonOut(['error'=>$message,'deliveryStarted'=>false],$status);
}

if ($path==='/admin/directory' && $method==='GET') {
    $admin=getAdmin($auth);
    if (isSA($admin)) errOut('Adresář je dostupný administrátorovi konkrétního klubu.',403);
    jsonOut(['contacts'=>directoryContacts((int)$admin['company_id'])]);
}

if ($path==='/admin/directory/email' && $method==='POST') {
    $admin=getAdmin($auth);
    if (isSA($admin)) errOut('Zprávy může odesílat administrátor konkrétního klubu.',403);
    $cid=(int)$admin['company_id']; $input=getJson();
    $requestId=(string)($input['requestId']??''); $subject=trim((string)($input['subject']??'')); $message=trim((string)($input['message']??''));
    $rawIds=$input['contactIds']??[];
    if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i',$requestId)) directoryValidationError('Neplatný identifikátor zprávy. Obnovte formulář.');
    if (!$subject || mb_strlen($subject)>200 || preg_match('/[\r\n\x00]/',$subject)) directoryValidationError('Vyplňte předmět do 200 znaků bez zalomení řádků.');
    if (!$message || mb_strlen($message)>10000 || str_contains($message,"\0")) directoryValidationError('Vyplňte text zprávy do 10 000 znaků.');
    if (!is_array($rawIds) || !$rawIds || count($rawIds)>300) directoryValidationError('Vyberte 1 až 300 kontaktů (nejvýše 100 e-mailových adres).');
    foreach ($rawIds as $id) if (!is_string($id) || !preg_match('/^(player:\d+|guest:[a-f0-9]{64})$/',$id)) directoryValidationError('Neplatný výběr kontaktů.');
    $ids=array_values(array_unique($rawIds)); sort($ids);
    $all=[]; foreach (directoryContacts($cid) as $contact) $all[$contact['id']]=$contact;
    $recipients=[];
    foreach ($ids as $id) {
        if (!isset($all[$id])) directoryValidationError('Některý kontakt už není v adresáři vašeho klubu. Obnovte adresář.',409);
        $contact=$all[$id]; if (!$contact['canEmail']) directoryValidationError('Výběr obsahuje kontakt bez platného e-mailu.');
        $recipients[$contact['email']]=$contact;
    }
    if (count($recipients)>100) directoryValidationError('Jednou zprávou můžete oslovit nejvýše 100 e-mailových adres.');
    ksort($recipients);
    $company=DB::queryOne('SELECT id,name FROM companies WHERE id=?',[$cid]);
    $hash=hash('sha256',json_encode([$ids,array_keys($recipients),$subject,$message],JSON_UNESCAPED_UNICODE));
    try {
        DB::exec("INSERT INTO directory_mail_batches (id,company_id,admin_id,request_hash,status,recipient_count) VALUES (?,?,?,?,'processing',?)",[$requestId,$cid,(int)$admin['id'],$hash,count($recipients)]);
    } catch (Throwable $e) {
        $existing=DB::queryOne('SELECT company_id,admin_id,request_hash,status,result_json FROM directory_mail_batches WHERE id=?',[$requestId]);
        if (!$existing) directoryValidationError('Zprávu se nepodařilo připravit. Zatím nebylo nic odesláno.',503);
        if ((int)$existing['company_id']!==$cid || (int)$existing['admin_id']!==(int)$admin['id']) errOut('Tento identifikátor zprávy není dostupný.',403);
        if (!hash_equals($existing['request_hash'],$hash)) errOut('Tento identifikátor už patří jiné zprávě. Začněte novou zprávu.',409);
        if ($existing['status']==='complete') jsonOut(array_merge(json_decode($existing['result_json'],true)?:[],['alreadyProcessed'=>true]));
        errOut('Tato zpráva se už odesílá nebo její odesílání bylo přerušeno. Před dalším pokusem zkontrolujte e-mailové logy.',409);
    }
    $sent=0; $failures=[];
    foreach ($recipients as $email=>$contact) {
        try { $ok=$mailer->sendDirectoryMessage($company,$contact,$subject,$message,(string)$admin['email']); }
        catch (Throwable $e) { $ok=false; }
        if ($ok) $sent++; else $failures[]=$email;
    }
    $result=['ok'=>true,'total'=>count($recipients),'sent'=>$sent,'failed'=>count($failures),'failures'=>$failures];
    DB::exec("UPDATE directory_mail_batches SET status='complete',result_json=? WHERE id=? AND company_id=?",[json_encode($result,JSON_UNESCAPED_UNICODE),$requestId,$cid]);
    jsonOut($result);
}
return false;
