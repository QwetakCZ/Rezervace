-- Požadavky klienta: minimální délka rezervace, zamítnutí, storno zákazníkem,
-- opakované interní rezervace a úplné logování mailů.
-- Spouštět jednou nad databází aplikace.

ALTER TABLE categories
  ADD COLUMN min_booking_slots int(11) NOT NULL DEFAULT 1 AFTER default_slot_duration;

UPDATE categories
SET min_booking_slots = 3
WHERE company_id = 1 AND LOWER(name) LIKE '%stolní tenis%';

UPDATE categories
SET min_booking_slots = 3
WHERE company_id = 2 AND LOWER(name) LIKE '%stolu%';

UPDATE categories
SET min_booking_slots = 2
WHERE company_id = 1 AND LOWER(name) LIKE '%trenér%';

UPDATE categories
SET min_booking_slots = 2
WHERE company_id = 2 AND LOWER(name) LIKE '%trenér%';

-- Robot nebude na veřejném výběru; kategorii lze později znovu zapnout
-- aktivací alespoň jednoho jejího zdroje v administraci.
UPDATE resources r
JOIN categories c ON c.id = r.category_id
SET r.is_active = 0
WHERE c.company_id IN (1, 2) AND LOWER(c.name) LIKE '%robot%';

ALTER TABLE reservations
  MODIFY COLUMN status enum('pending','confirmed','rejected','cancelled') NOT NULL DEFAULT 'confirmed',
  ADD COLUMN booking_type enum('customer','internal') NOT NULL DEFAULT 'customer' AFTER status,
  ADD COLUMN label varchar(255) NULL AFTER booking_type,
  ADD COLUMN recurrence_group char(36) NULL AFTER label,
  ADD COLUMN cancel_token_hash char(64) NULL AFTER recurrence_group,
  ADD COLUMN cancel_token_expires_at datetime NULL AFTER cancel_token_hash,
  ADD COLUMN cancelled_by enum('admin','customer') NULL AFTER cancel_token_expires_at,
  ADD COLUMN cancelled_at datetime NULL AFTER cancelled_by,
  ADD UNIQUE KEY reservation_cancel_token_unique (cancel_token_hash),
  ADD KEY reservation_recurrence_group_idx (recurrence_group);

ALTER TABLE email_templates
  MODIFY COLUMN type enum('customer_summary','confirmation','cancellation','rejection') NOT NULL;

ALTER TABLE email_logs
  MODIFY COLUMN type enum('admin_notification','customer_summary','confirmation','cancellation','rejection','customer_cancellation') NOT NULL,
  ADD COLUMN delivery_status enum('sent','failed') NOT NULL DEFAULT 'sent' AFTER subject,
  ADD COLUMN error_message varchar(500) NULL AFTER delivery_status;
