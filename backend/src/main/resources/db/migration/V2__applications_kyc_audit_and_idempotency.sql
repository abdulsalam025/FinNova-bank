CREATE TABLE loan_applications (
    id BIGINT NOT NULL AUTO_INCREMENT,
    customer_id BIGINT NOT NULL,
    loan_product_id BIGINT NOT NULL,
    disbursement_account_id BIGINT NOT NULL,
    product_name_snapshot VARCHAR(100) NOT NULL,
    principal DECIMAL(15,2) NOT NULL,
    annual_rate DECIMAL(5,2) NOT NULL,
    tenure_months INT NOT NULL,
    declared_monthly_income DECIMAL(15,2) NOT NULL,
    purpose VARCHAR(1000) NOT NULL,
    customer_notes VARCHAR(2000) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    assigned_officer_id BIGINT NULL,
    approved_by BIGINT NULL,
    submitted_at DATETIME(6) NULL,
    approved_at DATETIME(6) NULL,
    decision_reason VARCHAR(1000) NULL,
    additional_info_request VARCHAR(1000) NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_applications_id_customer UNIQUE (id,customer_id),
    CONSTRAINT fk_applications_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_applications_product FOREIGN KEY (loan_product_id) REFERENCES loan_products(id),
    CONSTRAINT fk_applications_owned_account FOREIGN KEY (disbursement_account_id,customer_id)
        REFERENCES accounts(id,customer_id),
    CONSTRAINT fk_applications_officer FOREIGN KEY (assigned_officer_id) REFERENCES users(id),
    CONSTRAINT fk_applications_approver FOREIGN KEY (approved_by) REFERENCES users(id),
    CONSTRAINT ck_applications_values CHECK (principal > 0.00 AND annual_rate >= 0.00
        AND annual_rate <= 100.00 AND tenure_months >= 1 AND declared_monthly_income >= 0.00),
    CONSTRAINT ck_applications_status CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW',
        'ADDITIONAL_INFO_REQUIRED','APPROVED','REJECTED','DISBURSED','REPAYMENT','CLOSED')),
    CONSTRAINT ck_applications_submitted CHECK (status = 'DRAFT' OR submitted_at IS NOT NULL),
    CONSTRAINT ck_applications_approval CHECK (status NOT IN ('APPROVED','DISBURSED','REPAYMENT','CLOSED')
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
    CONSTRAINT ck_applications_rejection_reason CHECK (status <> 'REJECTED'
        OR (decision_reason IS NOT NULL AND CHAR_LENGTH(TRIM(decision_reason)) > 0)),
    CONSTRAINT ck_applications_additional_info CHECK (status <> 'ADDITIONAL_INFO_REQUIRED'
        OR (additional_info_request IS NOT NULL AND CHAR_LENGTH(TRIM(additional_info_request)) > 0)),
    INDEX idx_applications_customer_created (customer_id,created_at,id),
    INDEX idx_applications_status_created (status,created_at,id),
    INDEX idx_applications_officer_status (assigned_officer_id,status),
    INDEX idx_applications_product (loan_product_id)
) ENGINE=InnoDB;

-- No history row is inserted for initial DRAFT creation: it is not a transition.
-- A draft with no transition history can therefore be hard-deleted.
CREATE TABLE loan_application_history (
    id BIGINT NOT NULL AUTO_INCREMENT,
    loan_application_id BIGINT NOT NULL,
    from_status VARCHAR(32) NOT NULL,
    to_status VARCHAR(32) NOT NULL,
    actor_type VARCHAR(10) NOT NULL,
    actor_user_id BIGINT NULL,
    actor_role VARCHAR(20) NULL,
    notes VARCHAR(1000) NOT NULL,
    occurred_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_history_application FOREIGN KEY (loan_application_id) REFERENCES loan_applications(id),
    CONSTRAINT fk_history_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
    CONSTRAINT ck_history_actor CHECK (
        (actor_type = 'USER' AND actor_user_id IS NOT NULL AND actor_role IS NOT NULL AND actor_role IN ('CUSTOMER','LOAN_OFFICER','ADMIN')) OR
        (actor_type = 'SYSTEM' AND actor_user_id IS NULL AND actor_role IS NULL)
    ),
    CONSTRAINT ck_history_notes CHECK (CHAR_LENGTH(TRIM(notes)) > 0),
    CONSTRAINT ck_history_transition CHECK (
        (from_status = 'DRAFT' AND to_status = 'SUBMITTED') OR
        (from_status = 'SUBMITTED' AND to_status = 'UNDER_REVIEW') OR
        (from_status = 'UNDER_REVIEW' AND to_status IN ('ADDITIONAL_INFO_REQUIRED','APPROVED','REJECTED')) OR
        (from_status = 'ADDITIONAL_INFO_REQUIRED' AND to_status = 'UNDER_REVIEW') OR
        (from_status = 'APPROVED' AND to_status = 'DISBURSED') OR
        (from_status = 'DISBURSED' AND to_status = 'REPAYMENT') OR
        (from_status = 'REPAYMENT' AND to_status = 'CLOSED')
    ),
    CONSTRAINT ck_history_actor_transition CHECK (
        (actor_type = 'SYSTEM' AND from_status IN ('DISBURSED','REPAYMENT') AND to_status IN ('REPAYMENT','CLOSED')) OR
        (actor_type = 'USER' AND actor_role = 'CUSTOMER' AND
            ((from_status = 'DRAFT' AND to_status = 'SUBMITTED') OR
             (from_status = 'ADDITIONAL_INFO_REQUIRED' AND to_status = 'UNDER_REVIEW'))) OR
        (actor_type = 'USER' AND actor_role IN ('LOAN_OFFICER','ADMIN') AND from_status IN ('SUBMITTED','UNDER_REVIEW','APPROVED'))
    ),
    INDEX idx_history_application_time (loan_application_id,occurred_at,id),
    INDEX idx_history_actor_time (actor_user_id,occurred_at)
) ENGINE=InnoDB;

