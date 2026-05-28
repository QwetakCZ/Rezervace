-- --------------------------------------------------------
-- Hostitel:                     127.0.0.1
-- Verze serveru:                10.4.32-MariaDB - mariadb.org binary distribution
-- OS serveru:                   Win64
-- HeidiSQL Verze:               12.17.0.7270
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Exportování struktury databáze pro
DROP DATABASE IF EXISTS `stolni_tenis_rezervace`;
CREATE DATABASE IF NOT EXISTS `stolni_tenis_rezervace` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `stolni_tenis_rezervace`;

-- Exportování struktury pro tabulka stolni_tenis_rezervace.categories
DROP TABLE IF EXISTS `categories`;
CREATE TABLE IF NOT EXISTS `categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `icon` varchar(50) DEFAULT NULL,
  `default_slot_duration` int(11) NOT NULL DEFAULT 30 COMMENT 'v minutách',
  PRIMARY KEY (`id`),
  KEY `company_id` (`company_id`),
  CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.categories: ~7 rows (přibližně)
DELETE FROM `categories`;
INSERT INTO `categories` (`id`, `company_id`, `name`, `description`, `icon`, `default_slot_duration`) VALUES
	(1, 1, 'Stolní tenis', NULL, NULL, 30),
	(2, 1, 'Robot', NULL, NULL, 30),
	(3, 1, 'Trénink s trenérem', NULL, NULL, 30),
	(4, 2, 'Rezervace stolu', NULL, NULL, 30),
	(5, 2, 'Robot', NULL, NULL, 30),
	(6, 2, 'Trénink s trenérem', NULL, NULL, 30);

-- Exportování struktury pro tabulka stolni_tenis_rezervace.companies
DROP TABLE IF EXISTS `companies`;
CREATE TABLE IF NOT EXISTS `companies` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `timezone` varchar(50) NOT NULL DEFAULT 'Europe/Prague',
  `brand_color` varchar(7) NOT NULL DEFAULT '#10d2a2',
  `background_color` varchar(7) NOT NULL DEFAULT '#06070c',
  `text_color` varchar(7) NOT NULL DEFAULT '#f4f5f7',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.companies: ~2 rows (přibližně)
DELETE FROM `companies`;
INSERT INTO `companies` (`id`, `name`, `timezone`, `brand_color`, `background_color`, `text_color`, `created_at`) VALUES
	(1, 'Table Tennis Academy', 'Europe/Prague', '#10d2a2', '#06070c', '#f4f5f7', '2026-02-22 09:39:24'),
	(2, 'Table Tenis Academy - Znojmo', 'Europe/Prague', '#10d2a2', '#06070c', '#f4f5f7', '2026-05-19 21:22:38');

-- Exportování struktury pro tabulka stolni_tenis_rezervace.company_booking_settings
DROP TABLE IF EXISTS `company_booking_settings`;
CREATE TABLE IF NOT EXISTS `company_booking_settings` (
  `company_id` int(11) NOT NULL,
  `min_advance_minutes` int(11) NOT NULL DEFAULT 120,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`company_id`),
  CONSTRAINT `fk_booking_settings_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.company_booking_settings: ~0 rows (přibližně)
DELETE FROM `company_booking_settings`;
INSERT INTO `company_booking_settings` (`company_id`, `min_advance_minutes`, `updated_at`) VALUES
	(2, 300, '2026-05-24 22:14:44');

-- Exportování struktury pro tabulka stolni_tenis_rezervace.pricing_windows
DROP TABLE IF EXISTS `pricing_windows`;
CREATE TABLE IF NOT EXISTS `pricing_windows` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `resource_id` int(11) DEFAULT NULL,
  `day_of_week` tinyint(1) NOT NULL COMMENT '1=pondělí, 7=neděle',
  `time_from` time NOT NULL,
  `time_to` time NOT NULL,
  `price_per_slot` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  KEY `resource_id` (`resource_id`),
  CONSTRAINT `pricing_windows_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pricing_windows_ibfk_2` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=54 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.pricing_windows: ~6 rows (přibližně)
