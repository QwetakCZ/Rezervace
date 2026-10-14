-- Rozšíření typů bez změny existujících šablon nebo historie.
ALTER TABLE email_templates MODIFY COLUMN type ENUM('customer_summary','confirmation','cancellation','rejection','customer_cancellation','admin_customer_cancellation') NOT NULL;
ALTER TABLE email_logs MODIFY COLUMN type ENUM('admin_notification','customer_summary','confirmation','cancellation','rejection','customer_cancellation','player_activation','password_reset','admin_customer_cancellation') NOT NULL;
