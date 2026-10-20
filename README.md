# FinNova Bank - Stage 6 management and reporting APIs

Synthetic college lab only. No real banking, money, KYC identity documents or ML.
This stage completes the management/reporting BACKEND, not the React pages yet.

## Added source and permissions

- Admin user search/filter/sort/pagination/detail, activation/deactivation and role
  assignment, all with reasons and immutable audit. Password/hash/token-version
  fields are never returned or accepted. Customer role requires a customer profile;
  staff roles require a positive approval limit. Unprovisioned identities cannot
  activate without a BCrypt credential. No password reset/default-password shortcut.
- Role/activation changes increment token_version, so old JWTs stay revoked even
  after reactivation. Existing account money and histories are not altered.
- Self-deactivation and self-role/limit changes are refused. A stable preexisting
  settings row serializes admin commands BEFORE ascending user-row locks; this
  prevents two Admins deactivating each other via a write-skew/deadlock cycle.
  At least one enabled Admin is preserved through API commands. The lock does not
  edit that setting's value or require a new migration. Trusted test cleanup/root
  SQL are outside the API and must not be used to claim production security.
- Admin product create/read/update and soft activation/deactivation; separate DTOs
  reject id/status/version/code mutation. Ranges/rates/tenure step/age/income rules
  validated; product row locks and versions protect writes. Existing disbursed loan
  terms remain immutable snapshots. Changed product policy may make pending apps
  ineligible; there is no silent retroactive interest change.
- Officer KYC pending/review queue, detail and VERIFIED/REJECTED decisions with
  required reason; no self-review; active Customer subject only. Admin can VIEW KYC
  but cannot decide, matching the permissions table. Customer may read own KYC and
  resubmit rejected KYC text into PENDING, never force verification. All decisions/
  resubmissions are audit-appended; resetting current review fields does not erase
  old decision history. This is synthetic DEMO_ID review, NOT document upload.
- Officer own decision history (loan-history reasons + KYC audit reasons), Admin all
  decisions, paginated/date-filtered. Old V5 seed KYC event did not include a reason:
  its reason remains NULL, not fabricated or rewritten. New decisions have reasons.
- Audit-log search: Admin all, Officer actor-self only; attempted actor-filter escape
  is 403. Customer denied. Bounded pages, event/outcome/search/date filters; no audit
  update/delete HTTP endpoint. Immutable entity/grants remain intact.
- Real DB dashboard/report queries, Customer-owned scope, Admin global scope,
  Officer loan-review/portfolio scope only. Officer gets NO account balances or
  account activity (accounts=null, activity=[]). Role/backend checks, not menus.
- Reports: active Customers, balances/account counts, ranged ledger vs operation
  count/volume, pending applications, approved/rejected decisions, outstanding,
  upcoming/overdue installments, daily activity, portfolio, repayment/overdue trend,
  top-10 product performance and paginated full product-performance report.

## Metric/date semantics - no fake historical claims

Date filters are inclusive India yyyy-MM-dd dates translated to UTC [start,end),
maximum 366 days. Missing dates default to last 30 India days. Fixed numeric timezone
conversion in SQL avoids requiring named MySQL timezone tables on Windows.
Balances, active counts, outstanding and unpaid counts are CURRENT stock metrics;
date ranges filter event flows/charts, not reconstructed historical balances.
Dashboard JSON declares this, real stock timestamp and effective demo repayment date.
Overdue/upcoming use the Stage 5 effective date; authentication stays on real Clock.

Ledger-entry count is distinct from operation count/volume. Operation volume excludes
TRANSFER_CREDIT so one internal transfer isn't counted twice. Account-activity
credit/debit charts still include BOTH ledger directions (not a mislabeled net flow).
Opening credits,
loan disbursements and repayment debits each count once. Product submission counts
use submitted_at; loan disbursement/repayments use their actual event timestamps.
Outstanding is current, not date-ranged. Native aggregate queries are parameter-bound
inside dedicated repositories, not concatenated from user input or calculated in
React. Financial results are BigDecimal/decimal JSON strings, no float/double money.
Empty grouped results stay empty; zero aggregates come from actual SQL COALESCE.
Product top 10 is explicitly labeled; full performance uses real count/pagination.

## Source/dependencies/config/migration setup - Windows PowerShell

Stop the known backend in its own window with Ctrl+C first; keep MySQL and existing
Vite running. Review/download finnova-stage6.ps1. It checks existing files/anchors,
backs up replaced files under .finnova-backups, creates new sources, and leaves
.env, passwords, JWT keys, financial records and V1-V5 migrations unchanged.
Existing tables/grants support this stage; no new SQL migration, GRANT, npm package,
global tool, Docker, JSON Server or extra framework is installed.

One-shot source + validation/tests/package/frontend build:

```powershell
Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank"
Get-Location
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "C:\Users\Abdul Salam\Downloads\finnova-stage6.ps1" -ProjectRoot "C:\Users\Abdul Salam\finnova-bank" -RunBuild
```

Use the ACTUAL downloaded file path (browser may add (1)). At the prompt enter only
APPLY STAGE6. Process RemoteSigned is not a permanent user/machine policy change;
respect managed policy. No generator reruns over work. Backend port 8080 safety
check stops before writes if it is occupied. Never kill an unknown Java process.

The driver loads existing private environment, validates BOTH schemas with Flyway,
then mvnw.cmd -B -ntp test, package, npm.cmd run build. Only missing node_modules
runs npm.cmd ci with the existing lockfile. target/dist regenerate, not source.
Actual new stage6-*.log files go to docs/verification; JUnit reports remain under
backend/target/surefire-reports. Never invent PASS before real commands succeed.
If source succeeded but a test failed, retry the driver AFTER fixing actual error:

```powershell
Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank"
Get-Location
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File ".\scripts\Run-FinNovaStage6.ps1"
```

No private config changes or provisioning needed. Do not rerun Prepare/key setup/
provisioning/old generators, edit applied migrations, delete financial test history,
grant ALL, or use Maven -X. Preserve the actual Flyway 8.4 compatibility warning.

## Test coverage and data integrity

