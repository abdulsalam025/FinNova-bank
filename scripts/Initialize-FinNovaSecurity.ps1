#requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location | Format-List
Import-Module (Join-Path $PSScriptRoot "FinNova.Database.psm1") -Force
$EnvPath = Join-Path $Root ".env"
if (-not (Test-Path -LiteralPath $EnvPath -PathType Leaf)) { throw "Stage 2 private environment missing. Do not recreate databases." }
git.exe check-ignore --quiet --no-index -- .env
if ($LASTEXITCODE -ne 0) { throw "The private environment is not confirmed ignored. Stop before generating a secret." }
$Old = [IO.File]::ReadAllText($EnvPath)
if (-not $Old.Contains("# FINNOVA_BOOTSTRAP_COMPLETE=true")) { throw "Database bootstrap marker is missing. Stop; never paste .env." }
if ($Old -match '(?m)^AUTH_') { throw "AUTH_ settings already exist. No key was regenerated or overwritten. Report only that they exist." }
$Confirmation = Read-Host "Type INITIALIZE SECURITY to back up the private environment and append a new JWT signing key"
if ($Confirmation -ne "INITIALIZE SECURITY") { Write-Host "Cancelled; no key was generated or saved."; return }
$BackupDirectory = Join-Path $Root (".finnova-backups\security-" + [guid]::NewGuid().ToString("N"))
if (Test-Path -LiteralPath $BackupDirectory) { throw "Backup directory collision. Nothing was changed." }
New-Item -ItemType Directory -Path $BackupDirectory | Out-Null
$BackupFile = Join-Path $BackupDirectory "private-env.backup"
Write-FinNovaPrivateEnv -Path $BackupFile -Lines @($Old)
$Bytes = New-Object byte[] 64
$Random = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $Random.GetBytes($Bytes) } finally { $Random.Dispose() }
$Key = [Convert]::ToBase64String($Bytes)
$Addition = "`r`n# Stage 3 local authentication; signing key is private.`r`n" +
    "AUTH_JWT_SECRET=" + (ConvertTo-Json -InputObject $Key -Compress) + "`r`n" +
    "AUTH_COOKIE_SECURE=false`r`nAUTH_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173`r`nAUTH_TOKEN_TTL_SECONDS=900`r`n"
if ([IO.File]::ReadAllText($EnvPath) -cne $Old) { throw "Environment changed during review. Nothing was appended." }
# Append preserves the private file's existing ACL. A private backup was made first.
[IO.File]::AppendAllText($EnvPath, $Addition, [Text.UTF8Encoding]::new($false))
[Array]::Clear($Bytes, 0, $Bytes.Length)
Remove-Variable Old,Key,Addition,Bytes -ErrorAction SilentlyContinue
Write-Host "Security settings saved privately; no secret value printed. Existing database credentials were preserved." -ForegroundColor Green
