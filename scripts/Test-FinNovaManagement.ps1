#requires -Version 5.1
[CmdletBinding()]
param([ValidateSet("http://127.0.0.1:8080","http://127.0.0.1:5173")][string]$BaseUrl="http://127.0.0.1:5173")
$ErrorActionPreference="Stop"
$Root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location|Format-List
Import-Module (Join-Path $PSScriptRoot "FinNova.Database.psm1") -Force
Write-Host "Stage 6 synthetic metadata check: registers one temporary .test identity, reviews its KYC, changes its role/activation and ends DISABLED; creates/updates/deactivates one temporary loan product. No balances, transfers, loans or payments are changed." -ForegroundColor Yellow
$Consent=Read-Host "Type RUN STAGE6 ADMIN CHECK to authorize these synthetic metadata actions"
if($Consent -ne "RUN STAGE6 ADMIN CHECK"){Write-Host "Cancelled; no requests sent.";return}
$Admin=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Officer=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Guest=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Directory=Join-Path $Root (".finnova-backups\management-smoke-"+[guid]::NewGuid().ToString("N"))
if(Test-Path -LiteralPath $Directory){throw "Metadata directory collision."}
New-Item -ItemType Directory -Path $Directory|Out-Null
function Http {
    param([object]$Session,[string]$Method,[string]$Path,[int]$Expected=200,[hashtable]$Headers=@{},[object]$Body=$null)
    $Parameters=@{Uri=$BaseUrl+$Path;WebSession=$Session;Method=$Method;Headers=$Headers;UseBasicParsing=$true;TimeoutSec=30;ErrorAction="Stop"}
    if($null -ne $Body){$Parameters.ContentType="application/json";$Parameters.Body=ConvertTo-Json -InputObject $Body -Depth 6 -Compress}
    try{$Response=Invoke-WebRequest @Parameters;$Code=[int]$Response.StatusCode;$Text=$Response.Content}
    catch [Net.WebException]{
        if($null -eq $_.Exception.Response){throw "Connection/timeout failure. Stop and retain $Directory; do not rerun the whole metadata check blindly."}
        $Code=[int]$_.Exception.Response.StatusCode;$Reader=[IO.StreamReader]::new($_.Exception.Response.GetResponseStream());try{$Text=$Reader.ReadToEnd()}finally{$Reader.Dispose()}
    }
    if($Code -ne $Expected){throw "HTTP $Code for $Method $Path; expected $Expected. Stop and report status, never credentials/cookies."}
    Write-Host "$Method $Path -> $Code" -ForegroundColor Green
    if([string]::IsNullOrWhiteSpace($Text)){return $null};return (ConvertFrom-Json -InputObject $Text)
}
function Csrf([object]$Session){$Token=Http -Session $Session -Method GET -Path "/api/auth/csrf";return @{"X-CSRF-TOKEN"=$Token.token}}
function Login([object]$Session,[string]$Email){
    $Secret=Read-Host "Enter chosen bank-demo password for $Email (NOT MySQL root)" -AsSecureString;$Pointer=[IntPtr]::Zero
    try{$Pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret);$Plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer);return (Http -Session $Session -Method POST -Path "/api/auth/login" -Headers (Csrf $Session) -Body @{email=$Email;password=$Plain})}
    finally{if($Pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)};$Secret.Dispose();Remove-Variable Plain -ErrorAction SilentlyContinue}
}
$AdminProfile=Login $Admin "admin@finnova.test"
$OfficerProfile=Login $Officer "officer@finnova.test"
if($AdminProfile.role -ne "ADMIN" -or $OfficerProfile.role -ne "LOAN_OFFICER"){throw "Expected provisioned Admin and Loan Officer identities."}
$Tag=[guid]::NewGuid().ToString("N").Substring(0,12)
$Email="stage6-"+$Tag+"@finnova.test"
$GeneratedPassword="Stage6_"+[guid]::NewGuid().ToString("N")+"9!aA"
try{$NewUser=Http -Session $Guest -Method POST -Path "/api/auth/register" -Expected 201 -Headers (Csrf $Guest) -Body @{email=$Email;fullName="Synthetic Stage6 $Tag";password=$GeneratedPassword;dateOfBirth="1995-01-01";declaredMonthlyIncome="0.00"}}finally{Remove-Variable GeneratedPassword -ErrorAction SilentlyContinue}
$UserId=$NewUser.id
Write-FinNovaPrivateEnv -Path (Join-Path $Directory "user.json") -Lines @((ConvertTo-Json -InputObject @{userId=$UserId;email=$Email}))
$Queue=Http -Session $Officer -Method GET -Path ("/api/officer/kyc?status=PENDING&q="+[uri]::EscapeDataString($Email))
if($Queue.totalElements -ne 1){throw "Expected one synthetic pending KYC. Stop; retain metadata."}
$KycId=$Queue.items[0].id
$AdminDenied=Http -Session $Admin -Method POST -Path "/api/officer/kyc/$KycId/decision" -Expected 403 -Headers (Csrf $Admin) -Body @{decision="VERIFIED";reason="Admin view-only negative check"}
$Reviewed=Http -Session $Officer -Method POST -Path "/api/officer/kyc/$KycId/decision" -Headers (Csrf $Officer) -Body @{decision="VERIFIED";reason="Synthetic Stage6 review satisfied"}
if($Reviewed.status -ne "VERIFIED"){throw "KYC decision mismatch. Stop."}
$Disabled=Http -Session $Admin -Method PUT -Path "/api/admin/users/$UserId/activation" -Headers (Csrf $Admin) -Body @{active=$false;reason="Synthetic activation evidence"}
$Role=Http -Session $Admin -Method PUT -Path "/api/admin/users/$UserId/role" -Headers (Csrf $Admin) -Body @{role="LOAN_OFFICER";approvalLimit="10000.00";reason="Synthetic role assignment"}
$Enabled=Http -Session $Admin -Method PUT -Path "/api/admin/users/$UserId/activation" -Headers (Csrf $Admin) -Body @{active=$true;reason="Synthetic reactivation evidence"}
$DisabledAgain=Http -Session $Admin -Method PUT -Path "/api/admin/users/$UserId/activation" -Headers (Csrf $Admin) -Body @{active=$false;reason="Retire synthetic demonstration identity"}
if($DisabledAgain.enabled -ne $false -or $Role.role -ne "LOAN_OFFICER"){throw "User metadata verification failed."}
$Terms=@{name="Synthetic product $Tag";description="Synthetic Stage6 catalog evidence";minPrincipal="10000.00";maxPrincipal="100000.00";annualRate="12.50";minAnnualRate="12.00";maxAnnualRate="14.00";minTenureMonths=6;maxTenureMonths=24;tenureStepMonths=6;minAge=21;maxAge=65;maxIncomeMultiplier="20.00"}
$Created=Http -Session $Admin -Method POST -Path "/api/admin/loan-products" -Expected 201 -Headers (Csrf $Admin) -Body @{code="DEMO_STAGE6_"+$Tag.ToUpper();terms=$Terms;reason="Synthetic product create"}
$ProductId=$Created.product.id
Write-FinNovaPrivateEnv -Path (Join-Path $Directory "product.json") -Lines @((ConvertTo-Json -InputObject @{productId=$ProductId;code=$Created.product.code}))
$Terms.name="Updated synthetic product $Tag";$Terms.annualRate="13.00"
$Updated=Http -Session $Admin -Method PUT -Path "/api/admin/loan-products/$ProductId" -Headers (Csrf $Admin) -Body @{terms=$Terms;reason="Synthetic product update"}
$Inactive=Http -Session $Admin -Method PUT -Path "/api/admin/loan-products/$ProductId/activation" -Headers (Csrf $Admin) -Body @{active=$false;reason="Synthetic product soft deactivate"}
if($Inactive.active -ne $false){throw "Product did not deactivate. Stop."}
$DeniedUsers=Http -Session $Officer -Method GET -Path "/api/admin/users" -Expected 403
$OwnAudit=Http -Session $Officer -Method GET -Path "/api/audit-logs?eventType=KYC_DECISION"
if(@($OwnAudit.items|Where-Object {$_.actorUserId -ne $OfficerProfile.id}).Count -gt 0){throw "Officer audit scope mismatch. Stop."}
$Decisions=Http -Session $Officer -Method GET -Path "/api/officer/decisions?decision=VERIFIED"
$Dashboard=Http -Session $Admin -Method GET -Path "/api/dashboard"
$Performance=Http -Session $Admin -Method GET -Path "/api/reports/product-performance?size=20"
Write-Host "Actual dashboard (safe aggregate fields only):" -ForegroundColor Cyan
$Dashboard|Select-Object role,from,to,timezone,accounts,loans|ConvertTo-Json -Depth 5
Write-Host "Verified: metadata CRUD/soft deactivation, Officer-only KYC, scoped audit/decisions and database-backed reporting. No financial mutation performed." -ForegroundColor Green
$LogoutAdmin=Http -Session $Admin -Method POST -Path "/api/auth/logout" -Expected 204 -Headers (Csrf $Admin)
$LogoutOfficer=Http -Session $Officer -Method POST -Path "/api/auth/logout" -Expected 204 -Headers (Csrf $Officer)