New test source covers activation/token revocation/reactivation, self-admin protection,
role/approval-limit checks, unprovisioned activation refusal, DTO privacy, actual
product CRUD/soft deactivation, KYC reject/resubmit/verify/audit, Admin view-only KYC,
required reasons, self-review refusal, Officer audit/decision ownership, real scoped
report totals, no double-counting transfer credits, role-aware dashboard fields,
invalid ranges/pages, independent UTC/India/leap-year examples, and real concurrent
cross-admin deactivation. Existing auth/transfer/loan/idempotency/rollback tests stay.
Tests use finnova_test, no live demo calls. Transactional request changes roll back;
committed fixture histories remain and retire disabled/frozen, never financial DELETE.
Test teardown may leave no enabled TEST admins: it is trusted isolated fixture SQL,
not an API operation or a demo/admin-provisioning problem. Demo Admin stays enabled.
No tests or build results are preclaimed by this source.

## Start after tests pass

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

Wait for Tomcat started on 8080 AND Started FinNovaBankApplication. Keep window open.
Vite may stay running unchanged. If stopped, in another window:

```powershell
Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank\frontend"
Get-Location
npm.cmd run dev
```

## Live metadata/report verification

```powershell
Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank"
Get-Location
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File ".\scripts\Test-FinNovaManagement.ps1"
```

Requires RUN STAGE6 ADMIN CHECK consent and existing Admin/Officer chosen passwords,
NOT MySQL root. It privately registers one new synthetic identity with an ephemeral
random password, reviews its KYC as Officer (Admin review 403), exercises role and
activation and ends the identity DISABLED; creates/updates/deactivates one temporary
product. The generated temporary password is never printed/saved/shared. New rows
and audit history remain, not deleted. It reads own Officer audits/decisions and
Admin dashboard/performance, checks Officer user-management 403, then logs out.
No balances, loans, payments or transfers are changed. New object IDs are retained
privately in ignored management-smoke metadata; stop on any error, do not rerun the
whole script blindly if partial metadata changes exist. No auth tokens are saved.

Read-only proof:

```powershell
Set-Location -LiteralPath "C:\Users\Abdul Salam\finnova-bank"
Get-Location
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File ".\scripts\Verify-FinNovaStage6.ps1"
```

Expected: five successful migrations, audit entries for sensitive metadata changes,
synthetic temporary identity disabled/product inactive, no balance/ledger mismatch
and no outstanding/schedule mismatch rows. Counts are ACTUAL queries, not fixed
values. Current Stage 5 demo loan remains CLOSED with its original immutable payments.

## API map for Stage 7 frontend

GET /api/admin/users?q&role&enabled&page&size&sortBy&sortDirection; GET /{id}
PUT /api/admin/users/{id}/activation {active,reason}
PUT /api/admin/users/{id}/role {role,approvalLimit,reason}
GET /api/admin/loan-products?active&q&page&size; GET /{id}
POST /api/admin/loan-products {code,terms,reason}
PUT /api/admin/loan-products/{id} {terms,reason}
PUT /api/admin/loan-products/{id}/activation {active,reason}
terms: name,description,minPrincipal,maxPrincipal,annualRate,minAnnualRate,maxAnnualRate,
  minTenureMonths,maxTenureMonths,tenureStepMonths,minAge,maxAge,maxIncomeMultiplier.
GET /api/officer/kyc?status&q&page&size; GET /{id} (Officer OR Admin)
POST /api/officer/kyc/{id}/decision {decision:VERIFIED|REJECTED,reason} (Officer ONLY)
GET /api/kyc; POST /api/kyc/resubmit {reason} (owned Customer, rejected only)
GET /api/audit-logs?actorId&eventType&outcome&q&from&to&page&size (scoped staff)
GET /api/officer/decisions?decision&from&to&page&size (own)
GET /api/admin/decisions?decision&from&to&page&size (all Admin)
GET /api/dashboard?from&to (role-scoped stocks/flows/charts)
GET /api/reports/product-performance?from&to&page&size (role-scoped)
All mutations keep real CSRF/JWT/role/session checks. Reads return DTOs, never entities.
No user/account/product hard DELETE and no financial update/delete endpoint.

## Remaining limits

Still a local synthetic single-process lab, not production-secure or regulatory
banking. Earlier token/CSRF/TLS/plaintext ACL-protected .env/limiter/lockout/refresh
limitations remain in historical notes. Never use real personal data/passwords in
free-text reasons. Never share .env, credentials, keys, JWT/cookie dumps or debug
logs. Only implemented technologies belong in the report.

Frontend pages, charts and role menus are Stage 7; current Coming soon labels stay
honest. Full test-report consolidation, Swagger/Postman/ER/screenshots/report and
submission packaging remain later stages. No Stretch/ML/real bank integration added.

---
# Historical Stage 1-5 notes (superseded by Stage 6 above)

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

---
# Historical Stage 1-4 notes (superseded by Stage 5 above)

# FinNova Bank - Stage 4: accounts, transactions and simulated transfers

Synthetic local college lab only. Stage 4 does not finish the loan workflows or UI.
All setup commands use Windows PowerShell. Copy command blocks, never console output.

## Scope and explicit transfer policy

The MVP interpretation of "own accounts only" is OWN-TO-OWN: a customer must own
BOTH source and target. No payment to another customer, external account or real
bank is implemented. Admin can view all accounts/transactions but cannot transfer,
open, rename or close customer accounts. Loan Officer has no private banking access.
Backend @PreAuthorize AND service ownership/session checks enforce these rules.

New accounts start at INR 0.00; clients cannot choose balances, currency, owner,
status or account number. Existing seeded demo balances fund the demonstration.
No fake deposit/mint-money endpoint is added. Customer registration itself still
creates no funded account. Opening more accounts is supported through the new API.
Accounts may be renamed and soft-closed only when balance is zero and no active
application/loan references them. Closed rows and transaction history are retained.
There is deliberately no financial DELETE endpoint.

## Source/config changes and backups

The generator checks source layout/existence, asks APPLY STAGE4 and backs up seven
changed files under .finnova-backups. New Java source, tests, helpers and this guide
are included in full. It changes the security principal to carry the JWT session
version for a second live check inside financial services, adds a scalar user-state
query, integrates transfer rate limiting/CORS response headers, appends transfer
configuration, updates the old seed-only balance assertion and updates the README.
The old profile ownership test's two-argument principal remains source-compatible,
but its sentinel version is explicitly rejected by financial services.

No private .env, secret, password or applied migration is changed. V1-V5 already
contain the needed account/ledger/idempotency columns, constraints and grants.
No new SQL migration, schema reset or GRANT is needed in this stage. Never rerun
Prepare, provisioning, secret initialization or an old generator. Never edit an
applied migration or run Flyway clean/repair to bypass a failure.

## Money movement and idempotency design

1. Structural DTO validation: positive distinct account IDs, a positive amount with
   at most two decimals, bounded note, required opaque ASCII Idempotency-Key.
