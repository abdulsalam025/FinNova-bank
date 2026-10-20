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
