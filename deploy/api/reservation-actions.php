<?php
/** Odkazy z admin e-mailu mají konkrétní akci, příjemce a omezenou platnost. */
function reservationActionToken(int $reservationId, int $companyId, int $adminId, string $action, int $expiresAt, string $secret): string
{
    $payload = rtrim(strtr(base64_encode(json_encode(['rid'=>$reservationId,'cid'=>$companyId,'uid'=>$adminId,'action'=>$action,'exp'=>$expiresAt])), '+/', '-_'), '=');
    return $payload.'.'.hash_hmac('sha256','reservation-action:'.$payload,$secret);
}

function verifyReservationActionToken(string $token, string $secret): ?array
{
    $parts = explode('.', $token);
    if (count($parts)!==2 || !hash_equals(hash_hmac('sha256','reservation-action:'.$parts[0],$secret),$parts[1])) return null;
    $payload = json_decode(base64_decode(strtr($parts[0],'-_','+/'),true) ?: '',true);
    if (!is_array($payload) || (int)($payload['exp']??0)<=time() || !in_array($payload['action']??'', ['approve','cancel'],true)) return null;
    if (empty($payload['rid']) || empty($payload['cid']) || empty($payload['uid'])) return null;
    return $payload;
}

function reservationActionContext(string $token, array $config): array
{
    $payload = verifyReservationActionToken($token,(string)$config['auth']['secret']);
    if (!$payload) errOut('Odkaz je neplatný nebo jeho platnost vypršela.',410);
    $admin = DB::queryOne("SELECT id,company_id,role FROM users WHERE id=? AND company_id=? AND role='admin' AND notify_emails=1",[(int)$payload['uid'],(int)$payload['cid']]);
    if (!$admin) errOut('Příjemce odkazu už nemá oprávnění spravovat tento klub.',403);
    $reservation = DB::queryOne("SELECT r.id,r.company_id,r.status,r.booking_type,c.name AS company_name,cat.name AS category_name,
        COALESCE(NULLIF(r.customer_first_name,''),u.first_name) AS first_name,
        COALESCE(NULLIF(r.customer_last_name,''),u.last_name) AS last_name
        FROM reservations r JOIN companies c ON c.id=r.company_id JOIN categories cat ON cat.id=r.category_id JOIN users u ON u.id=r.user_id
        WHERE r.id=? AND r.company_id=?",[(int)$payload['rid'],(int)$payload['cid']]);
    if (!$reservation || $reservation['booking_type']!=='customer') errOut('Rezervace neexistuje.',404);
    $allowed = $payload['action']==='approve' ? ['pending'] : ['pending','confirmed'];
    if (!in_array($reservation['status'],$allowed,true)) errOut('Tato akce už není dostupná. Rezervace byla vyřízena nebo stornována.',409);
    $slots = reservationSlots((int)$reservation['id']);
    if (!$slots || strtotime($slots[0]['date'].' '.$slots[0]['time_start'])<=time()) errOut('Termín již začal nebo není aktivní.',409);
    return ['payload'=>$payload,'admin'=>$admin,'reservation'=>$reservation,'slots'=>$slots];
}

if ($path==='/reservation-action-info' && $method==='GET') {
    $context = reservationActionContext(qStr('token'),$config);
    $r = $context['reservation'];
    jsonOut(['action'=>$context['payload']['action'],'companyName'=>$r['company_name'],'categoryName'=>$r['category_name'],
        'customerName'=>trim($r['first_name'].' '.$r['last_name']),'slots'=>$context['slots']]);
}

if ($path==='/reservation-action' && $method==='POST') {
    $input = getJson();
    $context = reservationActionContext(trim((string)($input['token']??'')),$config);
    $emailActionAdmin = $context['admin'];
    $path = '/admin/reservations/'.(int)$context['payload']['rid'].'/'.$context['payload']['action'];
    $method = 'PATCH';
}
