# FinNova Bank - Stage 5 loan engine

Synthetic college lab ONLY. No real lending, money, documents or bank connection.
Stage 5 is backend-first; actual banking/loan React pages remain Stage 7. No Stretch.

## Implemented source

- Public active loan-product list/detail, two/three-product comparison and EMI quote.
- Customer DRAFT create/read/update/hard-delete, submit/resubmit, paged status history.
- Officer/Admin review, request additional information, approve/reject with reasons.
- Same policy service for Admin and Officer, each with their OWN approval_limit;
  no self-review/decision even after a customer's role changes to staff.
- Visible age, income multiplier, amount, rate and tenure/step rules from products.
  Declared income and annual rate are server snapshots, not mass-assignment fields.
- Verified synthetic KYC is required at approval/disbursement; pending KYC may submit.
  KYC queue/review APIs themselves remain Stage 6. No document-upload Stretch.
- Every allowed transition appends actor/time/reason history and audit; all invalid
  transitions are 409, customer staff-actions 403. Rejected cannot reopen.
- No loans/installments on approval alone. Valid simulated disbursement credits the
  customer account, creates ONE loan and schedule and records DISBURSED -> REPAYMENT
  as the system transition in the SAME transaction. Duplicate disbursement is 409.
- Reducing-balance monthly EMI, BigDecimal precision 34/HALF_UP, displayed scale 2.
  Zero interest P/n; last installment absorbs principal rounding to exact 0.00.
- Full, earliest-unpaid installment repayments only; no client-controlled amount.
  One transaction debits owned account, marks PAID, reduces principal, appends ledger,
  payment/audit, and completes idempotency. At zero principal the system closes loan
  and application. All financial histories remain immutable/no deletion.
- Repeated repayment key returns original status/DTO JSON, not another debit.
  Conflicting key payload 409; expected business rejections cached. Unexpected
  database errors roll back account, installment, outstanding, ledger, payment,
  reservation and audit. Transport uncertainty must retry SAME original payload/key.
- Live user/session recheck with actor SHARE locking; consistent financial ordering
  actor -> account -> application -> loan -> installment. Transfers still lock lower
  account ID first. No user-exclusive lock serializes every transfer/repayment.
- Repayment rate limiting uses a separate per-IP bucket and the financial 30/minute
  limit; JWT, CSRF, CORS and previous security checks remain enabled.
- Scheduled overdue scan (100 rows per minute), plus Admin-only demo-date and manual
  scan actions. due_date < effective India date marks PENDING as OVERDUE, never PAID.
  Demo date affects overdue only, not JWT expiry, login lockout, approval age or money.
- All DB lists are bounded/paginated; quote schedules are explicitly capped at 600.
  JSON dates ISO yyyy-MM-dd, UTC timestamps; React displays DD-MM-YYYY / Asia-Kolkata.
  Financial response values are exact decimal strings, never floating-point money.

## Directory/file creation and safety

Review/download finnova-stage5.ps1. Stop the actual backend in its own window with
Ctrl+C; keep MySQL and existing Vite alive. The upgrade refuses an occupied 8080.
It requires the tested Stage 4 CSRF correction. It checks existing files/anchors,
backs up all replaced files under .finnova-backups, creates only missing new files,
and never touches .env, credentials, signing keys or applied migrations V1-V5.
No new SQL migration or GRANT is needed: the MVP schema already has these columns.
No global Maven/Flyway install, JSON Server, Docker or external ML service is added.

## One-shot source and build option

From Windows PowerShell, after reviewing the downloaded source:

```powershell
Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank"
Get-Location
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "C:\Users\Abdul Salam\Downloads\finnova-stage5.ps1" -ProjectRoot "C:\Users\Abdul Salam\finnova-bank" -RunBuild
```

Use your ACTUAL downloaded path if the browser changed its name. APPLY STAGE5 at
its consent prompt authorizes backed-up source changes. RemoteSigned applies to
that child process only, not permanent policy. Respect managed organizational policy.
Never rerun earlier source generators, Prepare, signing-key setup or provisioning.

The -RunBuild option runs the new driver after writing source. For a build retry
AFTER diagnosis, without regenerating source:

```powershell
Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank"
Get-Location
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File ".\scripts\Run-FinNovaStage5.ps1"
```

The driver loads existing private environment, validates V1-V5 in BOTH schemas,
runs mvnw.cmd -B -ntp test, then package, then npm.cmd run build. Maven resolves
normal declared dependencies. Frontend dependencies are unchanged; missing
node_modules only triggers npm.cmd ci with the existing lockfile. Generated
target/dist are replaced, not source. Real stage5-*.log files are saved in
docs/verification, JUnit XML in backend/target/surefire-reports. Never claim PASS
before actual output. First failure stops the driver; preserve error/logs.

## Test design

Independent EMI examples: INR 100000 at 12%/12 months -> EMI 8884.88, first interest
1000.00/principal 7884.88; INR 1000 at zero/3 months -> 333.33 and last 333.34; INR
1000 at 12%/one month -> 1010.00. Tests also reconcile summed principal and final 0.

Service/HTTP tests cover draft CRUD, info/resubmit loop, approval-only creates no
loan, validated disbursement, complete repayment/closure history, ownership, KYC,
approval limits, former-customer self-review, customer 403, invalid transition 409,
DTO mass assignment, public quotes/comparison, idempotency replay, duplicate/order
protection, demo-date overdue and Admin-only control. A fixed TEST-only clock keeps
the overdue test deterministic; production uses the existing real UTC Clock.
Separate-connection MySQL repayment races test same and different keys. Mockito
payment-write fault verifies rollback and same-key retry. Source alone is not proof
these tests pass: actual Maven output is required.

