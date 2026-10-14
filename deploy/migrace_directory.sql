CREATE TABLE IF NOT EXISTS directory_mail_batches (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    company_id INT NOT NULL,
    admin_id INT NOT NULL,
    request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status ENUM('processing','complete') NOT NULL,
    recipient_count INT NOT NULL,
    result_json TEXT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY directory_mail_company_date (company_id,created_at),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE email_logs MODIFY COLUMN type ENUM('admin_notification','customer_summary','confirmation','cancellation','rejection','customer_cancellation','player_activation','password_reset','admin_customer_cancellation','directory_message') NOT NULL;
