<?php
require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/db.php';
$cfg = require __DIR__ . '/api/config.php';
DB::connect($cfg['db']);

$user = DB::queryOne("SELECT id, email, role, password_hash FROM users WHERE email='radek.vala@seznam.cz' AND role='superadmin' LIMIT 1");
echo "User: "; print_r($user);

$test = 'admin123';
$valid = password_verify($test, $user['password_hash']);
echo "Verify '$test': " . ($valid ? 'OK' : 'FAIL') . "\n";
