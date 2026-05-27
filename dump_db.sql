-- --------------------------------------------------------
-- Hostitel:                     db.r4.active24.cz
-- Verze serveru:                11.4.10-MariaDB-ubu2204-log - mariadb.org binary distribution
-- OS serveru:                   debian-linux-gnu
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
CREATE DATABASE IF NOT EXISTS `stolni_tenis_rezervace` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `stolni_tenis_rezervace`;

-- Exportování struktury pro tabulka stolni_tenis_rezervace.categories
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.categories: ~3 rows (přibližně)
REPLACE INTO `categories` (`id`, `company_id`, `name`, `description`, `icon`, `default_slot_duration`) VALUES
	(1, 1, 'Stolní tenis', NULL, 'trophy', 30),
	(2, 1, 'Robot', NULL, 'cpu', 30),
	(3, 1, 'Trénink s trenérem', NULL, 'dumbbell', 30);

-- Exportování struktury pro tabulka stolni_tenis_rezervace.companies
CREATE TABLE IF NOT EXISTS `companies` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `timezone` varchar(50) NOT NULL DEFAULT 'Europe/Prague',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.companies: ~1 rows (přibližně)
REPLACE INTO `companies` (`id`, `name`, `timezone`, `created_at`) VALUES
	(1, 'Table Tennis Academy', 'Europe/Prague', '2026-02-22 09:39:24');

-- Exportování struktury pro tabulka stolni_tenis_rezervace.company_booking_settings
CREATE TABLE IF NOT EXISTS `company_booking_settings` (
  `company_id` int(11) NOT NULL,
  `min_advance_minutes` int(11) NOT NULL DEFAULT 120,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`company_id`),
  CONSTRAINT `company_booking_settings_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.company_booking_settings: ~1 rows (přibližně)
REPLACE INTO `company_booking_settings` (`company_id`, `min_advance_minutes`, `updated_at`) VALUES
	(1, 120, '2026-05-24 00:00:00');

-- Exportování struktury pro tabulka stolni_tenis_rezervace.pricing_windows
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
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.pricing_windows: ~4 rows (přibližně)
REPLACE INTO `pricing_windows` (`id`, `category_id`, `resource_id`, `day_of_week`, `time_from`, `time_to`, `price_per_slot`) VALUES
  (22, 1, NULL, 1, '12:00:00', '14:30:00', 50.00),
  (23, 1, NULL, 1, '19:00:00', '22:00:00', 70.00),
  (24, 2, NULL, 6, '09:00:00', '20:00:00', 200.00),
  (25, 3, NULL, 1, '08:00:00', '12:00:00', 250.00);

-- Exportování struktury pro tabulka stolni_tenis_rezervace.reservation_slots
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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.reservation_slots: ~8 rows (přibližně)
REPLACE INTO `reservation_slots` (`id`, `reservation_id`, `resource_id`, `date`, `time_start`, `time_end`, `price`) VALUES
	(1, 1, 1, '2026-02-23', '12:30:00', '13:00:00', 50.00),
	(2, 1, 1, '2026-02-23', '13:00:00', '13:30:00', 50.00),
	(3, 1, 1, '2026-02-23', '13:30:00', '14:00:00', 50.00),
	(4, 2, 1, '2026-02-23', '14:00:00', '14:30:00', 50.00),
	(5, 3, 6, '2026-02-23', '10:30:00', '11:00:00', 250.00),
	(6, 3, 6, '2026-02-23', '11:00:00', '11:30:00', 250.00),
	(7, 4, 5, '2026-02-28', '11:00:00', '11:30:00', 200.00),
	(8, 4, 5, '2026-02-28', '11:30:00', '12:00:00', 200.00);

-- Exportování struktury pro tabulka stolni_tenis_rezervace.reservations
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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.reservations: ~4 rows (přibližně)
REPLACE INTO `reservations` (`id`, `company_id`, `user_id`, `category_id`, `total_price`, `status`, `note`, `created_at`) VALUES
	(1, 1, 2, 1, 150.00, 'confirmed', NULL, '2026-02-22 16:59:00'),
	(2, 1, 3, 1, 50.00, 'confirmed', NULL, '2026-02-22 18:33:35'),
	(3, 1, 4, 3, 500.00, 'confirmed', NULL, '2026-02-23 14:12:54'),
	(4, 1, 5, 2, 400.00, 'confirmed', NULL, '2026-02-24 14:24:08');

-- Exportování struktury pro tabulka stolni_tenis_rezervace.resources
CREATE TABLE IF NOT EXISTS `resources` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `resources_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.resources: ~4 rows (přibližně)
REPLACE INTO `resources` (`id`, `category_id`, `name`, `is_active`) VALUES
	(1, 1, 'Stůl 1', 1),
	(2, 1, 'Stůl 2', 1),
	(5, 2, 'Robot', 1),
	(6, 3, 'Trénink s trenérem', 1);

-- Exportování struktury pro tabulka stolni_tenis_rezervace.users
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `role` enum('admin','coach','player') NOT NULL DEFAULT 'player',
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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportování dat pro tabulku stolni_tenis_rezervace.users: ~5 rows (přibližně)
REPLACE INTO `users` (`id`, `company_id`, `role`, `email`, `password_hash`, `first_name`, `last_name`, `phone`, `current_credit`, `created_at`) VALUES
	(1, 1, 'admin', 'admin@pincarna.cz', '$2y$10$vW9U5Q6...HashHesla...', 'Admin', 'Admin', NULL, 0.00, '2026-02-22 09:39:25'),
	(2, 1, 'player', 'radek.vala@seznam.cz', '', 'Radek', 'Vala', '+420728015407', 0.00, '2026-02-22 17:59:00'),
	(3, 1, 'player', 'janNovak45613@hjfkla.cz', '', 'Jan', 'Novak', '+420773512385', 0.00, '2026-02-22 19:33:35'),
	(4, 1, 'player', 'jiri@zacek.cz', '', 'Jiri', 'Zacek', '777222333', 0.00, '2026-02-23 15:12:54'),
	(5, 1, 'player', 'hanys.cz@gmail.com', '', 'Lukas ', 'Hanak', '777581850', 0.00, '2026-02-24 15:24:08');

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