DELETE FROM `pricing_windows`;
INSERT INTO `pricing_windows` (`id`, `category_id`, `resource_id`, `day_of_week`, `time_from`, `time_to`, `price_per_slot`) VALUES
	(43, 4, 7, 1, '08:00:00', '10:00:00', 50.00),
	(44, 4, 8, 1, '08:00:00', '10:00:00', 50.00),
	(45, 4, 9, 1, '08:00:00', '10:00:00', 50.00),
	(46, 4, 10, 1, '08:00:00', '10:00:00', 50.00),
	(51, 6, 12, 1, '08:00:00', '20:00:00', 250.00),
	(52, 6, 13, 1, '08:00:00', '20:00:00', 250.00),
	(53, 6, 14, 1, '08:00:00', '20:00:00', 250.00);

-- Exportování struktury pro tabulka stolni_tenis_rezervace.reservation_slots
DROP TABLE IF EXISTS `reservation_slots`;
CREATE TABLE IF NOT EXISTS `reservation_slots` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reservation_id` int(11) NOT NULL,
  `resource_id` int(11) NOT NULL,
  `date` date NOT NULL,
  `time_start` time NOT NULL,
  `time_end` time NOT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_slot` (`resource_id`,`date`,`time_start`),
  KEY `reservation_id` (`reservation_id`),
  CONSTRAINT `fk_slot_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_slot_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.reservation_slots: ~17 rows (přibližně)
DELETE FROM `reservation_slots`;
INSERT INTO `reservation_slots` (`id`, `reservation_id`, `resource_id`, `date`, `time_start`, `time_end`, `price`) VALUES
	(4, 2, 1, '2026-02-23', '14:00:00', '14:30:00', 50.00),
	(5, 3, 6, '2026-02-23', '10:30:00', '11:00:00', 250.00),
	(6, 3, 6, '2026-02-23', '11:00:00', '11:30:00', 250.00),
	(7, 4, 5, '2026-02-28', '11:00:00', '11:30:00', 200.00),
	(8, 4, 5, '2026-02-28', '11:30:00', '12:00:00', 200.00),
	(9, 5, 7, '2026-05-25', '08:00:00', '08:30:00', 50.00),
	(10, 5, 7, '2026-05-25', '08:30:00', '09:00:00', 50.00),
	(11, 5, 7, '2026-05-25', '09:00:00', '09:30:00', 50.00),
	(12, 6, 13, '2026-05-25', '18:30:00', '19:00:00', 250.00),
	(13, 6, 13, '2026-05-25', '19:00:00', '19:30:00', 250.00),
	(14, 7, 14, '2026-05-25', '08:00:00', '08:30:00', 250.00),
	(15, 7, 14, '2026-05-24', '23:00:00', '23:30:00', 250.00),
	(16, 8, 13, '2026-05-24', '09:00:00', '09:30:00', 250.00),
	(17, 8, 13, '2026-05-25', '09:30:00', '10:00:00', 250.00),
	(18, 9, 8, '2026-06-01', '08:30:00', '09:00:00', 50.00),
	(19, 9, 8, '2026-06-01', '09:00:00', '09:30:00', 50.00),
	(20, 10, 9, '2026-05-25', '08:30:00', '09:00:00', 50.00),
	(21, 10, 9, '2026-05-25', '09:00:00', '09:30:00', 50.00),
	(22, 11, 9, '2026-06-01', '08:30:00', '09:00:00', 50.00),
	(23, 11, 9, '2026-06-01', '09:00:00', '09:30:00', 50.00);

-- Exportování struktury pro tabulka stolni_tenis_rezervace.reservations
DROP TABLE IF EXISTS `reservations`;
CREATE TABLE IF NOT EXISTS `reservations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `category_id` int(11) NOT NULL,
  `total_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` enum('pending','confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
  `note` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `company_id` (`company_id`),
  KEY `user_id` (`user_id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `fk_res_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_res_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_res_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.reservations: ~9 rows (přibližně)
DELETE FROM `reservations`;
INSERT INTO `reservations` (`id`, `company_id`, `user_id`, `category_id`, `total_price`, `status`, `note`, `created_at`) VALUES
	(2, 1, 3, 1, 50.00, 'confirmed', NULL, '2026-02-22 18:33:35'),
	(3, 1, 4, 3, 500.00, 'confirmed', NULL, '2026-02-23 14:12:54'),
	(4, 1, 5, 2, 400.00, 'confirmed', NULL, '2026-02-24 14:24:08'),
	(5, 2, 8, 4, 150.00, 'confirmed', NULL, '2026-05-21 18:43:58'),
	(6, 2, 9, 6, 500.00, 'confirmed', NULL, '2026-05-24 20:17:00'),
	(7, 2, 9, 6, 500.00, 'confirmed', NULL, '2026-05-24 20:19:48'),
	(8, 2, 9, 6, 500.00, 'confirmed', NULL, '2026-05-24 20:29:07'),
	(9, 2, 10, 4, 100.00, 'confirmed', NULL, '2026-05-24 20:32:15'),
	(10, 2, 9, 4, 100.00, 'confirmed', NULL, '2026-05-24 21:20:13'),
	(11, 2, 9, 4, 100.00, 'pending', NULL, '2026-05-27 17:04:36');

-- Exportování struktury pro tabulka stolni_tenis_rezervace.resources
DROP TABLE IF EXISTS `resources`;
CREATE TABLE IF NOT EXISTS `resources` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `resources_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.resources: ~12 rows (přibližně)
DELETE FROM `resources`;
INSERT INTO `resources` (`id`, `category_id`, `name`, `is_active`) VALUES
	(1, 1, 'Stůl 1', 1),
	(2, 1, 'Stůl 2', 1),
	(5, 2, 'Robot', 1),
	(6, 3, 'Trénink s trenérem', 1),
	(7, 4, 'stůl 1', 1),
	(8, 4, 'stůl 2', 1),
	(9, 4, 'stůl 3', 1),
	(10, 4, 'stůl 4', 1),
	(11, 5, 'stůl 5', 1),
	(12, 6, 'Katerina Chernavskaya', 1),
	(13, 6, 'Jindřich Bíla', 1),
	(14, 6, 'Fanda :)', 1);

-- Exportování struktury pro tabulka stolni_tenis_rezervace.users
DROP TABLE IF EXISTS `users`;
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `role` enum('superadmin','admin','coach','player') NOT NULL DEFAULT 'player',
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `current_credit` decimal(10,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_company_unique` (`email`,`company_id`),
  KEY `company_id` (`company_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.users: ~10 rows (přibližně)
DELETE FROM `users`;
INSERT INTO `users` (`id`, `company_id`, `role`, `email`, `password_hash`, `first_name`, `last_name`, `phone`, `current_credit`, `created_at`) VALUES
	(1, 1, 'admin', 'admin@pincarna.cz', '$2y$10$vW9U5Q6...HashHesla...', 'Admin', 'Admin', NULL, 0.00, '2026-02-22 09:39:25'),
	(3, 1, 'player', 'janNovak45613@hjfkla.cz', '', 'Jan', 'Novak', '+420773512385', 0.00, '2026-02-22 19:33:35'),
	(4, 1, 'player', 'jiri@zacek.cz', '', 'Jiri', 'Zacek', '777222333', 0.00, '2026-02-23 15:12:54'),
	(5, 1, 'player', 'hanys.cz@gmail.com', '', 'Lukas ', 'Hanak', '777581850', 0.00, '2026-02-24 15:24:08'),
	(6, 1, 'superadmin', 'radek.vala@seznam.cz', '$2a$10$zMJt3ddnwo4gKpbABJ0wsuy9fjFe6atTPRx0HwxRC0NvI5k1OZpdi', 'Radek', 'Vala', NULL, 0.00, '2026-05-19 21:08:47'),
	(7, 2, 'admin', 'info@ttmk.cz', '$2a$10$Xb6tUVJ35Hpw8I46nf0HKevS9rsBjH7m0pdfW/a9/x3x1mX0cB3aG', 'Jindra', 'Bila', NULL, 0.00, '2026-05-19 21:23:26'),
	(8, 2, 'player', 'kaja@novotknakla.cz', '', 'Karel', 'Novotný', '789456123', 0.00, '2026-05-21 20:43:58'),
	(9, 2, 'player', 'radek.vala@seznam.cz', '$2a$10$0xWJBG9IBas4t3Vb2MAd4OWnxa5fXJFodIa/2WsBluHKmFTsBLJUW', 'Radek', 'Vala', '728015407', 0.00, '2026-05-24 22:17:00'),
	(10, 2, 'player', 'dfoajfkla@dafjkldaf.cz', '', 'Karel', 'Omačka', '45613', 0.00, '2026-05-24 22:32:15'),
	(11, 2, 'admin', 'fanda@ttmk.cz', '$2a$10$8pHkL9xZTK5rLyrHyf0DFOAGfu7AlpMLgQr9hbWEBproWolW0mG8S', 'Fanda', 'Dohnal', NULL, 0.00, '2026-05-24 22:44:56');

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
