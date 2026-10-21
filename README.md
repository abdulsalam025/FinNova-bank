<div align="center">

<img src="docs/images/banner.svg" alt="FinNova Bank — secure digital banking, loan origination and staff oversight" width="100%"/>

<br/>

![Java](https://img.shields.io/badge/Java-21-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.5-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Flyway](https://img.shields.io/badge/Flyway-V1%E2%80%93V6-CC0200?style=for-the-badge&logo=flyway&logoColor=white)
![Tests](https://img.shields.io/badge/backend_tests-107_passing-2EA44F?style=for-the-badge&logo=junit5&logoColor=white)

**A full-stack banking & loan-management web app — built as a college lab project with 100% synthetic data.**

[✨ Features](#features) ·
[📸 Screens](#screens) ·
[🏗️ Architecture](#architecture) ·
[🔄 How it works](#how-it-works) ·
[🗄️ Data model](#data-model) ·
[🔐 Security](#security) ·
[🚀 Run it](#getting-started) ·
[🧪 Tests](#tests)

</div>

> [!IMPORTANT]
> **Synthetic demo only.** FinNova Bank moves *pretend* money between *pretend* accounts. There is no connection to UPI, NEFT, card networks or any real bank, and no real personal data or identity documents are stored.

---

<a id="features"></a>

## ✨ What it does

Three roles, three workspaces — every rule is enforced **on the server**, not just hidden in the menu.

<table>
<tr>
<td width="33%" valign="top">

### 🙋 Customer
- Register and sign in
- Dashboard: balances, recent activity, loans, KYC status
- Open, rename and close accounts
- **Transfer money** with masked recipient lookup and a downloadable **PNG receipt**
- Searchable, filterable transaction history
- Compare loan products, get a live **EMI quote**
- Apply for a loan (draft → submit → resubmit)
- Repay instalments safely (no double payment)

</td>
<td width="33%" valign="top">

### 🧑‍💼 Loan Officer
- **Officer Center** with a role-specific sidebar
- KYC review queue — verify or reject with a reason
- Review loan applications, request more info
- **Verify & forward** applications to the Admin
- Own decision history and own audit trail
- Loan-portfolio view — *no access to customer balances*

</td>
<td width="33%" valign="top">

### 🛡️ Admin
- **Admin Center** workspace
- **Final approval & pay-out** of forwarded loans
- Users: search, activate / deactivate, roles, approval limits, add officers
- Loan products: create, edit, soft-deactivate
- Monitor every officer's activity
- Audit-log search, dashboards and reports
- Idempotent account credit, overdue scan, demo date

</td>
</tr>
</table>

---

<a id="screens"></a>

## 📸 Screens

> [!NOTE]
> UI previews rendered with synthetic sample data.

<table>
<tr>
<td colspan="2" align="center">
<img src="docs/images/home-hero.png" alt="Home page hero with live EMI calculator" width="100%"/><br/>
<sub><b>Public home page</b> — live backend status pill and an EMI calculator that asks the real quote API</sub>
</td>
</tr>
<tr>
<td width="50%" align="center">
<img src="docs/images/signin-customer.png" alt="Customer sign-in" width="100%"/><br/>
<sub><b>Sign-in (customer)</b> — two-panel layout, Caps Lock warning</sub>
</td>
<td width="50%" align="center">
<img src="docs/images/signin-staff.png" alt="Staff sign-in" width="100%"/><br/>
<sub><b>Sign-in (staff)</b> — opened from <code>/login?next=admin</code></sub>
</td>
</tr>
<tr>
<td width="50%" align="center">
<img src="docs/images/home-products.png" alt="Loan products from the API" width="100%"/><br/>
<sub><b>Loan products</b> — loaded from <code>GET /api/loan-products</code></sub>
</td>
<td width="50%" align="center">
<img src="docs/images/mobile.png" alt="Phone layout" width="70%"/><br/>
<sub><b>Responsive</b> — single-column layout on phones</sub>
</td>
</tr>
</table>

<details>
<summary><b>More screens</b></summary>
<br/>
<img src="docs/images/home-journey.png" alt="Features grid and four-step loan journey" width="100%"/>
<p align="center"><sub>Features grid and the four-step loan journey</sub></p>
<img src="docs/images/home-security.png" alt="Security band" width="100%"/>
<p align="center"><sub>Security band — each statement is backed by code (HttpOnly cookies, CSRF, idempotency keys, immutable records)</sub></p>
</details>

---

<a id="architecture"></a>

## 🏗️ Architecture

```mermaid
flowchart LR
    subgraph Browser["🖥️  Browser"]
        UI["<b>React 18 SPA</b><br/>Vite 7 · React Router · Axios<br/>Bootstrap 5 · lucide-react · framer-motion"]
    end

    subgraph API["☕  Spring Boot 3.5 · Java 21"]
        direction TB
        F["<b>Security filter chain</b><br/>JWT cookie · CSRF · rate limits"]
        C["<b>REST controllers</b><br/>DTOs in / DTOs out"]
        S["<b>Services</b><br/>@PreAuthorize · @Transactional<br/>BigDecimal money"]
        R["<b>Spring Data JPA</b><br/>repositories"]
        F --> C --> S --> R
    end

    subgraph DB["🐬  MySQL 8.4"]
        T[("<b>14 InnoDB tables</b><br/>FK + CHECK constraints")]
        M["Flyway<br/>V1 → V6"]
    end

    UI -- "/api/* through the Vite proxy<br/>HttpOnly cookie + CSRF header" --> F
    R --> T
    M -. "migrates" .-> T

    classDef fe fill:#EFEAFF,stroke:#8E79F6,color:#171622
    classDef be fill:#F3FFD6,stroke:#7FA313,color:#171622
    classDef db fill:#E6F0FA,stroke:#4479A1,color:#171622
    class UI fe
    class F,C,S,R be
    class T,M db
```

| Layer | Responsibility |
|---|---|
| **Frontend** | Pages, forms, role-aware navigation. Calls the API with *relative* URLs; no tokens in `localStorage`. |
| **Filters** | Read the `FN_ACCESS` HttpOnly JWT cookie, enforce CSRF on every state-changing request, rate-limit financial endpoints. |
| **Controllers** | HTTP only — validate DTOs, never expose entities. |
| **Services** | Business rules, ownership checks, `@PreAuthorize` role checks, transactions, locking. |
| **Database** | Last line of defence: foreign keys, `CHECK` constraints (e.g. balance ≥ 0, rejection needs a reason), restricted runtime grants. |

---

<a id="how-it-works"></a>

## 🔄 How it works

### 1 · Signing in

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant W as React app
    participant A as Spring Boot API
    participant D as MySQL

    U->>W: Open /login
    W->>A: GET /api/auth/csrf
    A-->>W: CSRF token (kept in memory) + CSRF cookie
    U->>W: Email + password
    W->>A: POST /api/auth/login  (CSRF header)
    A->>D: Find user · verify BCrypt hash · check lockout
    alt credentials valid
        A-->>W: 200 profile + FN_ACCESS cookie (HttpOnly JWT)
        W->>A: GET /api/auth/csrf  (fresh token after login)
        W-->>U: Signed in — pages guarded by role
    else credentials invalid
        A->>D: Count the failed attempt (5 in a row → 15-minute lockout)
        A-->>W: 401 with a generic message
    end
    Note over W,A: On every later request the cookie travels automatically and the server<br/>re-checks the user's enabled flag, role and token_version in the database.
```

> Logout or a password change bumps `token_version`, so **every** old token stops working immediately.

### 2 · Sending money

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant W as Transfer page
    participant A as Transfer service
    participant D as MySQL — one transaction

    C->>W: From-account · recipient account no. · amount
    W->>A: GET /api/transfer-recipients
    A-->>W: Masked recipient
    C->>W: Confirm
    W->>A: POST /api/transfers  + CSRF header + Idempotency-Key
    A->>D: Reserve the key (unique per user + operation + key)
    alt key already completed
        D-->>A: Stored original response
        A-->>W: Same status + body · Idempotency-Replayed: true
    else new request
        A->>D: Lock both accounts — lower id first (SELECT … FOR UPDATE)
        A->>D: Check ACTIVE · INR · enough funds
        A->>D: Debit + credit balances
        A->>D: Insert 2 immutable ledger rows (shared reference)
        A->>D: Append audit row · save the response on the key
        D-->>A: COMMIT ✅
        A-->>W: 201 transfer details
    end
    W-->>C: Success screen + PNG receipt (no balance printed)
```

Double-click, flaky network, retry — the same key can **never** move money twice, and any failure rolls back *everything* (balances, ledger, audit, key).

### 3 · The loan lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT : customer creates
    DRAFT --> [*] : draft deleted
    DRAFT --> InReview : submit

    state "In review" as InReview {
        direction LR
        SUBMITTED --> UNDER_REVIEW : officer picks up
    }

    InReview --> ADDITIONAL_INFO_REQUIRED : request info (reason)
    ADDITIONAL_INFO_REQUIRED --> InReview : customer resubmits
    InReview --> REJECTED : reject (reason required)
    InReview --> APPROVED : officer verifies & forwards
    APPROVED --> REJECTED : admin rejects (reason)
    APPROVED --> DISBURSED : admin approves & pays out
    DISBURSED --> REPAYMENT : system · same transaction
    REPAYMENT --> CLOSED : last instalment paid
    REJECTED --> [*]
    CLOSED --> [*]
```

Every arrow writes a **history row** (who, when, why) and an **audit row**. Invalid jumps are refused with `409`, wrong roles with `403`.

### 4 · Who does what in the loan chain

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    actor O as Loan Officer
    actor A as Admin
    participant S as System

    C->>S: Compare products · EMI quote
    C->>S: Create draft → submit
    O->>S: Review application
    opt something is missing
        O->>C: Request additional info (reason)
        C->>S: Resubmit
    end
    O->>S: Verify KYC (separate queue)
    O->>A: Verify & forward (within the officer's approval limit)
    A->>S: Final check — EMI, KYC status, affordability, product limits
    alt approve
        A->>S: Approve & pay out (reason)
        S->>C: Credit account · create loan + EMI schedule · ledger entry
    else reject
        A->>S: Reject (reason required)
    end
    loop every month
        C->>S: Pay the next instalment (Idempotency-Key)
    end
    S-->>C: Last instalment paid → loan CLOSED
    Note over S: A scheduled scan marks unpaid past-due instalments OVERDUE.
```

### 5 · The EMI math

Reducing-balance EMI, computed with `BigDecimal` (no floating-point money):

$$
EMI = \frac{P \cdot r \cdot (1 + r)^n}{(1 + r)^n - 1}
\qquad r = \frac{\text{annual rate}}{12 \times 100}
$$

| Example | Result |
|---|---|
| ₹1,00,000 at 12 % for 12 months | **EMI ₹8,884.88** — first month: interest ₹1,000.00, principal ₹7,884.88 |
| ₹1,000 at 0 % for 3 months | ₹333.33, ₹333.33, **₹333.34** (the last instalment absorbs rounding) |

---

<a id="data-model"></a>

## 🗄️ Data model

14 tables, created by Flyway migrations **V1 → V6**. All money is `DECIMAL(15,2)`; timestamps are UTC.

```mermaid
erDiagram
    USERS ||--o| CUSTOMERS : "has profile"
    CUSTOMERS ||--o{ ACCOUNTS : owns
    CUSTOMERS ||--o{ KYC_RECORDS : "KYC"
    CUSTOMERS ||--o{ LOAN_APPLICATIONS : "applies for"
    LOAN_PRODUCTS ||--o{ LOAN_APPLICATIONS : "is used by"
    LOAN_APPLICATIONS ||--o{ LOAN_APPLICATION_HISTORY : "status trail"
    LOAN_APPLICATIONS ||--o| LOANS : "becomes"
    LOANS ||--|{ INSTALLMENTS : "EMI schedule"
    INSTALLMENTS ||--o| PAYMENTS : "paid by"
    ACCOUNTS ||--o{ TRANSACTIONS : "ledger"
    USERS ||--o{ AUDIT_LOGS : "acts in"
    USERS ||--o{ IDEMPOTENCY_KEYS : "reserves"
```

<sub>Plus <code>system_settings</code> (lockout rules and other reference settings).</sub>

| Rule in the database | Why it matters |
|---|---|
| `ck_accounts_balance` — balance ≥ 0 | No overdrafts, ever |
| `ck_applications_rejection_reason` | A rejection without a reason cannot be saved |
| `ck_users_approval_limit` | Staff must have a positive approval limit; customers have none |
| Unique `(user, operation, key)` on idempotency keys | The same request cannot run twice |
| Ledger, payments, history and audit are insert-only | Money history is never edited or deleted — corrections are new rows |

---

<a id="security"></a>

## 🔐 Security & data integrity

| Threat | Defence |
|---|---|
| Token theft by JavaScript | JWT lives in an **HttpOnly** `FN_ACCESS` cookie — never in `localStorage` |
| Cross-site request forgery | Cookie + header **CSRF** check on every POST / PUT / PATCH / DELETE, including login |
| Weak or guessed passwords | **BCrypt** (cost 12), strong password policy, lockout after 5 failed attempts |
| Stale sessions | `token_version`, enabled flag and role re-checked in the DB on each request |
| Privilege escalation | `@PreAuthorize` on services + ownership checks; DTOs reject role / balance / owner fields |
| Double payments | **Idempotency-Key** on transfers, repayments and admin credit |
| Race conditions | Row locks in a fixed order + DB constraints, proven by parallel MySQL tests |
| Partial failures | One transaction per money movement — tested by injected faults |
| Abuse | Rate limits on financial endpoints (HTTP 429 with Retry-After) |
| Secret leaks | `.env` and keys are git-ignored; test secrets come from environment variables |

### Roles & permissions

| Capability | 🙋 Customer | 🧑‍💼 Officer | 🛡️ Admin |
|---|:---:|:---:|:---:|
| Own accounts, transfers, receipts | ✅ | — | 👁️ view all |
| Apply for and repay loans | ✅ | — | — |
| Review loans, request info, verify & forward | — | ✅ | ✅ |
| Final approval & pay-out | — | — | ✅ |
| KYC decisions | — | ✅ | 👁️ view only |
| Users, roles, approval limits | — | — | ✅ |
| Loan-product management | — | — | ✅ |
| Audit-log search | — | own actions | everything |
| Dashboards & reports | own data | loan portfolio | whole bank |

---

## 🧰 Tech stack

| | Technology |
|---|---|
| **Backend** | Java 21 · Spring Boot 3.5 · Spring Security · Spring Data JPA (Hibernate 6.6) · Bean Validation · Maven Wrapper |
| **Database** | MySQL 8.4 (InnoDB) · Flyway migrations V1–V6 |
| **Frontend** | React 18.3 · Vite 7 · React Router 6 · Axios · Bootstrap 5 · lucide-react · framer-motion |
| **Testing** | JUnit 5 · Spring Boot Test · MockMvc · Mockito · real MySQL test schema |
| **Tooling** | Git & GitHub · Windows PowerShell setup scripts |

---

<a id="getting-started"></a>

## 🚀 Getting started

**You need:** JDK 21 · Node.js with npm · MySQL 8 · Git · Windows PowerShell

<details>
<summary><b>① First-time setup</b> (database, secrets, demo users)</summary>

<br/>

Run from the project root in a PowerShell window started with
`powershell.exe -NoProfile -ExecutionPolicy RemoteSigned`:

```powershell
git clone https://github.com/abdulsalam025/FinNova-bank.git
cd FinNova-bank

# 1. Create the finnova_demo and finnova_test schemas + restricted MySQL users (asks for the MySQL root password)
.\scripts\Initialize-FinNovaDatabase.ps1 -Mode Prepare
. .\scripts\Use-FinNovaEnvironment.ps1

# 2. Apply the Flyway migrations to both schemas, then grant runtime permissions
.\scripts\Run-FinNovaStage2.ps1 -Mode Migrate
.\scripts\Initialize-FinNovaDatabase.ps1 -Mode Grant

# 3. Generate a random JWT signing key into the private .env
.\scripts\Initialize-FinNovaSecurity.ps1

# 4. Choose passwords for the four synthetic demo users (customer1, customer2, officer, admin)
.\scripts\Initialize-FinNovaDemoUsers.ps1
```

The tests need their own JWT secret in an environment variable (set it once):

```powershell
$b = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Environment]::SetEnvironmentVariable("FINNOVA_DBTEST_APP_SECURITY_JWT_SECRET", [Convert]::ToBase64String($b), "User")
```

Open a new PowerShell window afterwards so the variable is picked up. The full stage-by-stage notes are in [`docs/STAGE_NOTES.md`](docs/STAGE_NOTES.md).

</details>

**② Start the backend** (port 8080)

```powershell
. .\scripts\Use-FinNovaEnvironment.ps1
cd backend
.\mvnw.cmd spring-boot:run
```

**③ Start the frontend** (new window)

```powershell
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:5173** — Vite proxies `/api` to the backend. Health check: `GET /api/health` reports status `UP`.

> [!TIP]
> Use `127.0.0.1` for both servers. Mixing `localhost` and `127.0.0.1` splits the host-only cookies.

---

<a id="tests"></a>

## 🧪 Tests

```powershell
cd backend
.\mvnw.cmd test        # backend: JUnit 5 against the finnova_test schema
cd ..\frontend
npm run build          # frontend production build
```

<div align="center">

| Run (21 Oct 2026) | Tests | ✅ Passed | ❌ Failures | 💥 Errors | ⏭️ Skipped |
|---|:---:|:---:|:---:|:---:|:---:|
| Backend — full suite | **107** | **107** | 0 | 0 | 0 |
| Frontend — `npm run build` | — | ✅ built | — | — | — |

</div>

| Test suite | What it proves |
|---|---|
| `DatabaseMigrationTest` | Schema, constraints, grants and seed data reconcile |
| `AuthSecurityTest` · `CsrfContinuityTest` | Registration, BCrypt, HttpOnly cookie, CSRF, lockout, token revocation |
| `RateLimitHttpTest` · `TransferRateLimitHttpTest` | Limits answer HTTP 429 |
| `BankingApiTest` | Accounts, ownership, filters and transfers over HTTP |
| `TransferConcurrencyTest` · `TransferRollbackTest` | Parallel transfers on real MySQL; injected failures roll back everything |
| `EmiEngineTest` | EMI maths matches independent examples |
| `LoanWorkflowTest` · `LoanLifecycleTest` | The full loan chain, permissions and invalid transitions |
| `RepaymentConcurrencyTest` · `RepaymentRollbackTest` | One instalment can never be paid twice; failures roll back |
| `ManagementTest` · `AdminConcurrencyTest` | Users, products, KYC, audit, reports; two admins cannot lock each other out |
| `HealthControllerTest` | Liveness endpoint |

---

## 📁 Project structure

```text
FinNova-bank/
├── backend/                         Spring Boot application (Maven Wrapper)
│   ├── src/main/java/com/finnova/bank/
│   │   ├── auth/        sign-in, JWT cookie, CSRF, profile
│   │   ├── banking/     accounts, transfers, ledger, idempotency, admin credit
│   │   ├── loans/       products, applications, EMI, disbursement, repayment, overdue
│   │   ├── officer/     officer workspace APIs
│   │   ├── admin/       management API, user administration
│   │   ├── reports/     dashboards and reports
│   │   ├── audit/       immutable audit log + search
│   │   ├── security/    security configuration and filters
│   │   ├── common/      error format, exceptions
│   │   ├── demo/        demo-user provisioning
│   │   └── health/      /api/health
│   ├── src/main/resources/db/migration/   Flyway V1 → V6
│   └── src/test/java/                     JUnit 5 test suites
├── frontend/                        React + Vite
│   └── src/  pages/ · components/ · api/ · routes/ · context/ · hooks/ · utils/
├── scripts/                         PowerShell setup, run and verification helpers
├── docs/                            stage notes, images, verification logs
└── .env.example                     documented settings — no secrets
```

---

## 🗺️ Limitations & roadmap

**Known limitations** — honest by design:

- A local, single-server lab: HTTP on loopback, an in-memory rate limiter and a plaintext `.env` protected only by Windows file permissions. **Not production-secure.**
- No real payment rails, no KYC document upload, no partial prepayment or late fees.
- Cards, Investments, Messages and Settings are static placeholder pages.
- The frontend bundle is larger than 500 kB (Vite warns); Flyway warns that MySQL 8.4 is newer than it has been tested with.

**Ideas for next steps:**

- [ ] Payment-gateway sandbox and downloadable statements
- [ ] Secure KYC document upload with an in-browser preview for officers
- [ ] Email / SMS notifications for decisions and due instalments
- [ ] Two-factor authentication for staff accounts
- [ ] Code-splitting, frontend tests (Vitest, Playwright) and a CI pipeline

---

<div align="center">

**FinNova Bank** · college group project · synthetic data only

<sub>No open-source licence is included — all rights reserved by the project team.<br/>
The detailed build history lives in <a href="docs/STAGE_NOTES.md">docs/STAGE_NOTES.md</a>.</sub>

</div>