2. Canonical SHA-256 request fingerprint (operation version, IDs, exact decimal
   amount, normalized note). 1.0 and 1.00 with equivalent notes are equivalent.
3. In one READ_COMMITTED transaction, atomically INSERT the scoped key or execute
   a no-op updated_at update on a duplicate. The unique index serializes same-key
   competitors. No "check then insert" race and no catching a unique-key exception
   inside a rollback-only JPA transaction. A SELECT FOR UPDATE then reads the row.
4. The reservation's users FK holds a shared user-row lock. Recheck live enabled
   state, role and token_version after reservation, not just in the HTTP filter.
5. A completed key returns its original HTTP status and DTO JSON, even if balances
   later changed. A different fingerprint with the same user/operation/key is 409.
6. Verify BOTH owned IDs using a count projection, not cached balance entities.
7. Lock the lower account ID FIRST, then the higher ID using PESSIMISTIC_WRITE /
   SELECT FOR UPDATE. Both accounts must be ACTIVE/INR. Check sufficient funds and
   destination DECIMAL capacity before touching any balance.
8. Debit/credit balances, insert two immutable ledger entries with one reference,
   append audit, and complete the stored response in the SAME transaction.
9. An unexpected persistence failure rolls back ALL those writes. Retrying the
   SAME key is safe. No independent reservation transaction or partial commit.

Completed expected business rejections (insufficient funds, inactive/foreign
account) are also stored and replayed without changing money. Use a NEW key for
an intentionally corrected/new operation. Malformed DTO/header, CSRF/auth failures
and unexpected infrastructure failures are not completed financial operations;
those reject before execution or roll back. After a timeout/unknown transport
outcome, retry the EXACT original request with the SAME key, never a new key.
Keys/history are retained, not periodically deleted. Retry headers do not bypass
rate limiting. The in-memory limiter is per-IP, shared across Vite's local proxy,
bounded and single-process, with a 30-per-minute transfer default. Database locks
and unique constraints, not rate limits, provide money/idempotency correctness.

All financial arithmetic is Java BigDecimal; scale 2, no float/double. There is
no rounding of over-precise transfer input: reject it. Financial response fields
serialize as decimal STRINGS (e.g. "25.00") so clients need not use binary floating
point and stored/replayed JSON preserves exact cents. Profile declared income
from Stage 3 remains its existing BigDecimal DTO field. UI formatting is separate.

Transfers do not edit/delete ledger rows. Reversals/adjustments must be appended
and linked to originals; no correction endpoint is introduced just for appearance.
BankAccount balance/status/version are mutable derived servicing state, not an
editable original transaction. The ledger entity and runtime grants are immutable.

## Query APIs

GET /api/accounts - own list for Customer; all or customerId-filtered for Admin.
  Optional status=ACTIVE|FROZEN|CLOSED and q; page=0,size=20 (max 100),
  sortBy=id|createdAt|balance|nickname|accountNumber and sortDirection=ASC|DESC.
GET /api/accounts/{id} - owned Customer record, or Admin read. Foreign/not found
  both return 404 for Customer; changing query filters cannot override ownership.
POST /api/accounts - nickname/accountType (SAVINGS or CURRENT), CSRF, Customer.
PATCH /api/accounts/{id} - nickname only, CSRF, owned Customer.
POST /api/accounts/{id}/close - CSRF, zero balance/no active loan reference.
GET /api/transactions - ownership-scoped immutable ledger history. Optional
  accountId,q,type,direction,minAmount,maxAmount,from,to; Admin customerId only.
  Dates use ISO yyyy-MM-dd and are converted from inclusive India dates to UTC
  [start,end) instants. Search escapes literal %, _ and backslash; parameters are
  bound. Sorting is whitelisted: id,createdAt,amount,direction,transactionType.
  Stable ID tie-breaking and bounded pagination; no entity serialization or N+1
  account-name lookups. Empty results are real empty pages, not hardcoded metrics.
POST /api/transfers - sourceAccountId,targetAccountId,amount,note; JWT/CSRF and
  Idempotency-Key required. New success: 201 + DTO JSON; replay: ORIGINAL status
  and body plus Idempotency-Replayed=true. This header is CORS-exposed.

List responses: items,page,size,totalElements,totalPages,sortBy,sortDirection.
No arbitrary role/customer/balance/status fields are accepted in write DTOs.
Future volume reports should count transfer OPERATIONS/debit volume, not blindly
sum the paired credit+debit ledger rows and double-count movement.

## Windows setup - directory/file creation

Stop the backend in its OWN window using Ctrl+C. Keep MySQL and an already running
frontend alive. Review/download finnova-stage4.ps1 and use the supplied launcher
with your verified ProjectRoot. It creates missing directories/files only after
checks and consent; existing source is backed up first. It does not execute SQL
or transfer money. Do not rerun the generator after success.