CREATE TABLE kyc_records (
    id BIGINT NOT NULL AUTO_INCREMENT,
    customer_id BIGINT NOT NULL,
    document_type VARCHAR(30) NOT NULL DEFAULT 'DEMO_ID',
    document_reference VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    reviewed_by BIGINT NULL,
    reviewed_at DATETIME(6) NULL,
    review_notes VARCHAR(1000) NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_kyc_customer UNIQUE (customer_id),
    CONSTRAINT uq_kyc_demo_reference UNIQUE (document_reference),
    CONSTRAINT fk_kyc_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_kyc_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id),
    CONSTRAINT ck_kyc_status CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
    CONSTRAINT ck_kyc_review CHECK (
        (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
        (status IN ('VERIFIED','REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT ck_kyc_rejection_reason CHECK (status <> 'REJECTED'
        OR (review_notes IS NOT NULL AND CHAR_LENGTH(TRIM(review_notes)) > 0)),
    INDEX idx_kyc_status_created (status,created_at,id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    actor_type VARCHAR(12) NOT NULL,
    actor_user_id BIGINT NULL,
    actor_role VARCHAR(20) NULL,
    event_type VARCHAR(64) NOT NULL,
    outcome VARCHAR(12) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64) NULL,
    details JSON NULL,
    occurred_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
    CONSTRAINT ck_audit_actor CHECK (
        (actor_type = 'USER' AND actor_user_id IS NOT NULL AND actor_role IS NOT NULL
            AND actor_role IN ('CUSTOMER','LOAN_OFFICER','ADMIN')) OR
        (actor_type IN ('SYSTEM','ANONYMOUS') AND actor_user_id IS NULL AND actor_role IS NULL)
    ),
    CONSTRAINT ck_audit_outcome CHECK (outcome IN ('SUCCESS','FAILURE','DENIED')),
    INDEX idx_audit_time (occurred_at,id),
    INDEX idx_audit_actor_time (actor_user_id,occurred_at),
    INDEX idx_audit_event_time (event_type,occurred_at),
    INDEX idx_audit_resource (resource_type,resource_id)
) ENGINE=InnoDB;

CREATE TABLE idempotency_keys (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    operation VARCHAR(16) NOT NULL,
    idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS',
    response_status INT NULL,
    response_body JSON NULL,
    completed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_idempotency_scope UNIQUE (user_id,operation,idempotency_key),
    CONSTRAINT fk_idempotency_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_idempotency_operation CHECK (operation IN ('TRANSFER','REPAYMENT')),
    CONSTRAINT ck_idempotency_key CHECK (CHAR_LENGTH(TRIM(idempotency_key)) BETWEEN 1 AND 128),
    CONSTRAINT ck_idempotency_state CHECK (
        (state = 'IN_PROGRESS' AND response_status IS NULL AND response_body IS NULL AND completed_at IS NULL) OR
        (state = 'COMPLETED' AND response_status IS NOT NULL AND response_status BETWEEN 100 AND 599 AND response_body IS NOT NULL AND completed_at IS NOT NULL)
    ),
    INDEX idx_idempotency_created (created_at)
) ENGINE=InnoDB;
