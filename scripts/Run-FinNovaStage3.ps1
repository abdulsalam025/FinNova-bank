#requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location | Format-List
. (Join-Path $PSScriptRoot "Use-FinNovaEnvironment.ps1")
$Evidence = Join-Path $Root "docs\verification"
if (-not (Test-Path -LiteralPath $Evidence -PathType Container)) { throw "Verification directory is missing. Do not recreate the scaffold." }
$Run = "stage3-" + (Get-Date -Format "yyyyMMdd-HHmmssfff")
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
function Invoke-RecordedStep {
    param([string]$Command,[string[]]$Arguments,[string]$Label)
    $Log = Join-Path $Evidence "$Run-$Label.log"
    if (Test-Path -LiteralPath $Log) { throw "The evidence file already exists; not overwritten." }
    Write-Host "`n=== $Label ===" -ForegroundColor Cyan
    Write-Host "Actual output: $Log"
    $Previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $Command @Arguments 2>&1 | ForEach-Object { $_.ToString() } | Tee-Object -FilePath $Log
        $Code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $Previous }
    if ($Code -ne 0) { throw "$Label failed with exit code $Code. Stop and paste the error summary, not secrets." }
}
Push-Location -LiteralPath (Join-Path $Root "backend")
try {
    # No new migration in Stage 3: validate existing immutable migrations in BOTH schemas.
    foreach ($Schema in @("finnova_demo","finnova_test")) {
        $env:FLYWAY_URL = "jdbc:mysql://127.0.0.1:3306/${Schema}?sslMode=REQUIRED&connectionTimeZone=%2B00:00&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8&allowMultiQueries=false"
        Invoke-RecordedStep -Command ".\mvnw.cmd" -Arguments @("-B","-ntp","flyway:validate") -Label "$Schema-validate"
    }
    Invoke-RecordedStep -Command ".\mvnw.cmd" -Arguments @("-B","-ntp","test") -Label "backend-tests"
    Invoke-RecordedStep -Command ".\mvnw.cmd" -Arguments @("-B","-ntp","package") -Label "backend-package"
} finally {
    Pop-Location
    $env:FLYWAY_URL = "jdbc:mysql://127.0.0.1:3306/finnova_demo?sslMode=REQUIRED&connectionTimeZone=%2B00:00&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8&allowMultiQueries=false"
}
Push-Location -LiteralPath (Join-Path $Root "frontend")
try {
    if (-not (Test-Path -LiteralPath "node_modules" -PathType Container)) {
        Invoke-RecordedStep -Command "npm.cmd" -Arguments @("ci") -Label "frontend-install"
    }
    Invoke-RecordedStep -Command "npm.cmd" -Arguments @("run","build") -Label "frontend-build"
} finally { Pop-Location }
Write-Host "All validation/test/build commands returned exit code 0. Demo provisioning and running HTTP verification are still pending." -ForegroundColor Green
