#requires -Version 5.1
$ErrorActionPreference="Stop"
$Root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location|Format-List
. (Join-Path $PSScriptRoot "Use-FinNovaEnvironment.ps1")
$Evidence=Join-Path $Root "docs\verification"
if(-not(Test-Path -LiteralPath $Evidence -PathType Container)){throw "Verification directory missing."}
$Run="stage6-"+(Get-Date -Format "yyyyMMdd-HHmmssfff")
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
function Step {
    param([string]$Command,[string[]]$Arguments,[string]$Name)
    $Log=Join-Path $Evidence "$Run-$Name.log"
    if(Test-Path -LiteralPath $Log){throw "Evidence file exists. Nothing overwritten."}
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    Write-Host "Actual output: $Log"
    $Old=$ErrorActionPreference
    try{$ErrorActionPreference="Continue";& $Command @Arguments 2>&1|ForEach-Object{$_.ToString()}|Tee-Object -FilePath $Log;$Code=$LASTEXITCODE}finally{$ErrorActionPreference=$Old}
    if($Code -ne 0){throw "$Name failed with exit code $Code. Stop and paste the actual error, not credentials."}
}
Push-Location -LiteralPath (Join-Path $Root "backend")
try{
    foreach($Schema in @("finnova_demo","finnova_test")){
        $env:FLYWAY_URL="jdbc:mysql://127.0.0.1:3306/${Schema}?sslMode=REQUIRED&connectionTimeZone=%2B00:00&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8&allowMultiQueries=false"
        Step -Command ".\mvnw.cmd" -Arguments @("-B","-ntp","flyway:validate") -Name "$Schema-validate"
    }
    Step -Command ".\mvnw.cmd" -Arguments @("-B","-ntp","test") -Name "backend-tests"
    Step -Command ".\mvnw.cmd" -Arguments @("-B","-ntp","package") -Name "backend-package"
}finally{Pop-Location;$env:FLYWAY_URL="jdbc:mysql://127.0.0.1:3306/finnova_demo?sslMode=REQUIRED&connectionTimeZone=%2B00:00&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8&allowMultiQueries=false"}
Push-Location -LiteralPath (Join-Path $Root "frontend")
try{if(-not(Test-Path -LiteralPath "node_modules" -PathType Container)){Step -Command "npm.cmd" -Arguments @("ci") -Name "frontend-install"};Step -Command "npm.cmd" -Arguments @("run","build") -Name "frontend-build"}finally{Pop-Location}
Write-Host "All Stage 6 validation/test/build commands returned exit code 0. Updated startup and live API verification remain pending." -ForegroundColor Green