All test fixtures assert finnova_test and restricted runtime user. Committed
concurrency/rollback fixture financial histories stay; users retire disabled and
accounts freeze, never financial DELETE cleanup. Old seeded applications 1001..1003
are separately checked for no premature loan records. New legitimate loan fixtures
are NOT erased to satisfy an old global zero-row assertion. Reconciliation checks
all loan outstanding vs unpaid principal and account balances vs signed ledger.
Test data totals grow with each run/package rerun; demo data is not altered by tests.
The scheduled job is disabled in dbtest; manual scan is still integration-tested.

## Start - only after tests/build succeed

```powershell
Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank"
Get-Location
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -Command {
    Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank"
    $ErrorActionPreference="Stop"
    . .\scripts\Use-FinNovaEnvironment.ps1
    Set-Location -LiteralPath ".\backend"
    .\mvnw.cmd -B -ntp spring-boot:run
}
```

Wait for BOTH Tomcat started on 8080 AND Started FinNovaBankApplication. Do not
start a second listener or silently change ports; Vite still proxies /api to 8080.
Existing frontend may stay running. If stopped, in another window:

```powershell
Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank\frontend"
Get-Location
npm.cmd run dev
```

## Live verification - explicitly synthetic money

```powershell
Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank"
Get-Location
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File ".\scripts\Test-FinNovaLoans.ps1"
```

Only after RUN SIMULATED LOAN CHECK consent, this prompts privately for existing
customer1 and officer demo passwords (NOT MySQL root). It creates a NEW 10000.00
personal-loan application at 12%/6 months, submits, reviews/approves/disburses, pays
six full scheduled installments, replays each SAME key, verifies CLOSED/0 principal,
six payment rows and timeline, then logs both identities out. Synthetic interest
is genuinely debited: total demo account balances will NOT remain 140000 after
this loan cycle; they change by disbursement minus principal+interest repayments.
No automatic ledger reversal/edit/delete pretends to restore old demo balances.

Each application/loan ID and original repayment request/key is saved BEFORE the
respective uncertain financial step under a private ignored loan-smoke directory.
No password/JWT/CSRF is saved. On timeout or unexpected status STOP; never rerun
with a new application/key. Retain metadata and diagnose the actual state first.

Read-only financial verification:

```powershell
Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank"
Get-Location
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File ".\scripts\Verify-FinNovaStage5.ps1"
```

Expected: five successful migrations; NO account/ledger mismatch rows; NO loan vs
unpaid-principal mismatch; NO principal vs schedule mismatch; NO PAID/payment-row
mismatch. Counts/statuses/audit are from actual queries, not hardcoded metrics.
Do not share .env, passwords, hashes, signing keys, cookies, tokens or Maven -X.

## API map

GET /api/loan-products[?q&page&size], /{id}, /{id}/quote?principal&months[&annualRate]
GET /api/loan-products/compare?ids=1,2,3&principal=50000.00&months=12
POST /api/loan-applications {productId,accountId,principal,months,purpose}
GET /api/loan-applications[?status&page&size], /{id}, /{id}/history[?page&size]
PUT /api/loan-applications/{id} {same draft-only fields}; DELETE /{id} (DRAFT only)
POST /api/loan-applications/{id}/submit (Customer)
POST /api/loan-applications/{id}/resubmit {reason} (Customer after info request)
POST /api/loan-applications/{id}/review|request-info|approve|reject {reason} (staff)
POST /api/loan-applications/{id}/disburse {reason} (staff, policy, simulated)
GET /api/loans[?page&size], /{id}, /{id}/installments[?status&page&size], /{id}/payments
POST /api/loans/{id}/installments/{installmentId}/pay {accountId}, Idempotency-Key
PUT /api/loans/demo-date {date:"yyyy-MM-dd"} or {date:null} resets (Admin)
POST /api/loans/overdue-scan (Admin); returns actual batch count, maximum 100.
All mutations retain JWT/CSRF/role checks; clients cannot send status/rate/owner
or repayment amount. Installment due totals, rate and eligibility are server-owned.

## Limitations / troubleshoot

One earlier test clock/data file should never be used for a public server. This
is not production-secure banking. Previous JWT/CSRF/TLS/secret/rate-limit limitations
and the actual Flyway 8.4 compatibility warning remain in historical notes.
No partial payment, interest-discounted prepayment, late fee, holiday calendar,
real KYC, external settlement, PDF/document upload or AI decision is implemented.
An early FULL installment payment uses the original schedule/interest, not a
special prepayment product. Tiny principal/long tenure that would yield zero-cent
installments is rejected with 422; catalog products have realistic minimums.
Monthly dates anchor to the first due date; last installment absorbs rounding.
Resetting demo date does not automatically undo already-marked overdue flags.

Admin/Officer share the same policy service, not unlimited approval. A KYC-pending
submission cannot approve until Stage 6 review or valid existing VERIFIED demo KYC.
Officer sees submitted queues, not customer drafts. Frontend pages/CRUD product
management, KYC management, reports, Swagger and final documentation remain in
later planned stages, not falsely described as complete here. Do not bypass a
403/409/422 or a failed test with SQL resets/grant ALL/edited migrations. Paste the
actual error. Stop before the live script if tests fail. No Stretch until MVP done.
