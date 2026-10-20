-- Dedicated, once-only demo seed migration. Contains no password or usable login.
-- Seed identities stay disabled with NULL hashes until Stage 3 provisions BCrypt.
-- No loan or installment is created before a service-backed disbursement exists.
START TRANSACTION;
SET @seed_now = UTC_TIMESTAMP(6);
INSERT INTO users(id,email,full_name,password_hash,role,enabled,approval_limit,created_at,updated_at) VALUES
(1001,'customer1@finnova.test','Asha Demo',NULL,'CUSTOMER',FALSE,NULL,DATE_SUB(@seed_now,INTERVAL 7 DAY),@seed_now),
(1002,'customer2@finnova.test','Ravi Demo',NULL,'CUSTOMER',FALSE,NULL,DATE_SUB(@seed_now,INTERVAL 7 DAY),@seed_now),
(1003,'officer@finnova.test','Loan Officer Demo',NULL,'LOAN_OFFICER',FALSE,500000.00,DATE_SUB(@seed_now,INTERVAL 7 DAY),@seed_now),
(1004,'admin@finnova.test','Admin Demo',NULL,'ADMIN',FALSE,500000.00,DATE_SUB(@seed_now,INTERVAL 7 DAY),@seed_now);

INSERT INTO customers(id,user_id,date_of_birth,declared_monthly_income,created_at,updated_at) VALUES
(1001,1001,'1998-06-15',35000.00,DATE_SUB(@seed_now,INTERVAL 6 DAY),@seed_now),
(1002,1002,'1995-02-20',45000.00,DATE_SUB(@seed_now,INTERVAL 6 DAY),@seed_now);

INSERT INTO accounts(id,customer_id,account_number,nickname,balance,created_at,updated_at) VALUES
(1001,1001,'FNDEMO000001','Demo savings',50000.00,DATE_SUB(@seed_now,INTERVAL 5 DAY),DATE_SUB(@seed_now,INTERVAL 5 DAY)),
(1002,1001,'FNDEMO000002','Demo expenses',10000.00,DATE_SUB(@seed_now,INTERVAL 5 DAY),DATE_SUB(@seed_now,INTERVAL 5 DAY)),
(1003,1002,'FNDEMO000003','Demo savings',75000.00,DATE_SUB(@seed_now,INTERVAL 5 DAY),DATE_SUB(@seed_now,INTERVAL 5 DAY)),
(1004,1002,'FNDEMO000004','Demo expenses',5000.00,DATE_SUB(@seed_now,INTERVAL 5 DAY),DATE_SUB(@seed_now,INTERVAL 5 DAY));

INSERT INTO transactions(id,account_id,reference,direction,transaction_type,amount,balance_after,description,actor_user_id,created_at,updated_at) VALUES
(1001,1001,'00000000-0000-0000-0000-000000000001','CREDIT','OPENING_CREDIT',50000.00,50000.00,'SIMULATED opening credit',1004,DATE_SUB(@seed_now,INTERVAL 5 DAY),DATE_SUB(@seed_now,INTERVAL 5 DAY)),
(1002,1002,'00000000-0000-0000-0000-000000000002','CREDIT','OPENING_CREDIT',10000.00,10000.00,'SIMULATED opening credit',1004,DATE_SUB(@seed_now,INTERVAL 5 DAY),DATE_SUB(@seed_now,INTERVAL 5 DAY)),
(1003,1003,'00000000-0000-0000-0000-000000000003','CREDIT','OPENING_CREDIT',75000.00,75000.00,'SIMULATED opening credit',1004,DATE_SUB(@seed_now,INTERVAL 5 DAY),DATE_SUB(@seed_now,INTERVAL 5 DAY)),
(1004,1004,'00000000-0000-0000-0000-000000000004','CREDIT','OPENING_CREDIT',5000.00,5000.00,'SIMULATED opening credit',1004,DATE_SUB(@seed_now,INTERVAL 5 DAY),DATE_SUB(@seed_now,INTERVAL 5 DAY));

INSERT INTO kyc_records(id,customer_id,document_reference,status,reviewed_by,reviewed_at,review_notes,created_at,updated_at) VALUES
(1001,1001,'DEMO-KYC-0001','VERIFIED',1003,DATE_SUB(@seed_now,INTERVAL 4 DAY),'Synthetic fixture only; no real identity document.',DATE_SUB(@seed_now,INTERVAL 5 DAY),DATE_SUB(@seed_now,INTERVAL 4 DAY)),
(1002,1002,'DEMO-KYC-0002','PENDING',NULL,NULL,NULL,DATE_SUB(@seed_now,INTERVAL 5 DAY),DATE_SUB(@seed_now,INTERVAL 5 DAY));

INSERT INTO loan_applications
(id,customer_id,loan_product_id,disbursement_account_id,product_name_snapshot,principal,annual_rate,tenure_months,
 declared_monthly_income,purpose,status,assigned_officer_id,submitted_at,created_at,updated_at)
VALUES
(1001,1001,1,1001,'Demo Personal Loan',150000.00,12.00,24,35000.00,'Synthetic home-repair scenario','DRAFT',NULL,NULL,@seed_now,@seed_now),
(1002,1002,2,1003,'Demo Vehicle Loan',250000.00,10.50,36,45000.00,'Synthetic vehicle scenario','SUBMITTED',NULL,DATE_SUB(@seed_now,INTERVAL 2 DAY),DATE_SUB(@seed_now,INTERVAL 3 DAY),@seed_now),
(1003,1001,1,1001,'Demo Personal Loan',100000.00,12.00,12,35000.00,'Synthetic education-expense scenario','UNDER_REVIEW',1003,DATE_SUB(@seed_now,INTERVAL 3 DAY),DATE_SUB(@seed_now,INTERVAL 4 DAY),@seed_now);

INSERT INTO loan_application_history
(loan_application_id,from_status,to_status,actor_type,actor_user_id,actor_role,notes,occurred_at)
VALUES
(1002,'DRAFT','SUBMITTED','USER',1002,'CUSTOMER','Synthetic submission fixture.',DATE_SUB(@seed_now,INTERVAL 2 DAY)),
(1003,'DRAFT','SUBMITTED','USER',1001,'CUSTOMER','Synthetic submission fixture.',DATE_SUB(@seed_now,INTERVAL 3 DAY)),
(1003,'SUBMITTED','UNDER_REVIEW','USER',1003,'LOAN_OFFICER','Synthetic review-queue fixture.',DATE_SUB(@seed_now,INTERVAL 1 DAY));

INSERT INTO audit_logs(actor_type,actor_user_id,actor_role,event_type,outcome,resource_type,resource_id,details,occurred_at) VALUES
('SYSTEM',NULL,NULL,'DEMO_SEED_CREATED','SUCCESS','SYSTEM','seed-v5',JSON_OBJECT('synthetic',TRUE,'note','Disabled identities; no credentials provisioned.'),@seed_now),
('USER',1001,'CUSTOMER','LOAN_DRAFT_CREATED','SUCCESS','LOAN_APPLICATION','1001',JSON_OBJECT('synthetic',TRUE),@seed_now),
('USER',1003,'LOAN_OFFICER','KYC_DECISION','SUCCESS','KYC_RECORD','1001',JSON_OBJECT('synthetic',TRUE,'decision','VERIFIED'),DATE_SUB(@seed_now,INTERVAL 4 DAY));
COMMIT;
