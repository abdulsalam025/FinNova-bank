-- Synthetic college demo only. Timestamps are UTC DATETIME(6).
-- All foreign keys use InnoDB's default immediate RESTRICT/NO ACTION behavior.
-- No cascading update/delete actions are used, including on CHECK-constrained columns.
CREATE TABLE users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    email VARCHAR(254) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(100) NULL,
    role VARCHAR(20) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    approval_limit DECIMAL(15,2) NULL,
    token_version BIGINT NOT NULL DEFAULT 0,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME(6) NULL,
    last_login_at DATETIME(6) NULL,
    password_changed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_role CHECK (role IN ('CUSTOMER','LOAN_OFFICER','ADMIN')),
    CONSTRAINT ck_users_enabled CHECK (enabled IN (0,1)),
    CONSTRAINT ck_users_password_when_enabled CHECK (
        enabled = 0 OR (password_hash IS NOT NULL AND CHAR_LENGTH(password_hash) = 60
        AND LEFT(password_hash,4) IN ('$2a$','$2b$','$2y$'))
    ),
    CONSTRAINT ck_users_approval_limit CHECK (
        (role = 'CUSTOMER' AND approval_limit IS NULL) OR
        (role IN ('LOAN_OFFICER','ADMIN') AND approval_limit IS NOT NULL AND approval_limit > 0)
    ),
    CONSTRAINT ck_users_security_counters CHECK (token_version >= 0 AND failed_login_attempts >= 0),
    INDEX idx_users_role_enabled (role,enabled)
) ENGINE=InnoDB;

CREATE TABLE customers (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    date_of_birth DATE NOT NULL,
    declared_monthly_income DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    phone VARCHAR(20) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_customers_user UNIQUE (user_id),
    CONSTRAINT fk_customers_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_customers_income CHECK (declared_monthly_income >= 0.00)
) ENGINE=InnoDB;

CREATE TABLE accounts (
    id BIGINT NOT NULL AUTO_INCREMENT,
    customer_id BIGINT NOT NULL,
    account_number VARCHAR(24) NOT NULL,
    nickname VARCHAR(60) NOT NULL,
    account_type VARCHAR(16) NOT NULL DEFAULT 'SAVINGS',
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    closed_at DATETIME(6) NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_accounts_number UNIQUE (account_number),
    CONSTRAINT uq_accounts_id_customer UNIQUE (id,customer_id),
    CONSTRAINT fk_accounts_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT ck_accounts_type CHECK (account_type IN ('SAVINGS','CURRENT')),
    CONSTRAINT ck_accounts_currency CHECK (currency = 'INR'),
    CONSTRAINT ck_accounts_balance CHECK (balance >= 0.00),
    CONSTRAINT ck_accounts_status CHECK (status IN ('ACTIVE','FROZEN','CLOSED')),
    CONSTRAINT ck_accounts_closed CHECK (
        (status = 'CLOSED' AND balance = 0.00 AND closed_at IS NOT NULL) OR
        (status <> 'CLOSED' AND closed_at IS NULL)
    ),
    CONSTRAINT ck_accounts_version CHECK (version >= 0),
    INDEX idx_accounts_customer_status (customer_id,status),
    INDEX idx_accounts_status (status)
) ENGINE=InnoDB;

CREATE TABLE loan_products (
    id BIGINT NOT NULL AUTO_INCREMENT,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    min_principal DECIMAL(15,2) NOT NULL,
    max_principal DECIMAL(15,2) NOT NULL,
    annual_rate DECIMAL(5,2) NOT NULL,
    min_annual_rate DECIMAL(5,2) NOT NULL,
    max_annual_rate DECIMAL(5,2) NOT NULL,
    min_tenure_months INT NOT NULL,
    max_tenure_months INT NOT NULL,
    tenure_step_months INT NOT NULL DEFAULT 1,
    min_age INT NOT NULL DEFAULT 21,
    max_age INT NOT NULL DEFAULT 65,
    max_income_multiplier DECIMAL(7,2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_loan_products_code UNIQUE (code),
    CONSTRAINT uq_loan_products_name UNIQUE (name),
    CONSTRAINT ck_products_principal CHECK (min_principal > 0.00 AND max_principal >= min_principal),
    CONSTRAINT ck_products_rate CHECK (min_annual_rate >= 0.00 AND max_annual_rate <= 100.00
        AND max_annual_rate >= min_annual_rate AND annual_rate BETWEEN min_annual_rate AND max_annual_rate),
    CONSTRAINT ck_products_tenure CHECK (min_tenure_months >= 1 AND max_tenure_months >= min_tenure_months
        AND tenure_step_months >= 1 AND MOD(max_tenure_months-min_tenure_months,tenure_step_months) = 0),
    CONSTRAINT ck_products_age CHECK (min_age >= 18 AND max_age >= min_age AND max_age <= 100),
    CONSTRAINT ck_products_income_multiplier CHECK (max_income_multiplier > 0.00),
    CONSTRAINT ck_products_active CHECK (active IN (0,1)),
    INDEX idx_products_active (active)
) ENGINE=InnoDB;

CREATE TABLE system_settings (
    setting_key VARCHAR(100) NOT NULL,
    setting_value VARCHAR(500) NOT NULL,
    description VARCHAR(500) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (setting_key)
) ENGINE=InnoDB;
