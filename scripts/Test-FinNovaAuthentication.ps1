#requires -Version 5.1
[CmdletBinding()]
param([ValidateSet("http://127.0.0.1:8080","http://127.0.0.1:5173")][string]$BaseUrl = "http://127.0.0.1:8080")
$ErrorActionPreference = "Stop"
Get-Location | Format-List
Write-Host "Real HTTP smoke check: cookies/CSRF tokens are kept in memory and never printed." -ForegroundColor Cyan
Write-Host "This check logs in and logs out, revoking other sessions for the selected synthetic identity."
$Email = Read-Host "Enter your provisioned .test demo email, or press Enter for customer1@finnova.test"
if ([string]::IsNullOrWhiteSpace($Email)) { $Email = "customer1@finnova.test" }
if ($Email -notin @("customer1@finnova.test","customer2@finnova.test","officer@finnova.test","admin@finnova.test")) {
    throw "Select one of the provisioned synthetic demo identities only."
}
$Session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
function Invoke-CheckedHttp {
    param([string]$Method,[string]$Path,[int]$Expected,[hashtable]$Headers = @{},[object]$Body = $null)
    $Parameters = @{ Uri = $BaseUrl + $Path; Method = $Method; WebSession = $Session;
        Headers = $Headers; UseBasicParsing = $true; TimeoutSec = 20; ErrorAction = "Stop" }
    if ($null -ne $Body) { $Parameters["ContentType"] = "application/json"; $Parameters["Body"] = ConvertTo-Json -InputObject $Body -Compress }
    try {
        $Response = Invoke-WebRequest @Parameters
        $Code = [int]$Response.StatusCode
        $Text = $Response.Content
    } catch [Net.WebException] {
        if ($null -eq $_.Exception.Response) { throw "Cannot connect to the selected local server. Check its startup output." }
        $Code = [int]$_.Exception.Response.StatusCode
        $Reader = [IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        try { $Text = $Reader.ReadToEnd() } finally { $Reader.Dispose() }
    }
    if ($Code -ne $Expected) { throw "HTTP check failed: $Method $Path expected $Expected but received $Code. Stop; do not print cookies or credentials." }
    Write-Host "$Method $Path -> $Code" -ForegroundColor Green
    if (-not [string]::IsNullOrWhiteSpace($Text)) { return (ConvertFrom-Json -InputObject $Text) }
}
$Secret = Read-Host "Enter that identity's chosen demo password" -AsSecureString
$Pointer = [IntPtr]::Zero
try {
    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
    $Health = Invoke-CheckedHttp -Method GET -Path "/api/health" -Expected 200
    $Anonymous = Invoke-CheckedHttp -Method GET -Path "/api/profile" -Expected 401
    $Csrf = Invoke-CheckedHttp -Method GET -Path "/api/auth/csrf" -Expected 200
    $Denied = Invoke-CheckedHttp -Method POST -Path "/api/auth/login" -Expected 403 -Body @{ email=$Email; password=$Password }
    $Headers = @{ "X-CSRF-TOKEN" = $Csrf.token }
    $LoggedIn = Invoke-CheckedHttp -Method POST -Path "/api/auth/login" -Expected 200 -Headers $Headers -Body @{ email=$Email; password=$Password }
    $Profile = Invoke-CheckedHttp -Method GET -Path "/api/profile" -Expected 200
    if ($Profile.email -ne $Email) { throw "The returned profile does not match the selected synthetic identity." }
    Write-Host "Authenticated synthetic role: $($Profile.role)" -ForegroundColor Cyan
    $Csrf = Invoke-CheckedHttp -Method GET -Path "/api/auth/csrf" -Expected 200
    $Headers = @{ "X-CSRF-TOKEN" = $Csrf.token }
    $LoggedOut = Invoke-CheckedHttp -Method POST -Path "/api/auth/logout" -Expected 204 -Headers $Headers
    $DeniedAgain = Invoke-CheckedHttp -Method GET -Path "/api/profile" -Expected 401
} finally {
    if ($Pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer) }
    $Secret.Dispose()
    Remove-Variable Password,Session,Csrf,Headers,LoggedIn,Profile -ErrorAction SilentlyContinue
}
Write-Host "All selected HTTP smoke checks matched their expected status codes." -ForegroundColor Green
