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
