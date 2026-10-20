#requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location | Format-List
. (Join-Path $PSScriptRoot "Use-FinNovaEnvironment.ps1")
Import-Module (Join-Path $PSScriptRoot "FinNova.Database.psm1") -Force
foreach ($Schema in @("finnova_demo","finnova_test")) {
    Write-Host "`n=== $Schema - read-only; NO hashes or secrets selected ===" -ForegroundColor Cyan
    $Sql = "
SET time_zone='+00:00';
SELECT email,role,enabled,(password_hash IS NOT NULL) AS credential_provisioned
FROM users WHERE id BETWEEN 1001 AND 1004 ORDER BY id;
SELECT COUNT(*) AS successful_migrations FROM flyway_schema_history WHERE success=1;
SELECT COUNT(*) AS account_count,COALESCE(SUM(balance),0.00) AS simulated_balance FROM accounts;
SELECT COUNT(*) AS ledger_rows FROM transactions;
SELECT event_type,COUNT(*) AS event_count FROM audit_logs GROUP BY event_type ORDER BY event_type;
"
    Invoke-FinNovaAppSql -Schema $Schema -Sql $Sql
}