Open a process-scoped session for generated local helpers if needed:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned
```

This changes only the child process's execution policy, not user/machine policy.
Respect organizational policy; do not bypass managed restrictions.

## Dependency/config/migration/build/test commands

From the project root:

```powershell
Get-Location
.\scripts\Run-FinNovaStage4.ps1
```

The helper loads the EXISTING private environment. No new secret or package
installation outside normal Maven resolution is required. It validates V1-V5 in
both schemas, invokes mvnw.cmd -B -ntp test then package, and runs npm.cmd run build.
Only a missing node_modules triggers npm.cmd ci using the existing lockfile.
Generated target/dist outputs are replaced, not source. Real logs get new
stage4-*-*.log names under docs/verification; JUnit reports are in
backend/target/surefire-reports. Do not assert PASS until actual commands succeed.
The previous Flyway/MySQL compatibility warning remains a documented limitation.

Tests include independent BigDecimal examples, account CRUD/soft close, ownership,
Admin/Officer permissions, DTO mass assignment, filters/pagination/India dates,
missing CSRF/key, successful replay, payload mismatch, stored insufficient-funds
response, inactive/foreign accounts and active-application closure prevention.
Real separate-thread MySQL tests race two withdrawals, opposite-direction transfers,
identical keys and different payloads for one key. A Mockito repository fault on
the CREDIT write verifies rollback of the already-inserted debit, balances,
reservation and audit, followed by retry of the SAME key. Limiter HTTP 429 is tested.
These are real test sources, not claims of results before execution.

## IMPORTANT: test-schema financial history is preserved

Concurrent tests need committed fixtures visible to separate connections. They
create uniquely named synthetic users/accounts/opening credits in finnova_test,
then disable those users/freeze their fixture accounts after use. Original and
new financial rows are NEVER deleted, not even as test cleanup. API tests roll back
request changes, but their committed fixture funding/retirement history remains.
All fixture helpers assert schema=finnova_test and runtime user=finnova_app before
writing. No fixture writes go to finnova_demo. Fixture code is test-only, not
packaged or exposed as a deposit/funding API.

Therefore TOTAL test account/ledger counts and test-schema funds grow across test
runs, including the second test run during package. This is expected, not duplicate
movement of one key. The original seed accounts 1001..1004 still total 140000.00;
the old seed assertion is explicitly scoped to those IDs rather than incorrectly
requiring no new test history. Reconciliation still checks ALL account balances.
Do not delete records or reset schemas to restore old global test counts.

## Start commands - after tests/build pass

From root in a process-scoped RemoteSigned PowerShell window:

```powershell
. .\scripts\Use-FinNovaEnvironment.ps1
Set-Location -LiteralPath ".\backend"
.\mvnw.cmd -B -ntp spring-boot:run
```

Wait for BOTH Tomcat started on port 8080 AND Started FinNovaBankApplication.
An old server can still answer health while missing new routes. Never start a
second backend on a busy port. Identify the listener rather than killing every
Java process or changing ports silently. Frontend proxy still targets port 8080.
If frontend is stopped, from frontend in another window:

```powershell
npm.cmd run dev
```

Frontend screens are unchanged until Stage 7; current controls remain honest
Coming soon labels. The API and scripts, not nonexistent screens, demonstrate
Stage 4. Backend validation/business logic must never be moved into React.

## Live verification - explicit synthetic actions

In a separate process-scoped RemoteSigned window, from the root, after startup:

```powershell
.\scripts\Test-FinNovaAuthentication.ps1
.\scripts\Test-FinNovaBanking.ps1
.\scripts\Verify-FinNovaStage4.ps1
```

First verifies Stage 3 auth still works. Banking check defaults to Vite's proxy
http://127.0.0.1:5173 and supports -BaseUrl http://127.0.0.1:8080 as an alternative.
It asks RUN SIMULATED BANKING CHECK before any request and prompts for an EXISTING
synthetic CUSTOMER's chosen password (not MySQL root). It creates/renames/closes
one new zero-balance account, moves INR 1.00 between that user's two FNDEMO accounts,
repeats the same key, verifies balances changed ONCE and exactly two matching
ledger rows, then logs out. Cookies/passwords/CSRF/JWTs are never printed.

The original transfer key/request is saved BEFORE sending in a private ignored
.finnova-backups/transfer-smoke-*/request.json. It contains no password/JWT/CSRF.
On timeout/unknown outcome, stop and retain that metadata; do not rerun the whole
check with a new key. Ask for diagnosis and reuse the saved request/key if needed.
A successful fresh run intentionally adds one closed empty account and one
simulated transfer (two ledger rows); repeated separate fresh runs are separate
intentional demos. No ledger edits/deletions or automatic reversals clean it up.
PowerShell Decimal arithmetic in the checker only verifies output; all backend
financial rules/calculation are BigDecimal and transactionally enforced.

Verify is READ-ONLY, prints seed/account status totals, invalid reconciliation rows,
invalid transfer pairs, reservation states and action audit counts. It selects no
hashes, signing keys, credentials or auth tokens. Expected: V1-V5 valid; seed-account
aggregate unchanged at 140000.00 in both schemas; NO balance/ledger mismatch rows
and NO malformed transfer pairs. Demo adds the explicitly authorized transfer and
closed account; test totals include preserved fixtures. These are expectations,
not pre-recorded output. Preserve actual logs and paste summaries, never secrets.

## Troubleshooting and limitations

- Source preflight fails: stop; do not overwrite existing changes or rerun old setup.
- 404/new API missing: verify the current backend, not an old listener, is running.
- 401: valid logged-in Customer session required; never reset passwords blindly.
- 403: role/CSRF/origin failure; fetch CSRF after login; Admin cannot move money.
- 409 key mismatch: same key cannot identify a different request. An uncertain
  transport result must retry original payload/key, not invent a new operation.
- 409 inactive/close-blocked: expected business rule, not a reason to bypass checks.
- 422 insufficient funds: no money moved; same completed key replays that outcome.
- 429: honor Retry-After; do not disable rate limits to fake a successful demo.
- Test fails: share actual summary/error. Do not grant ALL, delete history, edit
  applied SQL, suppress integrity checks, use float/double, or invent passing results.

This is still a synthetic single-server lab, not production banking. Previous
cookie/CSRF/TLS/secret-storage/lockout/refresh-token limitations remain documented
in the retained Stage 3 notes. No external/inter-customer transfer, multi-currency,
real settlement, overdraft, fees, financial reversal UI, distributed rate limiter,
or bank integration exists. Concurrent account locks and unique idempotency rows
provide the demonstrated core guarantees, not a claim of universal deadlock freedom
or production security. Loans/EMI/repayment, actual officer/admin modules, charts,
frontend banking screens, full documentation and final submission remain for
later planned stages. No Stretch feature is introduced before the MVP is tested.

---
# Historical Stage 1-3 notes (superseded by Stage 4 above)

# FinNova Bank - Stage 3: backend authentication and security

Synthetic college project only. Stage 3 is NOT the full banking MVP.
All commands below use Windows PowerShell. Never paste prompts or output as commands.

## Implemented source in this stage

- Spring Security filter chain with method security; Customer, Loan Officer, Admin roles.
- Registration creates a Customer only, a customer profile and synthetic pending KYC.
  Account opening/balances are deliberately deferred to the account service stage.
- BCrypt cost 12, 12-character mixed-class policy, no whitespace/control characters,
  and a 72-UTF-8-byte cap to prevent BCrypt truncation.
- JWT HS256 via Spring Security JOSE, issuer/audience/expiry/signature validation,
  numeric subject, jti, issued-at and per-user token_version. No token is returned
  in JSON or accepted from localStorage, sessionStorage, or Authorization headers.
- Issuer https://finnova.invalid is only a reserved identifier; no network discovery
  or external banking connection is performed.
- JWT cookie FN_ACCESS: HttpOnly, SameSite=Lax, host-only, Path=/api, 15-minute default.
- Cookie CSRF protection for ALL unsafe requests, including registration/login.
  GET /api/auth/csrf returns the CSRF token and required headerName. FN_CSRF is also
  HttpOnly: browser code uses the JSON token in memory, not document.cookie.
- Login success clears the old CSRF cookie. Fetch /csrf again after login before
  any other mutation. Logout/password change clear both cookies.
- DB lookup on each authenticated request: deactivation and token revocation are
  honored immediately; roles come from the database, not a stale JWT role claim.
- Logout/password change revoke ALL outstanding sessions for that user. There is
  no refresh-token flow; log in again after expiry or password change.
- Own profile read/name update, password change, login/logout and audit service.
- Generic login failure, five failed attempts then 15-minute lockout (from the
  existing system_settings rows). Locked accounts invalidate previous tokens.
  Rejected credential checks RETURN from their transaction; the API's 401 is
  raised afterward, preserving counters/lockout/audit on real HTTP failures.
- Bounded, thread-safe in-memory login/registration rate limiter, per IP and route,
  HTTP 429 with Retry-After. No untrusted forwarding headers are used.
- Exact configured CORS origins; no wildcard with credentials. Security-filter
  errors and controller errors use the same timestamp/status/error/message/path/
  fieldErrors[] format. Field values, SQL, stack traces, passwords and JWTs are
  never included in JSON error bodies.
- Create/update DTOs are separate; unknown JSON fields are rejected. User role,
  ownership, enabled state, token version and balances cannot be mass-assigned.
- JPA mappings now cover users, customers, KYC, audit logs and settings. Controllers
  handle HTTP; services implement rules; repositories persist entities. API bodies
  are DTOs only. Audit rows are immutable and written in the business transaction.
- Default generated Spring Security user/password is explicitly excluded.

## Files and environment safety

The source upgrade checks file existence, authorizes replacement and backs up all
changed source files under .finnova-backups. It does NOT touch migrations V1-V5.
Never run either earlier scaffold generator or database Prepare again.

Stop the old backend with Ctrl+C in its window before upgrading. Frontend is
unchanged and can stay running. Authentication UI is scheduled for Stage 7;
the existing status page should continue working anonymously.

Review/download finnova-stage3.ps1 and run it with ProjectRoot set to the verified
project directory. It will ask for APPLY STAGE3. It generates the complete source,
configuration, tests, setup helpers and this guide. No secret is in that download.

For subsequent local helper scripts, open a process-scoped session:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned
```

