-- === Vytvoření databáze a uživatele pro Active24 ===
--
-- Spusť v MySQL Adminu na Active24 (nebo přes SSH):
--
-- Pokud jsi superadmin s přístupem k CREATE USER:
--

-- Vytvoření databáze
CREATE DATABASE IF NOT EXISTS rezervace_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Vytvoření uživatele
CREATE USER IF NOT EXISTS 'rezervace_user'@'localhost' IDENTIFIED BY 'change-me-password';

-- Udělení práv
GRANT ALL PRIVILEGES ON rezervace_db.* TO 'rezervace_user'@'localhost';
FLUSH PRIVILEGES;

-- Výběr databáze pro další importy
USE rezervace_db;

-- === Schéma tabulek ===
-- Dále následuje obsah z dump_db.sql (zmenšeno, jen schéma)
--
-- Pokud máš shell přístup:
--   mysql -u root -p < dump_db.sql
--
-- Pokud máš jen cPanel:
--   1. Jdi do cPanel → phpMyAdmin
--   2. Vytvoř DB "rezervace_db"
--   3. Vytvoř uživatele "rezervace_user" s heslem
--   4. Dej mu všechna práva na "rezervace_db.*"
--   5. Importuj obsah dump_db.sql přes phpMyAdmin → Import

