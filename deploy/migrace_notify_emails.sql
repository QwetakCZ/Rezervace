-- Migrace: Přidat sloupec notify_emails do users
-- Umožňuje adminům vypnout/zapnout emailové notifikace o rezervacích

ALTER TABLE users
  ADD COLUMN notify_emails TINYINT(1) NOT NULL DEFAULT 1
  AFTER phone;
