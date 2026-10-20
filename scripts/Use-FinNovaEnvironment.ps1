#requires -Version 5.1
# Dot-source this file in the PowerShell window that runs Maven/the backend.
$FinNovaEnvPath = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"
if (-not (Test-Path -LiteralPath $FinNovaEnvPath -PathType Leaf)) {
    throw "The private .env file is missing. Complete database Prepare first."
}
$FinNovaEnvLines = [IO.File]::ReadAllLines($FinNovaEnvPath)
if ($FinNovaEnvLines -notcontains "# FINNOVA_BOOTSTRAP_COMPLETE=true") {
    throw "Database bootstrap is incomplete or this is only a template. Stop and report the setup error; never paste .env."
}
$FinNovaAllowedNames = @(
    "DB_HOST", "DB_PORT", "DB_NAME", "DB_APP_USERNAME", "DB_APP_PASSWORD",
    "DB_MIGRATION_USERNAME", "DB_MIGRATION_PASSWORD", "SERVER_ADDRESS", "SERVER_PORT", "AUTH_JWT_SECRET", "AUTH_COOKIE_SECURE", "AUTH_ALLOWED_ORIGINS", "AUTH_TOKEN_TTL_SECONDS"
)
$FinNovaValues = @{}
foreach ($FinNovaLine in $FinNovaEnvLines) {
    if ([string]::IsNullOrWhiteSpace($FinNovaLine) -or $FinNovaLine.TrimStart().StartsWith("#")) { continue }
    $FinNovaSeparator = $FinNovaLine.IndexOf("=")
    if ($FinNovaSeparator -lt 1) { throw "Invalid environment-file format. Do not paste the line or file." }
    $FinNovaName = $FinNovaLine.Substring(0, $FinNovaSeparator).Trim()
    if ($FinNovaName -notin $FinNovaAllowedNames -or $FinNovaValues.ContainsKey($FinNovaName)) {
        throw "Unknown or duplicate environment variable name. Do not share secret values."
    }
    $FinNovaRaw = $FinNovaLine.Substring($FinNovaSeparator + 1).Trim()
    if ($FinNovaRaw.StartsWith('"')) {
        try { $FinNovaValue = ConvertFrom-Json -InputObject $FinNovaRaw -ErrorAction Stop }
        catch { throw "Invalid quoted environment value. Do not share its contents." }
        if ($FinNovaValue -isnot [string]) { throw "Environment values must be strings." }
    }
    else { $FinNovaValue = $FinNovaRaw }
    $FinNovaValues[$FinNovaName] = $FinNovaValue
}
foreach ($FinNovaName in $FinNovaAllowedNames) {
    if (-not $FinNovaValues.ContainsKey($FinNovaName) -or [string]::IsNullOrWhiteSpace($FinNovaValues[$FinNovaName])) {
        throw "Missing environment value: $FinNovaName. Do not paste secrets."
    }
}
if ($FinNovaValues["DB_HOST"] -ne "127.0.0.1" -or $FinNovaValues["DB_PORT"] -ne "3306" -or
    $FinNovaValues["DB_NAME"] -ne "finnova_demo" -or $FinNovaValues["DB_APP_USERNAME"] -ne "finnova_app" -or
    $FinNovaValues["DB_MIGRATION_USERNAME"] -ne "finnova_migrator") {
    throw "This setup is restricted to the named local synthetic demo/test schemas. No remote database connection is allowed."
}
foreach ($FinNovaName in $FinNovaAllowedNames) {
    [Environment]::SetEnvironmentVariable($FinNovaName, [string]$FinNovaValues[$FinNovaName], "Process")
}
$env:FLYWAY_URL = "jdbc:mysql://127.0.0.1:3306/finnova_demo?sslMode=REQUIRED&connectionTimeZone=%2B00:00&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8&allowMultiQueries=false"
# Remove parser variables containing extra copies of credentials. Environment
# variables themselves remain process-local; never run Get-ChildItem Env: to share them.
Remove-Variable FinNovaEnvPath,FinNovaEnvLines,FinNovaAllowedNames,FinNovaValues,FinNovaLine,FinNovaSeparator,FinNovaName,FinNovaRaw,FinNovaValue -ErrorAction SilentlyContinue
Write-Host "FinNova local environment loaded; no credential values printed." -ForegroundColor Green

