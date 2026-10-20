#requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location | Format-List
. (Join-Path $PSScriptRoot "Use-FinNovaEnvironment.ps1")
$Names = @("DEMO_CUSTOMER1_PASSWORD","DEMO_CUSTOMER2_PASSWORD","DEMO_OFFICER_PASSWORD","DEMO_ADMIN_PASSWORD")
$Emails = @("customer1@finnova.test","customer2@finnova.test","officer@finnova.test","admin@finnova.test")
$Confirmation = Read-Host "Type PROVISION DEMO USERS to set FOUR different local demo passwords once; existing credentials will never be reset"
if ($Confirmation -ne "PROVISION DEMO USERS") { Write-Host "Cancelled; no credentials changed."; return }
$Distinct = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
try {
    for ($Index = 0; $Index -lt $Names.Count; $Index++) {
        $Secure = Read-Host "Choose a unique password for $($Emails[$Index]) (12+ characters, upper/lower/digit/symbol, no spaces, max 72 UTF-8 bytes)" -AsSecureString
        $Pointer = [IntPtr]::Zero
        try {
            $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
            $Plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
            if ($Plain.Length -lt 12 -or [Text.Encoding]::UTF8.GetByteCount($Plain) -gt 72 -or
                $Plain -cnotmatch '[A-Z]' -or $Plain -cnotmatch '[a-z]'  -or $Plain -notmatch '[0-9]' -or
                $Plain -notmatch '[^A-Za-z0-9]' -or $Plain -match '[\s\p{C}]') {
                throw "A demo password does not meet the setup policy. Use ASCII upper/lower/digit/symbol characters. No database users were provisioned."
            }
            if (-not $Distinct.Add($Plain)) { throw "Use four different passwords. No provisioning command has run." }
            [Environment]::SetEnvironmentVariable($Names[$Index], $Plain, "Process")
        } finally {
            if ($Pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer) }
            $Secure.Dispose()
            Remove-Variable Plain -ErrorAction SilentlyContinue
        }
    }
    [Environment]::SetEnvironmentVariable("FINNOVA_DEMO_PROVISION","true","Process")
    Push-Location -LiteralPath (Join-Path $Root "backend")
    try {
        # Passwords are inherited process environment variables, NEVER command arguments.
        & ".\mvnw.cmd" -B -ntp spring-boot:run
        if ($LASTEXITCODE -ne 0) { throw "Demo provisioning failed. Preserve its actual error; do not reset users or edit migrations." }
    } finally { Pop-Location }
} finally {
    foreach ($Name in $Names) { [Environment]::SetEnvironmentVariable($Name,$null,"Process") }
    [Environment]::SetEnvironmentVariable("FINNOVA_DEMO_PROVISION",$null,"Process")
    $Distinct.Clear()
    Remove-Variable Distinct -ErrorAction SilentlyContinue
}
Write-Host "Provisioning command completed. Remember your chosen passwords privately; none were saved as plaintext or printed by this setup." -ForegroundColor Green
