# Inspect-AdminWorkspace.ps1  -  READ-ONLY. Collects source needed to build the admin workspace.
# Run from the finnova-bank folder:  powershell -ExecutionPolicy Bypass -File .\Inspect-AdminWorkspace.ps1
# Writes admin-inspect.txt next to this script. Nothing is modified.
# Does NOT read .env, application*.yml/properties, keys or SQL seed data.
# Lines with hard-coded password/secret/token/jwt/cookie values are replaced by [redacted line].

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fe = Join-Path $root "frontend\src"
$be = Join-Path $root "backend\src"
$out = Join-Path $root "admin-inspect.txt"

function Scrub([string]$line, [bool]$strict) {
  if ($strict -and $line -match '(?i)password|secret|token|jwt|cookie|bearer') { return "    [redacted line]" }
  if ($line -match '(?i)(password|secret|token|jwt|apikey|api_key)\w*\s*[:=]\s*"[^"]{3,}"') { return "    [redacted line]" }
  if ($line -match '\$2[aby]\$\d\d\$') { return "    [redacted line]" }
  return $line
}
function Show([string]$path, [bool]$strict = $false) {
  if (-not (Test-Path $path)) { "######## MISSING $path"; return }
  $rel = $path.Replace($root + "\", "")
  "######## $rel"
  Get-Content -Encoding UTF8 $path | ForEach-Object { Scrub $_ $strict }
}
function ShowHead([string]$path, [int]$n) {
  $rel = $path.Replace($root + "\", "")
  "######## $rel (first $n lines)"
  Get-Content -Encoding UTF8 $path -TotalCount $n | ForEach-Object { Scrub $_ $false }
}

& {
  "===================== FRONTEND ====================="
  "######## src tree (lines)"
  Get-ChildItem $fe -Recurse -File -Include *.jsx, *.js, *.css |
    Where-Object { $_.Name -notmatch '\.bak' } |
    ForEach-Object { "{0,6}  {1}" -f (Get-Content $_.FullName | Measure-Object -Line).Lines, $_.FullName.Replace($fe + "\", "") }

  Show (Join-Path $fe "App.jsx")
  Show (Join-Path $fe "pages\AdminCenterPage.jsx")
  Show (Join-Path $fe "pages\DashboardPage.jsx")
  Get-ChildItem (Join-Path $fe "api") -File -Filter *.js | ForEach-Object { Show $_.FullName }
  Show (Join-Path $fe "hooks\usePanel.js")
  Show (Join-Path $fe "components\panels.jsx")

  "######## styles.css selector lines"
  $i = 0
  Get-Content -Encoding UTF8 (Join-Path $fe "styles.css") | ForEach-Object {
    $i++
    if ($_ -match '^\s*[.#@a-zA-Z:\[*][^;]*\{\s*$' -or $_ -match '^\s*/\* =====') { "{0,5}: {1}" -f $i, $_.Trim() }
  }
  "######## styles.css :root variables"
  Get-Content -Encoding UTF8 (Join-Path $fe "styles.css") | Select-String -Pattern '^\s*--[a-z0-9-]+\s*:' | Select-Object -First 80 | ForEach-Object { $_.Line.Trim() }

  "===================== BACKEND ====================="
  $main = Join-Path $be "main\java"
  "######## main java tree"
  Get-ChildItem $main -Recurse -Filter *.java | ForEach-Object { $_.FullName.Replace($main + "\", "") }

  "######## ALL CONTROLLERS (full)"
  Get-ChildItem $main -Recurse -Filter *Controller.java | ForEach-Object { Show $_.FullName }

  "######## DTO / record files (first 60 lines each)"
  Get-ChildItem $main -Recurse -Filter *.java |
    Where-Object { $_.Name -match '(Response|Request|View|Dto|DTO|Summary|Page|Row|Item|Command)\.java$' } |
    ForEach-Object { ShowHead $_.FullName 60 }

  "######## service public methods + security annotations"
  Get-ChildItem $main -Recurse -Filter *.java | Where-Object { $_.Name -match 'Service\.java$' } | ForEach-Object {
    "## $($_.Name)"
    Select-String -Path $_.FullName -Pattern 'PreAuthorize|Secured|hasRole|hasAnyRole|^\s*public\s|record\s+\w+\s*\(' |
      ForEach-Object { "{0,5}: {1}" -f $_.LineNumber, (Scrub $_.Line.Trim() $false) }
  }

  "######## SecurityConfig-like files (request matchers only)"
  Get-ChildItem $main -Recurse -Filter *.java | Where-Object { $_.Name -match 'Security|WebConfig' } | ForEach-Object {
    "## $($_.Name)"
    Select-String -Path $_.FullName -Pattern 'requestMatchers|hasRole|hasAnyRole|permitAll|authenticated|EnableMethodSecurity' |
      ForEach-Object { "{0,5}: {1}" -f $_.LineNumber, $_.Line.Trim() }
  }

  "######## Flyway schema statements (no data rows)"
  Get-ChildItem (Join-Path $be "main\resources\db") -Recurse -Filter *.sql -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object {
    "## $($_.Name)"
    Select-String -Path $_.FullName -Pattern 'CREATE TABLE|ALTER TABLE|ADD COLUMN|CHECK\s*\(|CONSTRAINT|FOREIGN KEY|CREATE INDEX' |
      ForEach-Object { "{0,5}: {1}" -f $_.LineNumber, $_.Line.Trim() }
  }

  "===================== REPAYMENT TEST ERRORS ====================="
  $t = Join-Path $be "test\java\com\finnova\bank\loans"
  "######## loans test folder"; Get-ChildItem $t -Name
  Show (Join-Path $t "RepaymentConcurrencyTest.java") $true
  Show (Join-Path $t "RepaymentRollbackTest.java") $true
  "######## shared test helpers"
  Get-ChildItem (Join-Path $be "test\java") -Recurse -Filter *.java |
    Where-Object { $_.Name -match 'Fixture|Support|TestData|Helper|Seed|Factory|Base' } |
    ForEach-Object { Show $_.FullName $true }
  "######## stack traces (project frames only)"
  foreach ($r in "RepaymentConcurrencyTest", "RepaymentRollbackTest") {
    "## $r"
    $f = Join-Path $root "backend\target\surefire-reports\com.finnova.bank.loans.$r.txt"
    if (Test-Path $f) {
      Get-Content $f | Select-String 'Exception|Denied|at com\.finnova|Caused by' | Select-Object -First 40 | ForEach-Object { $_.Line }
    } else { "(report not found)" }
  }
} *> $out

$size = (Get-Item $out).Length
Write-Host "Wrote $out ($([math]::Round($size / 1KB)) KB). Attach it in the chat." -ForegroundColor Green