This does not change permanent user/machine policy. Respect managed policy.
From the verified project root:

```powershell
Get-Location
.\scripts\Initialize-FinNovaSecurity.ps1
```

Answer INITIALIZE SECURITY only at its prompt. It creates a cryptographically
random 64-byte signing key and appends AUTH_ settings to the existing private .env.
It first creates a separate user/SYSTEM-only private environment backup. Existing
DB credentials and the original .env ACL are preserved. No secret is printed.
Never rerun it to rotate a key or paste .env; an existing AUTH_ setting causes a
safe stop. No actual .env file is supplied in source control.

Default AUTH_COOKIE_SECURE=false is ONLY for loopback HTTP development. Any HTTPS
non-lab deployment requires Secure cookies, certificate-validated DB connections,
HTTPS exact origins and a new security review. No production-security claim is made.

## Dependencies, migrations, test/build commands

After security initialization, run from the root:

```powershell
.\scripts\Run-FinNovaStage3.ps1
```

It loads the private environment, validates unchanged Flyway V1-V5 in BOTH schemas,
then invokes the Maven Wrapper with test and package and runs npm.cmd run build.
Maven installs declared dependencies; no global Maven/Flyway install is needed.
Frontend packages are unchanged. Only when node_modules is absent is npm.cmd ci
used. target/dist are regenerated outputs, not source. Actual output goes into
new stage3-*-*.log files under docs/verification, and JUnit XML remains under
backend/target/surefire-reports. No result is asserted until these commands run.

No new migration or DB grants are needed: the required columns were created and
permissions tested in Stage 2. Never edit an applied migration, run clean/repair,
reset users, or grant ALL PRIVILEGES to get a build past a failure.

Tests use ONLY finnova_test. Integration fixtures are transactional/rolled back.
The fixed public signing key in application-dbtest.yml is TEST ONLY and must never
be copied to normal configuration. Only the default application uses the locally
random private key. Do not expose a server started with test profiles.

Test source covers registration/duplicates/invalid input/age, mass-assignment,
BCrypt, real CSRF cookies and headers, HttpOnly JWT/no JSON token, generic failures,
lockout/audit, ownership, live DB roles, stale/expired/tampered tokens, CORS,
logout/password revocation, profile change, safe errors, and limiter concurrency/
HTTP 429. Probe admin/officer/error routes exist ONLY in test source, not the
packaged application. They verify security infrastructure, NOT completed admin or
officer business APIs. Existing seven schema checks remain in the test run.

## Provision demo identities AFTER tests/builds pass

Keep the backend stopped. From the root:

```powershell
.\scripts\Initialize-FinNovaDemoUsers.ps1
```

Answer PROVISION DEMO USERS at its prompt. Choose FOUR different strong synthetic
passwords for customer1@finnova.test, customer2@finnova.test, officer@finnova.test,
and admin@finnova.test. For this Windows setup, choose ASCII characters satisfying
upper/lower/digit/symbol and max 72 UTF-8 bytes. Input is hidden. These are NEW
bank-demo passwords, NOT your MySQL root or generated DB passwords.

They are passed to a non-web Java setup process in temporary environment variables,
never command arguments or files. The Java runner locks and validates all four
unprovisioned seeds, hashes passwords with BCrypt, enables the identities and
appends audit rows in ONE transaction, then the non-web context closes. The helper
clears the temporary password variables. Passwords are NOT reset if seeds have
already been provisioned. Do not repeat provisioning to change a password; use the
password-change API. Remember chosen passwords privately. Do not share them.

Provisioning touches finnova_demo ONLY; the fixed test seed identities stay
unprovisioned/disabled in finnova_test so schema tests remain repeatable.

## Start commands

In a process-scoped RemoteSigned PowerShell window, from the root:

```powershell
. .\scripts\Use-FinNovaEnvironment.ps1
Set-Location -LiteralPath ".\backend"
.\mvnw.cmd -B -ntp spring-boot:run
```

Load the environment in EVERY new backend/build window. Do not print Env:.
Leave the backend window running. If frontend is already running, do not start
another instance. Otherwise, from frontend in another window:

```powershell
npm.cmd run dev
```

Use 127.0.0.1 consistently for both servers; mixing localhost and 127.0.0.1 splits
host-only cookies. Both backend port 8080 and Vite's proxy target must match.

## Live HTTP and database verification

