#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet("http://127.0.0.1:8080","http://127.0.0.1:5173")][string]$BaseUrl="http://127.0.0.1:5173",
    [long]$ResumeAccountId=0
)
if($ResumeAccountId -lt 0){throw "ResumeAccountId must be zero or a positive existing account ID."}
$ErrorActionPreference="Stop"
$Root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location | Format-List
Import-Module (Join-Path $PSScriptRoot "FinNova.Database.psm1") -Force
if($ResumeAccountId -gt 0){
    Write-Host "This check REUSES existing zero-balance account $ResumeAccountId for rename/soft-close, then moves INR 1.00 between your two seed accounts." -ForegroundColor Yellow
}else{
    Write-Host "This LIVE LOCAL DEMO check creates/renames/soft-closes one ZERO-balance account and moves INR 1.00 between your two seeded demo accounts." -ForegroundColor Yellow
}
Write-Host "It repeats the SAME transfer key to prove replay, not to move another rupee. Financial records are retained, never deleted or reversed automatically."
$Consent=Read-Host "Type RUN SIMULATED BANKING CHECK to authorize these synthetic-only actions"
if($Consent -ne "RUN SIMULATED BANKING CHECK"){Write-Host "Cancelled; no requests sent.";return}
$Email=Read-Host "Enter customer1@finnova.test or customer2@finnova.test, or press Enter for customer1"
if([string]::IsNullOrWhiteSpace($Email)){$Email="customer1@finnova.test"}
if($Email -notin @("customer1@finnova.test","customer2@finnova.test")){throw "Use one of the two synthetic CUSTOMER identities."}
$Session=New-Object Microsoft.PowerShell.Commands.WebRequestSession
function Invoke-BankHttp {
    param([string]$Method,[string]$Path,[int]$Expected,[hashtable]$Headers=@{},[object]$Body=$null)
    $Parameters=@{Uri=$BaseUrl+$Path;Method=$Method;WebSession=$Session;Headers=$Headers;UseBasicParsing=$true;TimeoutSec=30;ErrorAction="Stop"}
    if($null -ne $Body){$Parameters.ContentType="application/json";$Parameters.Body=ConvertTo-Json -InputObject $Body -Compress}
    try{
        $Response=Invoke-WebRequest @Parameters
        $Code=[int]$Response.StatusCode;$Text=$Response.Content;$Replay=$Response.Headers["Idempotency-Replayed"]
    }catch [Net.WebException]{
        if($null -eq $_.Exception.Response){throw "Connection/timeout failure. Stop; if a transfer was sent, retain its saved request metadata and do not rerun with a new key."}
        $Code=[int]$_.Exception.Response.StatusCode
        throw "Unexpected HTTP $Code for $Method $Path. Stop and report the status only; never cookies or passwords."
    }
    if($Code -ne $Expected){throw "Expected HTTP $Expected but received $Code for $Method $Path. Stop."}
    Write-Host "$Method $Path -> $Code" -ForegroundColor Green
    $Data=if([string]::IsNullOrWhiteSpace($Text)){$null}else{ConvertFrom-Json -InputObject $Text}
    return [PSCustomObject]@{Data=$Data;Replayed=$Replay;Status=$Code}
}
function Get-BankCsrfHeaders {
    $Token=Invoke-BankHttp -Method GET -Path "/api/auth/csrf" -Expected 200
    return @{"X-CSRF-TOKEN"=$Token.Data.token}
}
$Secret=Read-Host "Enter this CUSTOMER's chosen bank-demo password (NOT MySQL root)" -AsSecureString
$Pointer=[IntPtr]::Zero
try{
    $Pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
    $Password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
    $Headers=Get-BankCsrfHeaders
    $Login=Invoke-BankHttp -Method POST -Path "/api/auth/login" -Expected 200 -Headers $Headers -Body @{email=$Email;password=$Password}
    if($Login.Data.role -ne "CUSTOMER"){throw "A CUSTOMER identity is required."}
    $Headers=Get-BankCsrfHeaders
    if($ResumeAccountId -gt 0){
        # GET is ownership-protected. Never create a second account to hide failure.
        $Opened=Invoke-BankHttp -Method GET -Path "/api/accounts/$ResumeAccountId" -Expected 200
        if([decimal]$Opened.Data.balance -ne [decimal]0 -or $Opened.Data.status -ne "ACTIVE"){
            throw "The existing account is not ACTIVE with zero balance. Stop; no transfer sent."
        }
        $NewId=$ResumeAccountId
    }else{
        $Opened=Invoke-BankHttp -Method POST -Path "/api/accounts" -Expected 201 -Headers $Headers -Body @{nickname="Synthetic empty account";accountType="SAVINGS"}
        if([decimal]$Opened.Data.balance -ne [decimal]0){throw "New account was not zero-balance. Stop."}
        $NewId=$Opened.Data.id
    }
    $Renamed=Invoke-BankHttp -Method PATCH -Path "/api/accounts/$NewId" -Expected 200 -Headers $Headers -Body @{nickname="Synthetic renamed account"}
    $Closed=Invoke-BankHttp -Method POST -Path "/api/accounts/$NewId/close" -Expected 200 -Headers $Headers
    if($Closed.Data.status -ne "CLOSED"){throw "Expected soft close. Stop."}
    $List=Invoke-BankHttp -Method GET -Path "/api/accounts?status=ACTIVE&size=100&sortBy=id&sortDirection=ASC" -Expected 200
    $Owned=@($List.Data.items | Where-Object {$_.accountNumber -like "FNDEMO*"})
    if($Owned.Count -ne 2){throw "Expected the two owned, active FNDEMO seed accounts. Stop without transferring."}
    $Source=$Owned[0];$Target=$Owned[1]
    if([decimal]$Source.balance -lt [decimal]1){throw "Insufficient demo funds for this live check."}
    $Key=[guid]::NewGuid().ToString()
    $TransferBody=@{sourceAccountId=$Source.id;targetAccountId=$Target.id;amount="1.00";note="Stage 4 synthetic replay verification"}
    # Save noncredential retry metadata BEFORE sending money. No JWT/password/CSRF.
    $SavedDirectory=Join-Path $Root (".finnova-backups\transfer-smoke-"+[guid]::NewGuid().ToString("N"))
    if(Test-Path -LiteralPath $SavedDirectory){throw "Retry metadata directory collision. No transfer sent."}
    New-Item -ItemType Directory -Path $SavedDirectory | Out-Null
    $SavedRequest=Join-Path $SavedDirectory "request.json"
    $Metadata=@{userId=$Login.Data.id;email=$Email;idempotencyKey=$Key;request=$TransferBody}
    Write-FinNovaPrivateEnv -Path $SavedRequest -Lines @((ConvertTo-Json -InputObject $Metadata -Depth 5))
    Write-Host "Private noncredential retry metadata saved: $SavedRequest"
    $Headers["Idempotency-Key"]=$Key
    $First=Invoke-BankHttp -Method POST -Path "/api/transfers" -Expected 201 -Headers $Headers -Body $TransferBody
    $Second=Invoke-BankHttp -Method POST -Path "/api/transfers" -Expected 201 -Headers $Headers -Body $TransferBody
    if($Second.Replayed -ne "true"){throw "The second response did not confirm replay. Stop; do not send a new key."}
    foreach($Field in @("reference","amount","sourceBalanceAfter","targetBalanceAfter","occurredAt")){
        if($First.Data.$Field -ne $Second.Data.$Field){throw "Original/replayed response mismatch. Stop."}
    }
    $SourceAfter=Invoke-BankHttp -Method GET -Path "/api/accounts/$($Source.id)" -Expected 200
    $TargetAfter=Invoke-BankHttp -Method GET -Path "/api/accounts/$($Target.id)" -Expected 200
    # Decimal arithmetic here verifies output only; ALL business money logic is Java BigDecimal.
    if([decimal]$SourceAfter.Data.balance -ne ([decimal]$Source.balance-[decimal]1) -or
       [decimal]$TargetAfter.Data.balance -ne ([decimal]$Target.balance+[decimal]1)){
        throw "Balances do not demonstrate exactly one simulated transfer. Stop."
    }
    $Reference=$First.Data.reference
    $History=Invoke-BankHttp -Method GET -Path "/api/transactions?q=$Reference&size=10" -Expected 200
    if($History.Data.totalElements -ne 2){throw "Expected exactly two matching immutable ledger entries. Stop."}
    Write-Host "Verified: one INR 1.00 movement, replayed original result, two ledger entries, and zero-balance account CRUD/soft close." -ForegroundColor Green
    $LogoutHeaders=Get-BankCsrfHeaders
    $Logout=Invoke-BankHttp -Method POST -Path "/api/auth/logout" -Expected 204 -Headers $LogoutHeaders
}finally{
    if($Pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)}
    $Secret.Dispose()
    Remove-Variable Password,Session,Headers,Login,Key,LogoutHeaders -ErrorAction SilentlyContinue
}

