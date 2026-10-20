#requires -Version 5.1
$ErrorActionPreference="Stop"
$Root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location|Format-List
. (Join-Path $PSScriptRoot "Use-FinNovaEnvironment.ps1")
Import-Module (Join-Path $PSScriptRoot "FinNova.Database.psm1") -Force
foreach($Schema in @("finnova_demo","finnova_test")){
    Write-Host "`n=== $Schema - read-only loan reconciliation, no secrets ===" -ForegroundColor Cyan
    $Sql="
SET time_zone='+00:00';
SELECT DATABASE() AS current_schema,CURRENT_USER() AS runtime_account;
SELECT COUNT(*) AS successful_migrations FROM flyway_schema_history WHERE success=1;
SELECT status,COUNT(*) AS loan_count,COALESCE(SUM(outstanding_principal),0.00) AS outstanding_principal FROM loans GROUP BY status;
SELECT status,COUNT(*) AS installment_count FROM installments GROUP BY status;
SELECT COUNT(*) AS payment_rows,COALESCE(SUM(amount),0.00) AS simulated_payments FROM payments;
SELECT a.account_number,a.balance,COALESCE(t.signed_balance,0.00) AS ledger_balance FROM accounts a
LEFT JOIN (SELECT account_id,SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END) AS signed_balance FROM transactions GROUP BY account_id)t ON t.account_id=a.id
WHERE a.balance<>COALESCE(t.signed_balance,0.00);
SELECT l.id,l.outstanding_principal,COALESCE(i.unpaid,0.00) AS unpaid_scheduled_principal FROM loans l
LEFT JOIN (SELECT loan_id,SUM(principal_amount) AS unpaid FROM installments WHERE status<>'PAID' GROUP BY loan_id)i ON i.loan_id=l.id
WHERE l.outstanding_principal<>COALESCE(i.unpaid,0.00);
SELECT l.id,l.principal,COALESCE(i.scheduled,0.00) AS scheduled_principal FROM loans l
LEFT JOIN (SELECT loan_id,SUM(principal_amount) AS scheduled FROM installments GROUP BY loan_id)i ON i.loan_id=l.id WHERE l.principal<>COALESCE(i.scheduled,0.00);
SELECT i.id,i.status,p.id AS payment_id FROM installments i LEFT JOIN payments p ON p.installment_id=i.id
WHERE (i.status='PAID' AND p.id IS NULL) OR (i.status<>'PAID' AND p.id IS NOT NULL);
SELECT operation,state,response_status,COUNT(*) AS reservation_count FROM idempotency_keys GROUP BY operation,state,response_status;
SELECT event_type,COUNT(*) AS event_count FROM audit_logs WHERE event_type IN ('LOAN_DECISION','LOAN_DISBURSED','REPAYMENT','REPAYMENT_REJECTED','LOAN_CLOSED','INSTALLMENTS_MARKED_OVERDUE') GROUP BY event_type;
"
    Invoke-FinNovaAppSql -Schema $Schema -Sql $Sql
}
