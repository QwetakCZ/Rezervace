-- SmsManager: nastavení po klubech a auditní log odesílání.
-- Migrace je idempotentní pro MariaDB/MySQL podporující ADD COLUMN IF NOT EXISTS.

ALTER TABLE company_booking_settings
  ADD COLUMN IF NOT EXISTS sms_enabled tinyint(1) NOT NULL DEFAULT 0 AFTER min_advance_minutes,
  ADD COLUMN IF NOT EXISTS sms_api_key_encrypted text NULL AFTER sms_enabled,
  ADD COLUMN IF NOT EXISTS sms_confirmation_template text NULL AFTER sms_api_key_encrypted;

CREATE TABLE IF NOT EXISTS sms_logs (
  id bigint(20) NOT NULL AUTO_INCREMENT,
  company_id int(11) NOT NULL,
  reservation_id int(11) DEFAULT NULL,
  recipient_phone varchar(50) NOT NULL,
  type varchar(50) NOT NULL DEFAULT 'confirmation',
  message text NOT NULL,
  delivery_status enum('accepted','rejected','failed','skipped') NOT NULL,
  request_id varchar(100) DEFAULT NULL,
  message_id varchar(100) DEFAULT NULL,
  error_message varchar(1000) DEFAULT NULL,
  sent_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY sms_logs_company_sent_idx (company_id,sent_at),
  KEY sms_logs_reservation_idx (reservation_id),
  CONSTRAINT sms_logs_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT sms_logs_reservation_fk FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
