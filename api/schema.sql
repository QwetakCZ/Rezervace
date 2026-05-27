-- Úvodní databázové schéma pro rezervační systém stolního tenisu
-- Podporuje multitenancy (SaaS přístup) přes tabulku companies.

CREATE TABLE `companies` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `timezone` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Europe/Prague',
  `brand_color` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '#10d2a2',
  `background_color` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '#06070c',
  `text_color` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '#f4f5f7',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `role` enum('superadmin','admin','coach','player') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'player',
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_credit` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_company_unique` (`email`,`company_id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `default_slot_duration` int(11) NOT NULL DEFAULT 30 COMMENT 'v minutách',
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `resources` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pricing_windows` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `resource_id` int(11) DEFAULT NULL,
  `day_of_week` tinyint(1) NOT NULL COMMENT '1=pondělí, 7=neděle',
  `time_from` time NOT NULL,
  `time_to` time NOT NULL,
  `price_per_slot` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `company_booking_settings` (
  `company_id` int(11) NOT NULL,
  `min_advance_minutes` int(11) NOT NULL DEFAULT 120,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reservations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `resource_id` int(11) NOT NULL,
  `guest_first_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guest_last_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guest_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guest_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  `total_price` decimal(10,2) NOT NULL,
  `payment_method` enum('credit','gateway','cash') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','confirmed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabulka pro exaktní blokaci konkrétních 30min slotů (zamezení double-bookingu)
CREATE TABLE `reservation_slots` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reservation_id` int(11) NOT NULL,
  `resource_id` int(11) NOT NULL,
  `slot_datetime` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `resource_slot_unique` (`resource_id`,`slot_datetime`),
  FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- INICIALIZAČNÍ DATA
INSERT INTO `companies` (`id`, `name`) VALUES (1, 'Pincárna');
INSERT INTO `company_booking_settings` (`company_id`, `min_advance_minutes`) VALUES (1, 120);
INSERT INTO `users` (`company_id`, `role`, `email`, `password_hash`, `first_name`, `last_name`, `current_credit`) VALUES
(1, 'admin', 'admin@pincarna.cz', '$2y$10$vW9U5Q6...HashHesla...', 'Admin', 'Admin', 0);

INSERT INTO `categories` (`id`, `company_id`, `name`, `icon`, `default_slot_duration`) VALUES
(1, 1, 'Stolní tenis', 'trophy', 30),
(2, 1, 'Robot', 'cpu', 30),
(3, 1, 'Trénink s trenérem', 'dumbbell', 30);

INSERT INTO `resources` (`category_id`, `name`) VALUES
(1, 'Stůl 1'), (1, 'Stůl 2'), (1, 'Stůl 3'), (1, 'Stůl 4'),
(2, 'Robot'),
(3, 'Trénink s trenérem');

-- --------------------------------------------------------
-- Tabulka uzivatelu (zakaznici, treneri, administratori)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `role` enum('superadmin','admin','coach','player') NOT NULL DEFAULT 'player',
  `email` varchar(255) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `credit_balance` decimal(10,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_company` (`email`, `company_id`),
  KEY `company_id` (`company_id`),
  CONSTRAINT `fk_users_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Hlavni tabulka rezervaci
-- --------------------------------------------------------
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
  CONSTRAINT `fk_res_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_res_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_res_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Polozky rezervace (konkretni 30min sloty)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reservation_slots` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reservation_id` int(11) NOT NULL,
  `resource_id` int(11) NOT NULL,
  `date` date NOT NULL,
  `time_start` time NOT NULL,
  `time_end` time NOT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_slot` (`resource_id`, `date`, `time_start`),
  KEY `reservation_id` (`reservation_id`),
  CONSTRAINT `fk_slot_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_slot_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ceník: Po-Pá pro Stoly (1)
INSERT INTO `pricing_windows` (`category_id`, `resource_id`, `day_of_week`, `time_from`, `time_to`, `price_per_slot`) VALUES
(1, NULL, 1, '12:00:00', '14:00:00', 50.00),
(1, NULL, 1, '14:00:00', '20:00:00', 60.00),
(1, NULL, 1, '20:00:00', '21:30:00', 40.00),
(1, NULL, 2, '12:00:00', '14:00:00', 50.00),
(1, NULL, 2, '14:00:00', '20:00:00', 60.00),
(1, NULL, 2, '20:00:00', '21:30:00', 40.00),
(1, NULL, 3, '12:00:00', '14:00:00', 50.00),
(1, NULL, 3, '14:00:00', '20:00:00', 60.00),
(1, NULL, 3, '20:00:00', '21:30:00', 40.00),
(1, NULL, 4, '12:00:00', '14:00:00', 50.00),
(1, NULL, 4, '14:00:00', '20:00:00', 60.00),
(1, NULL, 4, '20:00:00', '21:30:00', 40.00),
(1, NULL, 5, '12:00:00', '14:00:00', 50.00),
(1, NULL, 5, '14:00:00', '20:00:00', 60.00),
(1, NULL, 5, '20:00:00', '21:30:00', 40.00),
(1, NULL, 6, '12:00:00', '14:00:00', 50.00),
(1, NULL, 6, '14:00:00', '20:00:00', 60.00),
(1, NULL, 6, '20:00:00', '21:30:00', 40.00),
(1, NULL, 7, '12:00:00', '14:00:00', 50.00),
(1, NULL, 7, '14:00:00', '20:00:00', 60.00),
(1, NULL, 7, '20:00:00', '21:30:00', 40.00);
