#requires -Version 5.1
$ErrorActionPreference="Stop"
$Root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location|Format-List
. (Join-Path $PSScriptRoot "Use-FinNovaEnvironment.ps1")
Import-Module (Join-Path $PSScriptRoot "FinNova.Database.psm1") -Force
foreach($Schema in @("finnova_demo","finnova_test")){
    Write-Host "`n=== $Schema - read-only Stage 6 verification ===" -ForegroundColor Cyan
    $Sql="
SET time_zone='+00:00';
SELECT DATABASE() AS current_schema,CURRENT_USER() AS runtime_account;
SELECT COUNT(*) AS successful_migrations FROM flyway_schema_history WHERE success=1;
SELECT role,enabled,COUNT(*) AS user_count FROM users GROUP BY role,enabled ORDER BY role,enabled;
SELECT status,COUNT(*) AS kyc_count FROM kyc_records GROUP BY status;
SELECT active,COUNT(*) AS loan_product_count FROM loan_products GROUP BY active;
SELECT event_type,COUNT(*) AS event_count FROM audit_logs WHERE event_type IN
 ('USER_ACTIVATION_CHANGED','USER_ROLE_CHANGED','KYC_DECISION','KYC_RESUBMITTED','PRODUCT_CREATED','PRODUCT_UPDATED','PRODUCT_ACTIVATION_CHANGED') GROUP BY event_type ORDER BY event_type;
SELECT a.account_number,a.balance,COALESCE(t.signed_balance,0.00) AS ledger_balance FROM accounts a
LEFT JOIN (SELECT account_id,SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END) AS signed_balance FROM transactions GROUP BY account_id)t ON t.account_id=a.id
WHERE a.balance<>COALESCE(t.signed_balance,0.00);
SELECT l.id,l.outstanding_principal,COALESCE(i.unpaid,0.00) AS unpaid_scheduled_principal FROM loans l
LEFT JOIN (SELECT loan_id,SUM(principal_amount) AS unpaid FROM installments WHERE status<>'PAID' GROUP BY loan_id)i ON i.loan_id=l.id
WHERE l.outstanding_principal<>COALESCE(i.unpaid,0.00);
"
    Invoke-FinNovaAppSql -Schema $Schema -Sql $Sql
}