In a separate process-scoped RemoteSigned PowerShell window, from root:

```powershell
.\scripts\Test-FinNovaAuthentication.ps1
.\scripts\Test-FinNovaAuthentication.ps1 -BaseUrl "http://127.0.0.1:5173"
.\scripts\Verify-FinNovaStage3.ps1
```

Smoke checks prompt for a chosen synthetic bank-demo identity/password, keep cookies
and CSRF tokens in memory, verify health, anonymous 401, missing-CSRF 403, login 200,
own profile 200, logout 204 and subsequent profile 401. They do not print cookies,
tokens or passwords. Each check logs out and invalidates other sessions of that
identity. They do NOT transfer money. They count toward the login rate limit;
wait for Retry-After rather than disabling rate limiting if you repeat them rapidly.

The read-only DB check selects only synthetic identity names/roles/enabled flags
and a credential-provisioned BOOLEAN, never hashes, plus migration counts, audit
counts and unchanged account/ledger totals. Expected after provisioning:
- demo: four enabled/provisioned seed identities;
- test: four disabled/unprovisioned seed identities;
- both: five successful migrations, four accounts, INR 140000.00, four opening rows.
These are expected checks, not pre-recorded passing results.

## API reference for later frontend integration

GET /api/health - public liveness, not a DB readiness monitor.
GET /api/auth/csrf - public token/header JSON, no-store; retain the CSRF cookie.
POST /api/auth/register - email/fullName/password/dateOfBirth/declaredMonthlyIncome;
  CSRF required; 201 profile DTO; CUSTOMER only; does not auto-login.
POST /api/auth/login - email/password; CSRF required; 200 profile DTO + JWT cookie.
GET /api/profile - authenticated own profile.
PATCH /api/profile - fullName only; authenticated, owned, CSRF required.
POST /api/auth/password - currentPassword/newPassword; CSRF; 204, clears/revokes.
POST /api/auth/logout - CSRF; 204, clears/revokes all sessions; no state-changing GET.

Use ISO yyyy-MM-dd in JSON date input and ISO UTC timestamps in APIs. Display
DD-MM-YYYY / Asia/Kolkata in React. Monetary input is BigDecimal with at most two
decimal places. Never send role, balance, customerId or status in registration.

## Security trade-off and remaining limitations

HttpOnly reduces direct JWT theft by injected JavaScript. It does NOT make XSS
harmless: same-origin malicious script can still issue requests. Cookies attach
automatically, so SameSite=Lax is supplemented by real cookie/header CSRF checks,
including login/logout, exact CORS origins and host-only cookies. The CSRF JSON
endpoint is intentionally readable only to allowed origins. Plain CSRF token
handling is used; response compression is not enabled. No cookie or token belongs
in localStorage/sessionStorage. Local HTTP requires Secure=false; HTTPS is needed
outside the lab. A host-only double-submit CSRF cookie is not a full production
subdomain-defense design; production needs additional cookie/isolation review.

JWTs contain no email/password/role; the DB role and active state are checked on
every private request. This is sessionless HTTP, not a zero-database-lookup design.
There is no refresh token, MFA, email verification/reset flow, distributed limiter,
central secret vault or production monitoring. In-memory rate limits reset on
restart and all users of Vite's loopback proxy share a bucket. Account lockout can
be abused for denial of service; generic errors reduce but cannot prove elimination
of all timing/enumeration channels. Signup duplicate-email feedback is intentionally
409 for this college project, not an anti-enumeration guarantee.

Local .env is plaintext with ACLs; local administrators can still take ownership.
Environment/Java string copies cannot be guaranteed erased. Never publish secrets,
private backups, tokens, full raw request/response dumps or Maven -X output.
TLS sslMode=REQUIRED encrypts MySQL traffic but does not verify server identity;
keep the recorded Flyway 8.4 compatibility warning as a known limitation until a
separately tested library upgrade. Do not suppress it or downgrade MySQL blindly.

Financial services, transfers, EMI, repayments, KYC decisions, actual admin/officer
APIs, audit-search UI, charts, Swagger, report finalization and frontend auth forms
are still pending their planned stages. Do not claim them as complete. No Stretch
work or real banking integration is introduced. Only describe technologies and
features actually demonstrated in the final college report.

---
# Historical Stage 1/2 notes (superseded by Stage 3 above)

# FinNova Bank - Stage 2 database foundation

Synthetic college lab only. This section supersedes the historical Stage 1 setup
notes retained below. No real banking systems, money, or identity documents.

## Implemented in this stage

- MySQL 8 / InnoDB schemas: finnova_demo and a separate finnova_test.
- Five immutable, versioned Flyway migrations and all 14 required MVP tables.
- Primary/foreign keys, unique constraints, CHECK constraints, query indexes,
  DECIMAL money, UTC DATETIME(6) timestamps, version fields for later locking.
  JDBC uses the encoded numeric UTC offset +00:00, avoiding a dependency on
  installed MySQL named-timezone tables on Windows.
- Opening-credit ledger fixtures reconcile to the four synthetic account balances.
- Restricted runtime account; a separate schema-scoped migration account.
- Seven database integration tests plus the existing liveness test.
- JPA is configured with ddl-auto=validate and open-in-view=false. Entity/repository
  mappings are introduced with their application modules; none are falsely claimed
  as implemented here. Stage 2 SQL tests use Spring's JdbcTemplate from the JPA stack.

## Setup order - Windows PowerShell

Do not copy console prompts or output into PowerShell. Only run command blocks.
Stop the old backend with Ctrl+C in its own window before upgrading its config.
The frontend is unchanged; an already running frontend need not be restarted.

