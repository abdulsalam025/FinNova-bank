#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory = $true)][ValidateSet("Prepare", "Grant", "Verify")][string]$Mode)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location | Format-List
Import-Module (Join-Path $PSScriptRoot "FinNova.Database.psm1") -Force

if ($Mode -eq "Prepare") {
    $EnvPath = Join-Path $Root ".env"
    if (Test-Path -LiteralPath $EnvPath) { throw "An .env already exists. Nothing was overwritten. Do not rerun Prepare; report your current setup state without secrets." }
    git.exe check-ignore --quiet --no-index -- .env
    if ($LASTEXITCODE -ne 0) { throw "The environment file is not confirmed ignored by Git. No database changes were attempted." }
    $PreflightSql = "
SELECT 'SERVER', VERSION();
SELECT 'SCHEMA', SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN ('finnova_demo','finnova_test');
SELECT 'ACCOUNT', User, Host FROM mysql.user WHERE User IN ('finnova_app','finnova_migrator');
"
    $Preflight = Invoke-FinNovaRootSql -Sql $PreflightSql
    if ($Preflight.ExitCode -ne 0) { throw "Root preflight failed. No bootstrap commands were run. Paste the error only." }
    $ServerLines = @($Preflight.Lines | Where-Object { $_ -match '^SERVER\t8\.' })
    if ($ServerLines.Count -ne 1) { throw "Expected MySQL Server 8.x. No database changes were attempted." }
    $Conflicts = @($Preflight.Lines | Where-Object { $_ -match '^(SCHEMA|ACCOUNT)\t' })
    if ($Conflicts.Count -gt 0) {
        Write-Host ($Conflicts -join "`n") -ForegroundColor Yellow
        throw "A target schema or database account already exists. Nothing was overwritten, dropped, or reset. Stop and report these names."
    }
    $Confirmation = Read-Host "Type CREATE DEMO DB to create two new synthetic schemas and two new local database users"
    if ($Confirmation -ne "CREATE DEMO DB") { Write-Host "Cancelled; no database was created."; return }
    $BootstrapSql = "
CREATE DATABASE finnova_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE finnova_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'finnova_app'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD REQUIRE SSL PASSWORD EXPIRE NEVER;
CREATE USER 'finnova_migrator'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD REQUIRE SSL PASSWORD EXPIRE NEVER;
GRANT SELECT ON finnova_demo.* TO 'finnova_app'@'127.0.0.1';
GRANT SELECT ON finnova_test.* TO 'finnova_app'@'127.0.0.1';
GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,REFERENCES ON finnova_demo.* TO 'finnova_migrator'@'127.0.0.1';
GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,REFERENCES ON finnova_test.* TO 'finnova_migrator'@'127.0.0.1';
"
    Write-Host "A second root-password prompt is expected for creation. Generated database passwords are captured privately, not printed." -ForegroundColor Cyan
    $Created = Invoke-FinNovaRootSql -Sql $BootstrapSql
    $AppPassword = ""
    $MigrationPassword = ""
    foreach ($Line in $Created.Lines) {
        $Parts = ([string]$Line).Split("`t")
        if ($Parts.Count -ge 3 -and $Parts[0] -eq "finnova_app" -and $Parts[1] -eq "127.0.0.1") { $AppPassword = $Parts[2] }
        if ($Parts.Count -ge 3 -and $Parts[0] -eq "finnova_migrator" -and $Parts[1] -eq "127.0.0.1") { $MigrationPassword = $Parts[2] }
    }
    $Complete = $Created.ExitCode -eq 0 -and $AppPassword.Length -ge 12 -and $MigrationPassword.Length -ge 12
    $CompleteText = if ($Complete) { "true" } else { "false" }
    $EnvLines = @(
        "# FINNOVA_BOOTSTRAP_COMPLETE=$CompleteText"
        "# PRIVATE: generated database credentials. Never commit, print, or screenshot this file."
        "DB_HOST=127.0.0.1"
        "DB_PORT=3306"
        "DB_NAME=finnova_demo"
        "DB_APP_USERNAME=finnova_app"
        ("DB_APP_PASSWORD=" + (ConvertTo-Json -InputObject $AppPassword -Compress))
        "DB_MIGRATION_USERNAME=finnova_migrator"
        ("DB_MIGRATION_PASSWORD=" + (ConvertTo-Json -InputObject $MigrationPassword -Compress))
        "SERVER_ADDRESS=127.0.0.1"
        "SERVER_PORT=8080"
    )
    Write-FinNovaPrivateEnv -Path $EnvPath -Lines $EnvLines
    Remove-Variable AppPassword,MigrationPassword,Created,EnvLines,Parts,Line -ErrorAction SilentlyContinue
    if (-not $Complete) {
        throw "Bootstrap did not finish normally. Partial database objects or credentials may exist; captured credentials were retained privately in .env. Do not rerun, delete, or reset anything. Paste the error only, never .env."
    }
    Write-Host "Created finnova_demo, finnova_test, and local app/migrator users. Private .env saved with user/SYSTEM-only file permissions." -ForegroundColor Green
    Write-Host "Next: load the environment and migrate BOTH schemas before running Grant."
    return
}

