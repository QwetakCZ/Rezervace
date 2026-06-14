-- ============================================
-- Migrace: Tabulka email_logs
-- Spustit ručně v phpMyAdmin na produkční DB
-- ============================================

CREATE TABLE IF NOT EXISTS `email_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `reservation_id` int(11) DEFAULT NULL,
  `recipient_email` varchar(255) NOT NULL,
  `recipient_name` varchar(255) DEFAULT NULL,
  `type` enum('admin_notification','customer_summary','confirmation') NOT NULL,
  `subject` varchar(255) NOT NULL,
  `sent_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `company_id` (`company_id`),
  KEY `reservation_id` (`reservation_id`),
  KEY `sent_at` (`sent_at`),
  CONSTRAINT `fk_emaillog_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_emaillog_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