For generated local .ps1/.psm1 files, use a PowerShell process with RemoteSigned:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned
```

This affects this new process only, not permanent machine/user execution policy.
If managed policy prevents it, stop and share the policy error; do not bypass it.
The upgrade generator checks the Stage 1 POM/config before replacement. It backs up
all five changed files under .finnova-backups, which is ignored by Git. It preserves
any original README text in a historical section. Do not rerun either generator.

From the project root, create NEW databases and accounts:

```powershell
.\scripts\Initialize-FinNovaDatabase.ps1 -Mode Prepare
. .\scripts\Use-FinNovaEnvironment.ps1
```

Prepare checks that neither target schema nor either named MySQL account exists.
It does not drop, overwrite, or reset an existing database/user. There are two root
password prompts: one for read-only preflight, one for creation. Root's password
is never stored or passed as a command-line argument. MySQL generates the app and
migration passwords; they are captured privately in the ignored .env file, with
Windows permissions limited to the current user and SYSTEM. Do not display .env.
DDL/user setup cannot be rolled back atomically. On any partial failure, stop and
report the error rather than rerunning or deleting objects. Partial credentials,
if returned, are retained privately for recovery with a failed-bootstrap marker.

.env uses KEY=VALUE entries, with JSON-quoted strings for generated passwords.
The loader decodes them without evaluating PowerShell. It exports only whitelisted
process-local variables and refuses remote/non-demo database targets. Neither
Spring Boot nor Vite automatically loads this root .env. Never put a password or
JWT in a VITE_ variable or share a complete environment listing.

From the project root, migrate BOTH schemas before adding runtime write grants:

```powershell
.\scripts\Run-FinNovaStage2.ps1 -Mode Migrate
```

The helper loads the private environment, sets FLYWAY_URL to each allowed local
schema, invokes the Maven Wrapper's flyway:migrate and flyway:validate goals, then
repeats migrate to check that seeds are not reapplied. It restores the demo URL
and records real output under docs/verification. No password belongs in Maven
arguments, a POM, a log, or Git. Never use Maven -X with credentials loaded.

Flyway plugin/core/MySQL support use Spring Boot's managed versions. The MySQL
JDBC driver version can be newer than 8; it is a client driver, not a replacement
or upgrade of your MySQL 8.4 server. No global Maven, Flyway CLI, or Docker is needed.

Once both schemas have all migrations, from the root:

```powershell
.\scripts\Initialize-FinNovaDatabase.ps1 -Mode Grant
.\scripts\Initialize-FinNovaDatabase.ps1 -Mode Verify
```

Grant has two root password prompts, preflight then grants. The runtime user gets
SELECT schema-wide; INSERT and UPDATE only where needed; no DDL. Transactions,
payments, history, and audit rows are INSERT/SELECT only. Installments cannot be
deleted and only their status/paid timestamp/version/update timestamp can change.
Original loan terms cannot be updated by the runtime user; servicing state can.
The migration account is privileged within the two synthetic schemas, never global.

Verify is read-only. For its MySQL client connection it creates a new private
user/SYSTEM-only temporary option file, then deletes ONLY that newly created
file/directory. This avoids putting passwords in process arguments. It never
removes project files, databases, tables, or financial records.

## Build, tests, start

After Grant, from the project root:

```powershell
.\scripts\Run-FinNovaStage2.ps1 -Mode Build
```

This loads the environment, records actual mvnw.cmd test and package output, and
builds the unchanged frontend. Only if node_modules is absent does it run npm.cmd
ci using the existing lockfile. Maven downloads the declared dependencies; no
global install is needed. Builds replace generated target/dist outputs, not source.

Load the environment in EVERY new backend PowerShell window. From the root:

```powershell
. .\scripts\Use-FinNovaEnvironment.ps1
Set-Location -LiteralPath ".\backend"
.\mvnw.cmd spring-boot:run
```

DatabaseMigrationTest always selects finnova_test, checks the schema/account
before writing fixtures, and rolls back test fixture changes. Flyway migration
history/reference/demo fixtures persist in the test schema by design. Do not run
parallel test JVMs against this one demo test schema. The production-like domain
and concurrent transfer/repayment tests remain for their later stages.
Mockito is now supplied as a Surefire startup agent, addressing the actual Java 21
self-attachment warning previously observed. An unrelated JVM class-sharing notice
may remain; use exit codes and real test summaries rather than treating stderr as
proof of a failed test. Raw logs are ignored by Git; preserve them locally.

Frontend is unchanged. From frontend:

```powershell
npm.cmd run build
npm.cmd run dev
```

Keep backend/frontend windows open. Health stays /api/health with scope
APPLICATION_ONLY. A successful startup does imply startup migrations/connection
succeeded, but this endpoint is NOT a database-readiness monitor. Verify SQL and
database test output separately. There are still no banking or auth endpoints.

## Migration map and integrity decisions

1. V1: users, customers, accounts, loan_products, system_settings.
2. V2: loan_applications, loan_application_history, kyc_records, audit_logs,
   idempotency_keys.
3. V3: loans, installments, transactions, payments.
4. V4: three loan products and reference/demo settings.
5. V5: dedicated synthetic demo seed data, applied once per schema.

Never edit an applied migration. Never run clean, repair, baseline, or DROP to
work around an error. clean-disabled=true and baseline-on-migrate=false are set.
MySQL DDL is not fully transactional: on a migration failure retain the actual
error and schema state, then diagnose before taking any corrective action.

All money columns are DECIMAL(15,2); Java monetary logic must use BigDecimal.
Rates/multipliers are DECIMAL, never float/double. Each account gets an opening
credit, not a balance with no ledger explanation. A transfer later creates paired
credit/debit ledger entries sharing a reference and idempotency reservation.
Transfer services must lock the lower account ID first in one transaction; a
schema alone does NOT implement locking or a transfer endpoint.

Idempotency keys are unique per (user, operation, key), case-sensitive, and keep a
request fingerprint and original response. The financial service must reserve,
move money, and complete the reservation atomically. Reusing a key with a different
fingerprint must return 409; the schema does not itself implement HTTP replay.

Composite foreign keys enforce application/loan disbursement account ownership
and payment-to-installment loan consistency. Backend ownership/role checks,
self-decision prevention, policy limits, transition orchestration, BigDecimal EMI
rounding and repayment transactions still belong to the later services.

Initial DRAFT creation is not a status transition, so it has no status-history row.
Its creation/deletion is auditable through the independent audit resource ID.
Once an application has transition history, restrictive foreign keys preserve it.
Only draft deletion will be exposed by the service, never arbitrary application
DELETE. Users/accounts/products are deactivated or closed, not hard-deleted.

Transactions, payments, application history, and audit logs are immutable to the
runtime user. Corrections require appended linked reversal/adjustment transactions,
never editing original ledger rows. Installment financial columns stay immutable;
its payment/overdue status and loan outstanding principal are mutable derived
servicing state. Future JPA mappings must mark immutable loan terms, installment
financial/due fields, and idempotency fingerprints with updatable=false so generated
updates do not conflict with column-level grants. Installments are never deleted. MVP repayment is a full scheduled
installment, once per installment; partial payments/prepayment are not implemented.

## Seed inventory - expected after first migration, not a claimed test result

- 4 disabled demo users: customer1@finnova.test, customer2@finnova.test,
  officer@finnova.test, admin@finnova.test. These are reserved .test addresses.
- 2 customer profiles; 4 FNDEMO-prefixed accounts; 4 opening ledger rows.
- Total synthetic balance: INR 140000.00, derived from the inserted ledger fixtures.
- 3 products; 3 applications (DRAFT, SUBMITTED, UNDER_REVIEW); 3 transition rows.
- 2 synthetic KYC records (one verified, one pending); no real PAN/Aadhaar/files.
- 0 disbursed loans, installments, or payments. They must be created only through
  later validated approval/disbursement/schedule services, not fabricated now.

Seed identities have NULL password hashes and enabled=false, NOT a default/shared
password. A CHECK prevents enabling an identity without a BCrypt-shaped hash.
Stage 3 will provision actual BCrypt credentials before activation. Hash-format
checks alone are not authentication or password-policy enforcement.

## Remaining limitations

Stage 2 has schema integrity and restricted database privileges, not a finished
secure bank. No JWT/cookies, CSRF, API role enforcement, customer banking actions,
loan decisions, EMI engine, rate limiting, or business dashboards exist yet.
Database grants do not replace backend authorization. Privileged root/migration
accounts can change data; do not share those credentials. For this local lab,
Flyway's migration credentials are available during backend startup; a production
pipeline would isolate migration credentials from the running web application.

Local MySQL accounts require TLS; sslMode=REQUIRED encrypts traffic but does not
verify server identity. Only loopback is allowed by the setup. Remote deployments
would require certificate validation (VERIFY_IDENTITY), operational security and
further controls; never claim this configuration is production-secure.
.env is plaintext protected by local Windows ACLs, not a secrets vault. A local
administrator can take ownership; process environment credentials also have local
exposure limitations. Never publish .env, local backups, raw personal paths, or
logs containing secrets. Keep the app bound to 127.0.0.1 until security is built.
Only technologies actually implemented should be included in the college report.

---
# Historical Stage 1 notes (superseded by Stage 2 above)

# FinNova Bank - Stage 1 scaffold

A college banking and loan-management project using synthetic data only.
No real banking integration is permitted.

## Current scope

This stage contains a Spring Boot application-liveness endpoint, a MockMvc test,
and a React frontend that calls the endpoint through Vite's development proxy.
It is NOT the completed banking application.

- Backend: Java 21, Spring Boot 3.5.16, Maven Wrapper.
- Frontend: React 18.3.1, Vite 7, React Router 6, Axios, Bootstrap 5, custom CSS.
- Database: a local MySQL 8 server is required for the next stage.
- Display timezone: Asia/Kolkata. API timestamps use ISO 8601 UTC instants.
- Display date format: DD-MM-YYYY. The banking locale will be INR.

The backend does not yet connect to MySQL. There are no business tables,
financial endpoints, seed accounts, authentication, or authorization at this stage.
JPA, Flyway, MySQL Connector/J, security, JWT, OpenAPI, and charts will be added
when their stages implement and verify them. No H2 substitute is used.

## Structure

- backend: Java source, test, configuration, POM, Windows Maven Wrapper.
- frontend: React source and Vite configuration.
- docs/verification: instructions and local logs from commands actually run.

## Windows PowerShell setup

Use Get-Location to verify your directory. Use quoted paths with spaces.
Java 21 must be available through JAVA_HOME. A global Maven install is not needed.

Install the frontend dependencies from the frontend directory:

```powershell
npm.cmd install
```

This generates package-lock.json. Keep the lockfile for reproducible installs;
use npm.cmd ci on subsequent clean installations with an existing lockfile.
Do not use npm audit fix --force without diagnosing the actual findings.

From the backend directory, verify the wrapper and run the tests/build:

```powershell
.\mvnw.cmd --version
.\mvnw.cmd -B -ntp test
.\mvnw.cmd -B -ntp package
```

The first wrapper call downloads the pinned Maven distribution from Maven Central
into the user's Maven cache. Dependency downloads also require internet access.
The Maven Wrapper is Apache Maven Wrapper 3.3.4, Windows only at this stage.
Source: https://github.com/apache/maven-wrapper/tree/maven-wrapper-3.3.4
Its Apache-2.0 header is preserved in mvnw.cmd.

From the frontend directory:

```powershell
npm.cmd run build
```

A successful frontend build is not a browser or end-to-end test.
Record actual command outputs; do not claim tests passed before running them.
The Stage 1 backend test checks application liveness only, not any banking rule.

## Start in two PowerShell windows

Backend window, from backend:

```powershell
$env:SERVER_ADDRESS = "127.0.0.1"
$env:SERVER_PORT = "8080"
.\mvnw.cmd spring-boot:run
```

Frontend window, from frontend:

```powershell
npm.cmd run dev
```

Keep both windows open. Stop a server with Ctrl+C in its own window.
Open http://127.0.0.1:5173 in a browser, then choose System status.
The frontend must contact /api/health using a relative URL.
Vite proxies /api to the backend at 127.0.0.1:8080.
The backend port and Vite proxy target must match.

## Verify while both servers are running

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/health"
Invoke-RestMethod -Uri "http://127.0.0.1:5173/api/health"
```

