<?php
/**
 * Konfigurace API - PRODUKCE (Active24)
 * 
 * TENTO SOUBOR PŘEJMENUJ NA config.php A NAHRAĎ JÍM PŮVODNÍ config.php
 * PO NAHRÁNÍ NA SERVER!
 */

// ============================================
// 1. NASTAV DATABÁZI (údaje z Active24 adminu)
// ============================================

$DB_HOST     = 'db.r4.active24.cz';           // ověř v Active24 adminu!
$DB_PORT     = '3306';
$DB_NAME     = 'TVOJE_DB_NAZEV';              // <-- DOPLŇ!
$DB_USER     = 'TVUJ_DB_UZIVATEL';            // <-- DOPLŇ!
$DB_PASS     = 'TVOJE_DB_HESLO';              // <-- DOPLŇ!

// ============================================
// 2. NASTAV TAJNÝ KLÍČ (vygeneruj náhodný!)
// ============================================

$AUTH_SECRET = 'SEM_VYGENERUJ_NAHODNY_RETEZEC_ASPO_32_ZNAKU';  // <-- ZMĚŇ!

// ============================================
// NEMĚŇ NÍŽE
// ============================================

return [
    'db' => [
        'host'     => $DB_HOST,
        'port'     => $DB_PORT,
        'dbname'   => $DB_NAME,
        'username' => $DB_USER,
        'password' => $DB_PASS,
        'charset'  => 'utf8mb4',
    ],
    'auth' => [
        'secret'          => $AUTH_SECRET,
        'admin_token_ttl' => 43200,
    ],
    'defaults' => [
        'min_advance_minutes' => 120,
        'company_id'          => 1,
    ],
];
