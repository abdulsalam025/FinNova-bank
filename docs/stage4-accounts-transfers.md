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
