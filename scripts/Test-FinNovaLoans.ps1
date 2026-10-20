#requires -Version 5.1
[CmdletBinding()]
param([ValidateSet("http://127.0.0.1:8080","http://127.0.0.1:5173")][string]$BaseUrl="http://127.0.0.1:5173")
$ErrorActionPreference="Stop"
$Root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
Get-Location|Format-List
Import-Module (Join-Path $PSScriptRoot "FinNova.Database.psm1") -Force
Write-Host "Synthetic-only loan demo: new INR 10000.00 application, review/approval/disbursement, SIX full installments and closure. Interest is simulated and debited too." -ForegroundColor Yellow
Write-Host "Requires existing customer1 and officer demo passwords, not MySQL root. No credentials/tokens are printed or saved."
$Consent=Read-Host "Type RUN SIMULATED LOAN CHECK to authorize this complete synthetic loan cycle"
if($Consent -ne "RUN SIMULATED LOAN CHECK"){Write-Host "Cancelled; no requests sent.";return}
$Borrower=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Officer=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Directory=Join-Path $Root (".finnova-backups\loan-smoke-"+[guid]::NewGuid().ToString("N"))
if(Test-Path -LiteralPath $Directory){throw "Metadata directory collision. No requests sent."}
New-Item -ItemType Directory -Path $Directory|Out-Null
function Http {
    param([object]$Session,[string]$Method,[string]$Path,[int]$Expected=200,[hashtable]$Headers=@{},[object]$Body=$null)
    $Parameters=@{Uri=$BaseUrl+$Path;WebSession=$Session;Method=$Method;Headers=$Headers;UseBasicParsing=$true;TimeoutSec=30;ErrorAction="Stop"}
    if($null -ne $Body){$Parameters.ContentType="application/json";$Parameters.Body=ConvertTo-Json -InputObject $Body -Compress}
    try{$Reply=Invoke-WebRequest @Parameters;$Code=[int]$Reply.StatusCode}
    catch [Net.WebException]{
        if($null -eq $_.Exception.Response){throw "Connection/timeout failure. STOP; retain $Directory. Do not create another application or use new repayment keys."}
        $Status=[int]$_.Exception.Response.StatusCode;throw "HTTP $Status for $Method $Path. Stop and report the status; never credentials, cookies or tokens."
    }
    if($Code -ne $Expected){throw "Unexpected HTTP $Code for $Method $Path. Stop; retain saved request metadata."}
    Write-Host "$Method $Path -> $Code" -ForegroundColor Green
    $Data=if([string]::IsNullOrWhiteSpace($Reply.Content)){$null}else{ConvertFrom-Json -InputObject $Reply.Content}
    return [PSCustomObject]@{Data=$Data;Replayed=$Reply.Headers["Idempotency-Replayed"]}
}
function Csrf([object]$Session){$Value=Http -Session $Session -Method GET -Path "/api/auth/csrf";return @{"X-CSRF-TOKEN"=$Value.Data.token}}
function Login([object]$Session,[string]$Email){
    $Secret=Read-Host "Enter chosen bank-demo password for $Email" -AsSecureString;$Pointer=[IntPtr]::Zero
    try{
        $Pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret);$Plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
        $Headers=Csrf $Session;$Result=Http -Session $Session -Method POST -Path "/api/auth/login" -Headers $Headers -Body @{email=$Email;password=$Plain};return $Result.Data
    }finally{if($Pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)};$Secret.Dispose();Remove-Variable Plain -ErrorAction SilentlyContinue}
}
$Customer=Login $Borrower "customer1@finnova.test"
$Staff=Login $Officer "officer@finnova.test"
if($Customer.role -ne "CUSTOMER" -or $Staff.role -ne "LOAN_OFFICER"){throw "Expected provisioned Customer and Loan Officer identities."}
$Quote=Http -Session $Borrower -Method GET -Path "/api/loan-products/1/quote?principal=10000.00&months=6"
$Accounts=Http -Session $Borrower -Method GET -Path "/api/accounts?status=ACTIVE&size=100&sortBy=id&sortDirection=ASC"
$Account=@($Accounts.Data.items|Where-Object {$_.accountNumber -eq "FNDEMO000001"})
if($Account.Count -ne 1){throw "Expected customer1's original ACTIVE seed account. Stop."}
$Account=$Account[0]
if(([decimal]$Account.balance+[decimal]10000) -lt [decimal]$Quote.Data.calculation.totalPayment){throw "Not enough synthetic funds for the full demo cycle."}
$Headers=Csrf $Borrower
$App=Http -Session $Borrower -Method POST -Path "/api/loan-applications" -Expected 201 -Headers $Headers -Body @{productId=1;accountId=$Account.id;principal="10000.00";months=6;purpose="Synthetic Stage 5 loan cycle"}
$AppId=$App.Data.id
Write-FinNovaPrivateEnv -Path (Join-Path $Directory "application.json") -Lines @((ConvertTo-Json -InputObject @{applicationId=$AppId;accountId=$Account.id;customerId=$Customer.id;principal="10000.00"}))
$Submitted=Http -Session $Borrower -Method POST -Path "/api/loan-applications/$AppId/submit" -Headers $Headers
$StaffHeaders=Csrf $Officer
$Review=Http -Session $Officer -Method POST -Path "/api/loan-applications/$AppId/review" -Headers $StaffHeaders -Body @{reason="Synthetic review"}
$Approved=Http -Session $Officer -Method POST -Path "/api/loan-applications/$AppId/approve" -Headers $StaffHeaders -Body @{reason="Synthetic policy checks satisfied"}
Write-Host "Disbursing one synthetic INR 10000.00 loan; application metadata retained at $Directory."
$Disbursed=Http -Session $Officer -Method POST -Path "/api/loan-applications/$AppId/disburse" -Headers $StaffHeaders -Body @{reason="Explicit synthetic disbursement"}
$LoanId=$Disbursed.Data.id
Write-FinNovaPrivateEnv -Path (Join-Path $Directory "loan.json") -Lines @((ConvertTo-Json -InputObject @{applicationId=$AppId;loanId=$LoanId;accountId=$Account.id}))
$Schedule=Http -Session $Borrower -Method GET -Path "/api/loans/$LoanId/installments?size=100"
if($Schedule.Data.totalElements -ne 6){throw "Expected six installments. Stop; retain metadata."}
$Headers=Csrf $Borrower
foreach($Installment in $Schedule.Data.items){
    $Key=[guid]::NewGuid().ToString();$Body=@{accountId=$Account.id}
    Write-FinNovaPrivateEnv -Path (Join-Path $Directory ("repayment-"+$Installment.number+".json")) -Lines @((ConvertTo-Json -InputObject @{loanId=$LoanId;installmentId=$Installment.id;idempotencyKey=$Key;request=$Body} -Depth 4))
    $Headers["Idempotency-Key"]=$Key
    $Paid=Http -Session $Borrower -Method POST -Path "/api/loans/$LoanId/installments/$($Installment.id)/pay" -Expected 201 -Headers $Headers -Body $Body
    $Replay=Http -Session $Borrower -Method POST -Path "/api/loans/$LoanId/installments/$($Installment.id)/pay" -Expected 201 -Headers $Headers -Body $Body
    if($Replay.Replayed -ne "true" -or $Paid.Data.payment.reference -ne $Replay.Data.payment.reference){throw "Repayment replay verification failed. Stop; do not use a new key."}
}
$Closed=Http -Session $Borrower -Method GET -Path "/api/loans/$LoanId"
$Payments=Http -Session $Borrower -Method GET -Path "/api/loans/$LoanId/payments?size=100"
$History=Http -Session $Borrower -Method GET -Path "/api/loan-applications/$AppId/history?size=100"
if($Closed.Data.status -ne "CLOSED" -or [decimal]$Closed.Data.outstandingPrincipal -ne [decimal]0 -or $Payments.Data.totalElements -ne 6){throw "Loan closure/payment consistency check failed. Stop."}
Write-Host "Verified: approved -> disbursed -> repayment -> CLOSED; six payments, each replayed once, outstanding principal exactly 0.00." -ForegroundColor Green
$History.Data.items|Select-Object fromStatus,toStatus,actorType,actorRole|Format-Table -AutoSize
$CustomerLogout=Http -Session $Borrower -Method POST -Path "/api/auth/logout" -Expected 204 -Headers (Csrf $Borrower)
$StaffLogout=Http -Session $Officer -Method POST -Path "/api/auth/logout" -Expected 204 -Headers (Csrf $Officer)
