#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory = $true)][ValidateSet("Migrate", "Build")][string]$Mode)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location | Format-List
. (Join-Path $PSScriptRoot "Use-FinNovaEnvironment.ps1")
$Evidence = Join-Path $Root "docs\verification"
if (-not (Test-Path -LiteralPath $Evidence -PathType Container)) { throw "Verification directory is missing. Stop; do not recreate the scaffold." }
$RunId = "stage2-" + (Get-Date -Format "yyyyMMdd-HHmmssfff")
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
function Invoke-RecordedStep {
    param([string]$Command, [string[]]$CommandArguments, [string]$Label)
    $Log = Join-Path $Evidence "$RunId-$Label.log"
    if (Test-Path -LiteralPath $Log) { throw "Log file already exists. It was not overwritten." }
    Write-Host "`n=== $Label ===" -ForegroundColor Cyan
    Write-Host "Actual output is saved in: $Log"
    $Previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $Command @CommandArguments 2>&1 | Tee-Object -FilePath $Log
        $Code = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $Previous }
    if ($Code -ne 0) { throw "$Label failed with exit code $Code. Stop here and share the actual error, not credentials." }
}
if ($Mode -eq "Migrate") {
    Push-Location -LiteralPath (Join-Path $Root "backend")
    try {
        foreach ($Schema in @("finnova_demo", "finnova_test")) {
            $env:FLYWAY_URL = "jdbc:mysql://127.0.0.1:3306/${Schema}?sslMode=REQUIRED&connectionTimeZone=%2B00:00&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8&allowMultiQueries=false"
            Invoke-RecordedStep -Command ".\mvnw.cmd" -CommandArguments @("-B","-ntp","flyway:migrate","flyway:validate") -Label "$Schema-migrate"
            # Re-run to verify migrations/seeding are not applied again.
            Invoke-RecordedStep -Command ".\mvnw.cmd" -CommandArguments @("-B","-ntp","flyway:migrate") -Label "$Schema-repeat-migrate"
        }
    }
    finally {
        Pop-Location
        $env:FLYWAY_URL = "jdbc:mysql://127.0.0.1:3306/finnova_demo?sslMode=REQUIRED&connectionTimeZone=%2B00:00&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8&allowMultiQueries=false"
    }
    Write-Host "Both schema migration/validation command sequences returned exit code 0. Next: Grant." -ForegroundColor Green
    return
}
Push-Location -LiteralPath (Join-Path $Root "backend")
try {
    Invoke-RecordedStep -Command ".\mvnw.cmd" -CommandArguments @("-B","-ntp","test") -Label "backend-tests"
    Invoke-RecordedStep -Command ".\mvnw.cmd" -CommandArguments @("-B","-ntp","package") -Label "backend-package"
}
finally { Pop-Location }
Push-Location -LiteralPath (Join-Path $Root "frontend")
try {
    if (-not (Test-Path -LiteralPath "node_modules" -PathType Container)) {
        Invoke-RecordedStep -Command "npm.cmd" -CommandArguments @("ci") -Label "frontend-install"
    }
    Invoke-RecordedStep -Command "npm.cmd" -CommandArguments @("run","build") -Label "frontend-build"
}
finally { Pop-Location }
Write-Host "All listed build/test commands returned exit code 0. Startup/SQL/browser verification are still required." -ForegroundColor Green
