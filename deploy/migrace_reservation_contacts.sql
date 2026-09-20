ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS customer_first_name varchar(100) NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS customer_last_name varchar(100) NULL AFTER customer_first_name,
  ADD COLUMN IF NOT EXISTS customer_email varchar(255) NULL AFTER customer_last_name,
  ADD COLUMN IF NOT EXISTS customer_phone varchar(50) NULL AFTER customer_email;

UPDATE reservations r
JOIN users u ON u.id = r.user_id
SET
  r.customer_first_name = COALESCE(NULLIF(r.customer_first_name, ''), u.first_name),
  r.customer_last_name = COALESCE(NULLIF(r.customer_last_name, ''), u.last_name),
  r.customer_email = COALESCE(NULLIF(r.customer_email, ''), u.email),
  r.customer_phone = COALESCE(NULLIF(r.customer_phone, ''), u.phone)
WHERE r.booking_type = 'customer';
