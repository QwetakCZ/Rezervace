-- Migrace: Přidat typ 'cancellation' do email_templates
ALTER TABLE email_templates 
  MODIFY COLUMN type ENUM('customer_summary','confirmation','cancellation') NOT NULL;
