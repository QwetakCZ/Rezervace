-- Nové SMS upozornění správcům je ve výchozím stavu VYPNUTÉ.
ALTER TABLE company_booking_settings ADD COLUMN IF NOT EXISTS sms_admin_notification_enabled TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE company_booking_settings ADD COLUMN IF NOT EXISTS sms_admin_notification_template TEXT DEFAULT NULL;
ALTER TABLE company_booking_settings ADD COLUMN IF NOT EXISTS sms_admin_recipient_ids TEXT DEFAULT NULL;
