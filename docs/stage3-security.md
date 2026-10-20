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
