#requires -Version 5.1
$ErrorActionPreference="Stop"
$Root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location | Format-List
. (Join-Path $PSScriptRoot "Use-FinNovaEnvironment.ps1")
Import-Module (Join-Path $PSScriptRoot "FinNova.Database.psm1") -Force
foreach($Schema in @("finnova_demo","finnova_test")){
    Write-Host "`n=== $Schema - read-only financial verification ===" -ForegroundColor Cyan
    $Sql="
SET time_zone='+00:00';
SELECT DATABASE() AS current_schema,CURRENT_USER() AS runtime_account;
SELECT COUNT(*) AS successful_migrations FROM flyway_schema_history WHERE success=1;
SELECT COUNT(*) AS original_seed_accounts,COALESCE(SUM(balance),0.00) AS seed_balance
FROM accounts WHERE id BETWEEN 1001 AND 1004;
SELECT status,COUNT(*) AS account_count,COALESCE(SUM(balance),0.00) AS simulated_balance FROM accounts GROUP BY status ORDER BY status;
SELECT a.account_number,a.balance,COALESCE(t.signed_balance,0.00) AS ledger_balance
FROM accounts a LEFT JOIN (SELECT account_id,SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END) AS signed_balance
 FROM transactions GROUP BY account_id) t ON t.account_id=a.id WHERE a.balance<>COALESCE(t.signed_balance,0.00);
SELECT reference,COUNT(*) AS entry_count,SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END) AS net
FROM transactions WHERE transaction_type IN ('TRANSFER_DEBIT','TRANSFER_CREDIT') GROUP BY reference
HAVING COUNT(*)<>2 OR SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END)<>0.00;
SELECT operation,state,response_status,COUNT(*) AS reservation_count FROM idempotency_keys GROUP BY operation,state,response_status;
SELECT event_type,COUNT(*) AS event_count FROM audit_logs WHERE event_type IN ('ACCOUNT_OPENED','ACCOUNT_RENAMED','ACCOUNT_CLOSED','TRANSFER','TRANSFER_REJECTED','TEST_FIXTURE_RETIRED') GROUP BY event_type ORDER BY event_type;
"
    Invoke-FinNovaAppSql -Schema $Schema -Sql $Sql
}
