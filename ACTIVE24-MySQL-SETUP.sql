-- === Vytvoření databáze a uživatele pro Active24 ===
--
-- Spusť v MySQL Adminu na Active24 (nebo přes SSH):
--
-- Pokud jsi superadmin s přístupem k CREATE USER:
--

-- Vytvoření databáze
CREATE DATABASE IF NOT EXISTS stolni_tenis_rezervace CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Vytvoření uživatele
CREATE USER IF NOT EXISTS 'rezervace_user'@'localhost' IDENTIFIED BY 'change-me-password';

-- Udělení práv
GRANT ALL PRIVILEGES ON stolni_tenis_rezervace.* TO 'rezervace_user'@'localhost';
FLUSH PRIVILEGES;

-- Výběr databáze pro další importy
USE stolni_tenis_rezervace;

-- === Schéma tabulek ===
-- Dále následuje obsah z dump_db.sql (zmenšeno, jen schéma)
--
-- Pokud máš shell přístup:
--   mysql -u root -p < dump_db.sql
--
-- Pokud máš jen cPanel:
--   1. Jdi do cPanel → phpMyAdmin
--   2. Vytvoř DB "stolni_tenis_rezervace"
--   3. Vytvoř uživatele "rezervace_user" s heslem
--   4. Dej mu všechna práva na "stolni_tenis_rezervace.*"
--   5. Importuj obsah dump_db.sql přes phpMyAdmin → Import



