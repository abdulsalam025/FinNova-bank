-- Services must create these records only after valid approval/disbursement.
CREATE TABLE loans (
    id BIGINT NOT NULL AUTO_INCREMENT,
    loan_application_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    disbursement_account_id BIGINT NOT NULL,
    principal DECIMAL(15,2) NOT NULL,
    annual_rate DECIMAL(5,2) NOT NULL,
    tenure_months INT NOT NULL,
    emi_amount DECIMAL(15,2) NOT NULL,
    outstanding_principal DECIMAL(15,2) NOT NULL,
    status VARCHAR(16) NOT NULL,
    disbursed_at DATETIME(6) NOT NULL,
    closed_at DATETIME(6) NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_loans_application UNIQUE (loan_application_id),
    CONSTRAINT fk_loans_application_customer FOREIGN KEY (loan_application_id,customer_id)
        REFERENCES loan_applications(id,customer_id),
    CONSTRAINT fk_loans_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_loans_owned_account FOREIGN KEY (disbursement_account_id,customer_id)
        REFERENCES accounts(id,customer_id),
    CONSTRAINT ck_loans_values CHECK (principal > 0.00 AND annual_rate BETWEEN 0.00 AND 100.00
        AND tenure_months >= 1 AND emi_amount >= 0.00 AND outstanding_principal BETWEEN 0.00 AND principal),
    CONSTRAINT ck_loans_status CHECK (status IN ('DISBURSED','REPAYMENT','CLOSED')),
    CONSTRAINT ck_loans_closed CHECK (
        (status = 'CLOSED' AND outstanding_principal = 0.00 AND closed_at IS NOT NULL) OR
        (status IN ('DISBURSED','REPAYMENT') AND closed_at IS NULL)
    ),
    INDEX idx_loans_customer_status (customer_id,status),
    INDEX idx_loans_status (status)
) ENGINE=InnoDB;

CREATE TABLE installments (
    id BIGINT NOT NULL AUTO_INCREMENT,
    loan_id BIGINT NOT NULL,
    installment_number INT NOT NULL,
    due_date DATE NOT NULL,
    principal_amount DECIMAL(15,2) NOT NULL,
    interest_amount DECIMAL(15,2) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    remaining_balance DECIMAL(15,2) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    paid_at DATETIME(6) NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_installments_number UNIQUE (loan_id,installment_number),
    CONSTRAINT uq_installments_id_loan UNIQUE (id,loan_id),
    CONSTRAINT fk_installments_loan FOREIGN KEY (loan_id) REFERENCES loans(id),
    CONSTRAINT ck_installments_number CHECK (installment_number >= 1),
    CONSTRAINT ck_installments_amounts CHECK (principal_amount >= 0.00 AND interest_amount >= 0.00
        AND total_amount = principal_amount + interest_amount AND remaining_balance >= 0.00),
    CONSTRAINT ck_installments_status CHECK (status IN ('PENDING','PAID','OVERDUE')),
    CONSTRAINT ck_installments_paid CHECK (
        (status = 'PAID' AND paid_at IS NOT NULL) OR
        (status IN ('PENDING','OVERDUE') AND paid_at IS NULL)
    ),
    INDEX idx_installments_due_status (status,due_date,id)
) ENGINE=InnoDB;

CREATE TABLE transactions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    account_id BIGINT NOT NULL,
    counterparty_account_id BIGINT NULL,
    loan_application_id BIGINT NULL,
    idempotency_key_id BIGINT NULL,
    original_transaction_id BIGINT NULL,
    reference CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    direction VARCHAR(6) NOT NULL,
    transaction_type VARCHAR(24) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    balance_after DECIMAL(15,2) NOT NULL,
    description VARCHAR(255) NOT NULL,
    actor_user_id BIGINT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_transactions_reference_account UNIQUE (reference,account_id,direction),
    CONSTRAINT fk_transactions_account FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT fk_transactions_counterparty FOREIGN KEY (counterparty_account_id) REFERENCES accounts(id),
    CONSTRAINT fk_transactions_application FOREIGN KEY (loan_application_id) REFERENCES loan_applications(id),
    CONSTRAINT fk_transactions_idempotency FOREIGN KEY (idempotency_key_id) REFERENCES idempotency_keys(id),
    CONSTRAINT fk_transactions_original FOREIGN KEY (original_transaction_id) REFERENCES transactions(id),
    CONSTRAINT fk_transactions_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
    CONSTRAINT ck_transactions_direction CHECK (direction IN ('CREDIT','DEBIT')),
    CONSTRAINT ck_transactions_type CHECK (transaction_type IN ('OPENING_CREDIT','TRANSFER_DEBIT',
        'TRANSFER_CREDIT','LOAN_DISBURSEMENT','LOAN_REPAYMENT','REVERSAL','ADJUSTMENT')),
    CONSTRAINT ck_transactions_amount CHECK (amount > 0.00 AND balance_after >= 0.00),
    CONSTRAINT ck_transactions_counterparty CHECK (counterparty_account_id IS NULL OR counterparty_account_id <> account_id),
    CONSTRAINT ck_transactions_transfer CHECK (transaction_type NOT IN ('TRANSFER_DEBIT','TRANSFER_CREDIT')
        OR (counterparty_account_id IS NOT NULL AND idempotency_key_id IS NOT NULL)),
    CONSTRAINT ck_transactions_direction_type CHECK (
        (transaction_type IN ('OPENING_CREDIT','TRANSFER_CREDIT','LOAN_DISBURSEMENT') AND direction = 'CREDIT') OR
        (transaction_type IN ('TRANSFER_DEBIT','LOAN_REPAYMENT') AND direction = 'DEBIT') OR
        transaction_type IN ('REVERSAL','ADJUSTMENT')
    ),
    CONSTRAINT ck_transactions_correction CHECK (transaction_type NOT IN ('REVERSAL','ADJUSTMENT')
        OR original_transaction_id IS NOT NULL),
    INDEX idx_transactions_account_created (account_id,created_at,id),
    INDEX idx_transactions_type_created (transaction_type,created_at)
) ENGINE=InnoDB;

CREATE TABLE payments (
    id BIGINT NOT NULL AUTO_INCREMENT,
    loan_id BIGINT NOT NULL,
    installment_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    transaction_id BIGINT NOT NULL,
    idempotency_key_id BIGINT NOT NULL,
    reference CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    principal_amount DECIMAL(15,2) NOT NULL,
    interest_amount DECIMAL(15,2) NOT NULL,
    paid_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_payments_installment UNIQUE (installment_id),
    CONSTRAINT uq_payments_transaction UNIQUE (transaction_id),
    CONSTRAINT uq_payments_idempotency UNIQUE (idempotency_key_id),
    CONSTRAINT uq_payments_reference UNIQUE (reference),
    CONSTRAINT fk_payments_loan FOREIGN KEY (loan_id) REFERENCES loans(id),
    CONSTRAINT fk_payments_installment_loan FOREIGN KEY (installment_id,loan_id)
        REFERENCES installments(id,loan_id),
    CONSTRAINT fk_payments_account FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT fk_payments_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    CONSTRAINT fk_payments_idempotency FOREIGN KEY (idempotency_key_id) REFERENCES idempotency_keys(id),
    CONSTRAINT ck_payments_amounts CHECK (amount > 0.00 AND principal_amount >= 0.00
        AND interest_amount >= 0.00 AND amount = principal_amount + interest_amount),
    INDEX idx_payments_loan_paid (loan_id,paid_at,id),
    INDEX idx_payments_paid (paid_at,id)
) ENGINE=InnoDB;
