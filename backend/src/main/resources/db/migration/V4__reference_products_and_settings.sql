START TRANSACTION;
INSERT INTO loan_products
(id,code,name,description,min_principal,max_principal,annual_rate,min_annual_rate,max_annual_rate,
 min_tenure_months,max_tenure_months,tenure_step_months,min_age,max_age,max_income_multiplier)
VALUES
(1,'DEMO_PERSONAL','Demo Personal Loan','Synthetic reducing-balance personal loan.',10000.00,500000.00,12.00,12.00,12.00,6,60,6,21,65,20.00),
(2,'DEMO_VEHICLE','Demo Vehicle Loan','Synthetic reducing-balance vehicle loan.',50000.00,1500000.00,10.50,10.50,10.50,12,84,12,21,65,30.00),
(3,'DEMO_EDUCATION','Demo Education Loan','Synthetic reducing-balance education loan.',25000.00,1000000.00,9.00,9.00,9.00,12,84,12,18,65,36.00);

INSERT INTO system_settings(setting_key,setting_value,description) VALUES
('app.currency','INR','Display currency; all money movements are synthetic.'),
('app.time_zone','Asia/Kolkata','Business/display timezone; database timestamps are UTC.'),
('demo.current_date','','Blank means real India date; later overdue job can use an ISO yyyy-MM-dd demo date.'),
('security.max_failed_logins','5','Planned authentication lockout threshold; authentication is not implemented in Stage 2.'),
('security.lockout_minutes','15','Planned temporary lockout duration.'),
('demo.synthetic_only','true','Real money, real banking integrations, and real identity documents are prohibited.');
COMMIT;
