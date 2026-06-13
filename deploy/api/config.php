<?php
/**
 * Konfigurace API - LOCALHOST (vývoj)
 */

return [
    'db' => [
        'host'     => 'localhost',
        'port'     => '3306',
        'dbname'   => 'stolni_tenis_rezervace',
        'username' => 'root',
        'password' => '',
        'charset'  => 'utf8mb4',
    ],
    'auth' => [
        'secret'          => 'zmen-tajny-klic-na-active24',
        'admin_token_ttl' => 43200,
    ],
    'defaults' => [
        'min_advance_minutes' => 120,
        'company_id'          => 1,
    ],
];
