-- Bezpečná aktivace hráčských účtů a obnova hesla.
CREATE TABLE IF NOT EXISTS `player_account_tokens` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `purpose` enum('activation','password_reset') NOT NULL,
  `token_hash` char(64) NOT NULL,
  `pending_data` text DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `player_account_token_hash_unique` (`token_hash`),
  KEY `player_account_user_purpose_idx` (`user_id`,`purpose`,`created_at`),
  KEY `player_account_expiry_idx` (`expires_at`),
  CONSTRAINT `fk_player_account_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_player_account_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `email_logs`
  MODIFY COLUMN `type` enum(
    'admin_notification','customer_summary','confirmation','cancellation',
    'rejection','customer_cancellation','player_activation','password_reset'
  ) NOT NULL;