. (Join-Path $PSScriptRoot "Use-FinNovaEnvironment.ps1")
if ($Mode -eq "Grant") {
    $CheckSql = "
SELECT TABLE_SCHEMA, COUNT(*) FROM information_schema.TABLES
WHERE TABLE_SCHEMA IN ('finnova_demo','finnova_test') AND TABLE_TYPE='BASE TABLE'
GROUP BY TABLE_SCHEMA ORDER BY TABLE_SCHEMA;
"
    $Check = Invoke-FinNovaRootSql -Sql $CheckSql
    if ($Check.ExitCode -ne 0) { throw "Grant preflight failed. No permissions were changed." }
    foreach ($Schema in @("finnova_demo", "finnova_test")) {
        if (@($Check.Lines | Where-Object { $_ -eq "$Schema`t15" }).Count -ne 1) {
            throw "Expected 14 MVP tables plus Flyway history in $Schema. Migrate both schemas first. No permissions were changed."
        }
    }
    $GrantSql = ""
    foreach ($Schema in @("finnova_demo", "finnova_test")) {
        foreach ($Table in @("users","customers","accounts","loan_products","loan_applications","kyc_records","system_settings")) {
            $GrantSql += "GRANT INSERT,UPDATE ON $Schema.$Table TO 'finnova_app'@'127.0.0.1';`n"
        }
        foreach ($Table in @("loan_application_history","audit_logs","idempotency_keys","loans","installments","transactions","payments")) {
            $GrantSql += "GRANT INSERT ON $Schema.$Table TO 'finnova_app'@'127.0.0.1';`n"
        }
        $GrantSql += "GRANT DELETE ON $Schema.loan_applications TO 'finnova_app'@'127.0.0.1';`n"
        $GrantSql += "GRANT UPDATE (outstanding_principal,status,closed_at,version,updated_at) ON $Schema.loans TO 'finnova_app'@'127.0.0.1';`n"
        $GrantSql += "GRANT UPDATE (status,paid_at,version,updated_at) ON $Schema.installments TO 'finnova_app'@'127.0.0.1';`n"
        $GrantSql += "GRANT UPDATE (state,response_status,response_body,completed_at,updated_at) ON $Schema.idempotency_keys TO 'finnova_app'@'127.0.0.1';`n"
    }
    Write-Host "A second root-password prompt is expected to apply table/column-specific runtime permissions." -ForegroundColor Cyan
    $Granted = Invoke-FinNovaRootSql -Sql $GrantSql
    if ($Granted.ExitCode -ne 0) { throw "Permission setup failed or was partial. Stop and paste the actual error; do not alter or drop users." }
    Write-Host "Runtime grants applied. Ledger/history/audit rows cannot be updated or deleted by finnova_app." -ForegroundColor Green
    return
}

if ($Mode -eq "Verify") {
    $VerificationSql = "
SELECT DATABASE() AS current_schema, CURRENT_USER() AS database_account, @@session.time_zone AS session_time_zone;
SELECT version,description,success FROM flyway_schema_history ORDER BY installed_rank;
SELECT COUNT(*) AS business_table_count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME<>'flyway_schema_history';
SELECT (SELECT COUNT(*) FROM users) AS demo_identities,(SELECT COUNT(*) FROM customers) AS demo_customers,
 (SELECT COUNT(*) FROM accounts) AS demo_accounts,(SELECT COUNT(*) FROM loan_products) AS loan_products,
 (SELECT COUNT(*) FROM loan_applications) AS applications,(SELECT COUNT(*) FROM transactions) AS opening_ledger_rows,
 (SELECT COUNT(*) FROM loans) AS disbursed_loans;
SELECT COALESCE(SUM(balance),0.00) AS total_simulated_balance FROM accounts;
SELECT a.account_number,a.balance,COALESCE(t.ledger_balance,0.00) AS ledger_balance
FROM accounts a LEFT JOIN (SELECT account_id,SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END) AS ledger_balance
 FROM transactions GROUP BY account_id) t ON t.account_id=a.id
WHERE a.balance<>COALESCE(t.ledger_balance,0.00);
SELECT COUNT(*) AS disabled_seed_identities FROM users WHERE id BETWEEN 1001 AND 1004 AND enabled=FALSE AND password_hash IS NULL;
SELECT status,COUNT(*) AS application_count FROM loan_applications GROUP BY status ORDER BY status;
"
    foreach ($Schema in @("finnova_demo", "finnova_test")) {
        Write-Host "`n=== $Schema - read-only verification ===" -ForegroundColor Cyan
        Invoke-FinNovaAppSql -Schema $Schema -Sql ("SET time_zone='+00:00';`n" + $VerificationSql)
    }
}