The two responses should each report UP and APPLICATION_ONLY.
They are separate requests, so their timestamps can differ.
APPLICATION_ONLY explicitly means the database has not been checked by this endpoint.

## Environment and database policy

.env.example is documentation, not an automatic environment loader.
No .env file or secret is required in Stage 1. Never commit credentials.
Do not put passwords or tokens in any VITE_ variable: those become browser-visible.
Database schemas, a restricted application database user, Flyway migrations,
and synthetic seed data are intentionally deferred to Stage 2.
Do not create business tables manually or use the root user in backend code.

## Troubleshooting

- Wrapper fails: include the actual error and JAVA_HOME; do not install global Maven.
- Downloads fail: check network/proxy access; never disable TLS verification.
- Port occupied: identify the owner; do not kill an unknown process.
- Frontend API fails: verify the backend directly, then the Vite-proxied endpoint.
- Do not change ports silently: the frontend proxy must target the backend port.
- npm.ps1 policy error: use npm.cmd, as documented here.
- Missing source or syntax errors: stop and share the exact error. Do not rerun
  the scaffold generator over existing work.

## Remaining limitations

Only local application-liveness scaffolding is implemented. Database persistence,
JWT-cookie authentication, CSRF controls, role/ownership enforcement, banking
workflows, audit logging, dashboards, and domain/database tests are not yet present.
The development servers bind to loopback; do not expose this scaffold publicly.
This project must never be described as production-secure.
Stretch work is deferred until the full MVP has been implemented and tested.





