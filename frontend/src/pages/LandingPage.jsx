import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeftRight, ArrowRight, BadgeCheck, Building2, Calculator, CircleCheck, ClipboardCheck, Fingerprint, HandCoins,
  KeyRound, LockKeyhole, ReceiptText, RefreshCw, ScrollText, ShieldCheck, UserRound, Users, WalletCards,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { getHealth } from "../api/health.js";
import { getLoanQuote, listLoanProducts } from "../api/loans.js";
import { friendlyError } from "../components/panels.jsx";

/*
 * FinNova Bank - public landing page.
 * Every figure shown here comes from the backend (health, public loan products and the
 * public EMI quote endpoint). Nothing is invented: when the backend is unreachable the
 * page says so instead of showing sample numbers.
 */

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function money(value) {
  const n = num(value);
  return n === null ? "\u2014" : inr.format(n);
}

function compactMoney(value) {
  const n = num(value);
  if (n === null) return "\u2014";
  if (n >= 10000000) return "\u20b9" + (n / 10000000).toFixed(n % 10000000 === 0 ? 0 : 1) + " Cr";
  if (n >= 100000) return "\u20b9" + (n / 100000).toFixed(n % 100000 === 0 ? 0 : 1) + " L";
  return inr.format(n);
}

/* Interest-rate fields are read defensively; a rate is only displayed when the API provides one. */
function productRate(p) {
  const candidates = [p?.minAnnualRate, p?.annualRate, p?.defaultAnnualRate, p?.baseAnnualRate];
  for (const c of candidates) {
    const n = num(c);
    if (n !== null) return n;
  }
  return null;
}

function rateRange(p) {
  const min = productRate(p);
  const max = num(p?.maxAnnualRate);
  if (min === null) return null;
  if (max !== null && max > min) return `${min.toFixed(2)}% \u2013 ${max.toFixed(2)}% p.a.`;
  return `${min.toFixed(2)}% p.a.`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function amountStep(min, max) {
  const span = max - min;
  if (span <= 100000) return 1000;
  if (span <= 1000000) return 5000;
  if (span <= 5000000) return 10000;
  return 50000;
}

/* ------------------------------------------------------------------ data hooks */
function useHealth() {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then((data) => setState({ status: data?.status === "UP" ? "up" : "degraded" }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ status: "down", message: friendlyError(error, "The backend is not responding.") });
      });
    return () => controller.abort();
  }, []);
  return state;
}

function useProducts() {
  const [state, setState] = useState({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading", items: [] });
    listLoanProducts({ page: 0, size: 6 })
      .then((data) => {
        if (!alive) return;
        const items = (data?.items ?? []).filter((p) => p && p.id != null);
        setState({ status: items.length ? "ready" : "empty", items });
      })
      .catch((error) => {
        if (alive) setState({ status: "error", items: [], message: friendlyError(error, "Loan products are unavailable right now.") });
      });
    return () => { alive = false; };
  }, [attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

/* ------------------------------------------------------------------ EMI calculator */
function EmiCalculator({ products, selectedId, onSelect, productsStatus, onRetry }) {
  const product = useMemo(
    () => products.find((p) => String(p.id) === String(selectedId)) ?? products[0] ?? null,
    [products, selectedId]
  );
  const limits = useMemo(() => {
    if (!product) return null;
    const minP = num(product.minPrincipal) ?? 10000;
    const maxP = Math.max(num(product.maxPrincipal) ?? minP, minP);
    const minT = num(product.minTenureMonths) ?? 6;
    const maxT = Math.max(num(product.maxTenureMonths) ?? minT, minT);
    return { minP, maxP, minT, maxT, step: amountStep(minP, maxP) };
  }, [product]);

  const [amount, setAmount] = useState(0);
  const [months, setMonths] = useState(0);
  const [quote, setQuote] = useState({ status: "idle" });
  const requestId = useRef(0);

  // Sensible starting point inside the product's own limits whenever the product changes.
  useEffect(() => {
    if (!limits) return;
    const mid = limits.minP + (limits.maxP - limits.minP) * 0.25;
    setAmount(clamp(Math.round(mid / limits.step) * limits.step, limits.minP, limits.maxP));
    setMonths(clamp(Math.round(((limits.minT + limits.maxT) / 2) / 6) * 6 || limits.minT, limits.minT, limits.maxT));
  }, [limits]);

  // Debounced quote from the backend; stale responses are ignored.
  useEffect(() => {
    if (!product || !limits || !amount || !months) return undefined;
    const id = ++requestId.current;
    setQuote((q) => ({ ...q, status: "loading" }));
    const timer = setTimeout(() => {
      getLoanQuote(product.id, amount, months)
        .then((data) => {
          if (id !== requestId.current) return;
          const calc = data?.calculation ?? data ?? {};
          const emi = num(calc.emi);
          if (emi === null) {
            setQuote({ status: "error", message: "The quote did not include an EMI." });
            return;
          }
          const totalPayable = num(calc.totalPayable) ?? num(calc.totalAmount) ?? emi * months;
          const totalInterest = num(calc.totalInterest) ?? Math.max(totalPayable - amount, 0);
          const rate = num(calc.annualRate) ?? num(data?.annualRate) ?? productRate(product);
          setQuote({ status: "ready", emi, totalPayable, totalInterest, rate });
        })
        .catch((error) => {
          if (id !== requestId.current) return;
          setQuote({ status: "error", message: friendlyError(error, "The EMI quote is unavailable right now.") });
        });
    }, 320);
    return () => clearTimeout(timer);
  }, [product, limits, amount, months]);

  const principalShare = quote.status === "ready" && quote.totalPayable > 0
    ? Math.round((amount / quote.totalPayable) * 100) : null;

  return (
    <section className="fnh-calc" aria-labelledby="fnh-calc-title" id="emi-calculator">
      <div className="fnh-calc-head">
        <span className="fnh-calc-icon" aria-hidden="true"><Calculator size={18} /></span>
        <div>
          <h2 id="fnh-calc-title" className="fnh-calc-title">EMI calculator</h2>
          <p className="fnh-calc-sub">Live quote from the FinNova loan engine</p>
        </div>
      </div>

      {productsStatus === "loading" && (
        <div className="fnh-calc-body" role="status">
          <div className="fn-skeleton fnh-skel-line" />
          <div className="fn-skeleton fnh-skel-line" />
          <div className="fn-skeleton fnh-skel-block" />
        </div>
      )}

      {(productsStatus === "error" || productsStatus === "empty") && (
        <div className="fnh-calc-body fnh-calc-empty">
          <p className="mb-2">
            {productsStatus === "empty"
              ? "No loan products are published yet."
              : "The calculator needs the backend to quote an EMI."}
          </p>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onRetry}>
            <RefreshCw size={14} className="me-1" aria-hidden="true" />Try again
          </button>
        </div>
      )}

      {productsStatus === "ready" && product && limits && (
        <div className="fnh-calc-body">
          <label className="fnh-field">
            <span className="fnh-label">Loan product</span>
            <select className="form-select" value={String(product.id)} onChange={(e) => onSelect(e.target.value)}>
              {products.map((p) => <option key={p.id} value={String(p.id)}>{p.name ?? `Product ${p.id}`}</option>)}
            </select>
          </label>

          <div className="fnh-field">
            <div className="fnh-label-row">
              <label className="fnh-label" htmlFor="fnh-amount">Loan amount</label>
              <output className="fnh-value" htmlFor="fnh-amount">{money(amount)}</output>
            </div>
            <input id="fnh-amount" type="range" className="form-range fnh-range" min={limits.minP} max={limits.maxP}
              step={limits.step} value={amount} onChange={(e) => setAmount(Number(e.target.value))}
              aria-valuetext={money(amount)} />
            <div className="fnh-range-ends"><span>{compactMoney(limits.minP)}</span><span>{compactMoney(limits.maxP)}</span></div>
          </div>

          <div className="fnh-field">
            <div className="fnh-label-row">
              <label className="fnh-label" htmlFor="fnh-months">Tenure</label>
              <output className="fnh-value" htmlFor="fnh-months">{months} months</output>
            </div>
            <input id="fnh-months" type="range" className="form-range fnh-range" min={limits.minT} max={limits.maxT}
              step={1} value={months} onChange={(e) => setMonths(Number(e.target.value))}
              aria-valuetext={`${months} months`} />
            <div className="fnh-range-ends"><span>{limits.minT} mo</span><span>{limits.maxT} mo</span></div>
          </div>

          <div className="fnh-result" aria-live="polite">
            <div className="fnh-result-main">
              <span className="fnh-result-label">Monthly EMI</span>
              <span className={"fnh-result-emi" + (quote.status === "loading" ? " is-loading" : "")}>
                {quote.status === "ready" || (quote.status === "loading" && quote.emi != null) ? inr2.format(quote.emi) : "\u2014"}
              </span>
              {quote.status === "ready" && quote.rate != null && (
                <span className="fnh-result-rate">at {quote.rate.toFixed(2)}% p.a.</span>
              )}
            </div>
            {quote.status === "error" ? (
              <p className="fnh-result-error mb-0">{quote.message}</p>
            ) : (
              <>
                <div className="fnh-split" aria-hidden="true">
                  <span style={{ width: `${principalShare ?? 100}%` }} />
                </div>
                <dl className="fnh-result-grid">
                  <div><dt><i className="fnh-dot is-principal" />Principal</dt><dd>{money(amount)}</dd></div>
                  <div><dt><i className="fnh-dot is-interest" />Interest</dt><dd>{quote.status === "ready" ? money(quote.totalInterest) : "\u2014"}</dd></div>
                  <div className="is-total"><dt>Total payable</dt><dd>{quote.status === "ready" ? money(quote.totalPayable) : "\u2014"}</dd></div>
                </dl>
              </>
            )}
          </div>
          <p className="fnh-fineprint mb-0">Indicative quote for synthetic demo products. Final terms are set during review.</p>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ static content */
const FEATURES = [
  { Icon: WalletCards, title: "Accounts", text: "Open savings or current accounts in INR, rename them and close them when they are no longer needed." },
  { Icon: ArrowLeftRight, title: "Safe transfers", text: "Recipient look-up with masked numbers, one transfer per request even on retries, and a downloadable receipt." },
  { Icon: ReceiptText, title: "Transaction history", text: "Search and filter every credit and debit by type, direction, date and amount." },
  { Icon: HandCoins, title: "Loans with clear EMIs", text: "Compare products, see the EMI before you apply and track each application from draft to payout." },
  { Icon: Fingerprint, title: "KYC verification", text: "Customers see their verification status, and loan officers review KYC records before lending." },
  { Icon: ScrollText, title: "Full oversight", text: "Administrators see every officer decision, the audit log, product performance and system health." },
];

const STEPS = [
  { Icon: UserRound, role: "Customer", title: "Apply", text: "Choose a product, amount and tenure, check the EMI and submit the application." },
  { Icon: ClipboardCheck, role: "Loan officer", title: "Verify", text: "The officer reviews the applicant, KYC and affordability, then forwards it or asks for more information." },
  { Icon: ShieldCheck, role: "Administrator", title: "Approve", text: "An administrator gives the final approval and releases the funds, or rejects it with a recorded reason." },
  { Icon: BadgeCheck, role: "System", title: "Funds credited", text: "On approval the amount is credited to the customer's account and the EMI schedule is created." },
];

const SECURITY = [
  { Icon: LockKeyhole, title: "HttpOnly sessions", text: "Sign-in tokens live in a protected cookie that page scripts cannot read." },
  { Icon: KeyRound, title: "CSRF protection", text: "Every change request carries a fresh anti-forgery token." },
  { Icon: RefreshCw, title: "Idempotent payments", text: "Transfers, repayments and credits carry an idempotency key, so a retry is never applied twice." },
  { Icon: ScrollText, title: "Audit trail", text: "Staff actions and loan decisions are written to records that cannot be edited or deleted." },
];

const ROLES = [
  {
    Icon: UserRound, title: "Customers", to: "/register", cta: "Open an account",
    points: ["Dashboard of accounts and recent activity", "Transfers with downloadable receipts", "Loan applications with live EMI"],
  },
  {
    Icon: Users, title: "Loan officers", to: "/login", cta: "Officer sign-in",
    points: ["Queue of applications to review", "Review panel with estimated EMI", "KYC review and decision history"],
  },
  {
    Icon: Building2, title: "Administrators", to: "/login?next=admin", cta: "Admin sign-in",
    points: ["Final approval and payout", "Officer activity and audit log", "Users, products and system health"],
  },
];

/* ------------------------------------------------------------------ page */
export default function LandingPage() {
  const { user } = useAuth();
  const health = useHealth();
  const products = useProducts();
  const [selectedId, setSelectedId] = useState("");

  function pickProduct(id) {
    setSelectedId(String(id));
    const el = document.getElementById("emi-calculator");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const statusLabel = {
    loading: "Checking system status\u2026",
    up: "All systems operational",
    degraded: "Backend reachable, reporting issues",
    down: "Backend offline",
  }[health.status];

  return (
    <div className="fnh">
      {/* ---------------- hero */}
      <section className="fnh-hero fnh-bleed" aria-labelledby="fnh-title">
        <div className="fnh-hero-bg" aria-hidden="true" />
        <div className="container fnh-hero-inner">
          <div className="fnh-hero-copy">
            <span className="fnh-kicker"><span className="fnh-kicker-dot" />Educational digital bank {"\u00b7"} synthetic data</span>
            <h1 id="fnh-title" className="fnh-title">
              Banking and lending, <span className="fnh-title-accent">run the way real banks do.</span>
            </h1>
            <p className="fnh-lead">
              Accounts, transfers and loans in one secure workspace. Every loan is applied for by the customer, verified
              by a loan officer and approved by an administrator before any money moves.
            </p>
            <div className="fnh-cta">
              {user ? (
                <Link to="/dashboard" className="btn btn-lg fnh-btn-primary">
                  Open dashboard <ArrowRight size={18} className="ms-1" aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn btn-lg fnh-btn-primary">
                    Open an account <ArrowRight size={18} className="ms-1" aria-hidden="true" />
                  </Link>
                  <Link to="/login" className="btn btn-lg fnh-btn-ghost">Sign in</Link>
                </>
              )}
            </div>
            {!user && (
              <p className="fnh-staff-link">
                Staff member? <Link to="/login?next=admin">Admin &amp; officer sign-in <ArrowRight size={14} aria-hidden="true" /></Link>
              </p>
            )}
            <ul className="fnh-trust" aria-label="Platform status and safeguards">
              <li>
                <Link to="/system-status" className={`fnh-status is-${health.status}`}>
                  <span className="fnh-status-dot" aria-hidden="true" />{statusLabel}
                </Link>
              </li>
              <li><LockKeyhole size={15} aria-hidden="true" /> HttpOnly sessions</li>
              <li><ShieldCheck size={15} aria-hidden="true" /> Role-based access</li>
            </ul>
          </div>
          <div className="fnh-hero-card">
            <EmiCalculator
              products={products.items}
              productsStatus={products.status}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onRetry={products.retry}
            />
          </div>
        </div>
      </section>

      {/* ---------------- features */}
      <section className="fnh-section" aria-labelledby="fnh-features-title">
        <header className="fnh-section-head">
          <p className="fnh-eyebrow">What you can do</p>
          <h2 id="fnh-features-title" className="fnh-h2">Everything a modern bank account needs</h2>
          <p className="fnh-section-lead">From everyday payments to loan servicing, with the controls a regulated bank expects.</p>
        </header>
        <div className="fnh-features">
          {FEATURES.map(({ Icon, title, text }) => (
            <article key={title} className="fnh-feature">
              <span className="fnh-feature-icon" aria-hidden="true"><Icon size={20} /></span>
              <h3 className="fnh-h3">{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- loan journey */}
      <section className="fnh-journey fnh-bleed" aria-labelledby="fnh-journey-title">
        <div className="container">
          <header className="fnh-section-head">
            <p className="fnh-eyebrow">How a loan is approved</p>
            <h2 id="fnh-journey-title" className="fnh-h2">Four steps, three people, one audit trail</h2>
            <p className="fnh-section-lead">No single person can approve and pay out a loan. Each step is enforced by the server, not just the screen.</p>
          </header>
          <ol className="fnh-steps">
            {STEPS.map(({ Icon, role, title, text }, i) => (
              <li key={title} className="fnh-step">
                <div className="fnh-step-top">
                  <span className="fnh-step-num">{i + 1}</span>
                  <span className="fnh-step-icon" aria-hidden="true"><Icon size={18} /></span>
                </div>
                <span className="fnh-step-role">{role}</span>
                <h3 className="fnh-h3">{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- live loan products */}
      <section className="fnh-section" aria-labelledby="fnh-products-title">
        <header className="fnh-section-head fnh-section-head-row">
          <div>
            <p className="fnh-eyebrow">Loan products</p>
            <h2 id="fnh-products-title" className="fnh-h2">Published products, straight from the catalogue</h2>
          </div>
          {user ? (
            <Link to="/loan-products" className="fnh-link-arrow">View all products <ArrowRight size={16} aria-hidden="true" /></Link>
          ) : (
            <Link to="/register" className="fnh-link-arrow">Create an account to apply <ArrowRight size={16} aria-hidden="true" /></Link>
          )}
        </header>
        {products.status === "loading" && (
          <div className="fnh-products" role="status" aria-label="Loading loan products">
            {[0, 1, 2].map((k) => <div key={k} className="fnh-product fn-skeleton fnh-skel-card" />)}
          </div>
        )}
        {products.status === "error" && (
          <div className="fnh-notice">
            <span>{products.message}</span>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={products.retry}>Retry</button>
          </div>
        )}
        {products.status === "empty" && <div className="fnh-notice"><span>No loan products are published yet.</span></div>}
        {products.status === "ready" && (
          <div className="fnh-products">
            {products.items.slice(0, 3).map((p) => {
              const rate = rateRange(p);
              return (
                <article key={p.id} className="fnh-product">
                  <div className="fnh-product-top">
                    <span className="fnh-product-icon" aria-hidden="true"><HandCoins size={18} /></span>
                    {p.code && <span className="fnh-product-code">{p.code}</span>}
                  </div>
                  <h3 className="fnh-h3">{p.name ?? `Product ${p.id}`}</h3>
                  {p.description && <p className="fnh-product-desc">{p.description}</p>}
                  <dl className="fnh-product-facts">
                    <div><dt>Amount</dt><dd>{compactMoney(p.minPrincipal)} {"\u2013"} {compactMoney(p.maxPrincipal)}</dd></div>
                    <div><dt>Tenure</dt><dd>{p.minTenureMonths ?? "\u2014"} {"\u2013"} {p.maxTenureMonths ?? "\u2014"} months</dd></div>
                    {rate && <div><dt>Rate</dt><dd>{rate}</dd></div>}
                  </dl>
                  <button type="button" className="btn btn-sm fnh-btn-soft" onClick={() => pickProduct(p.id)}>
                    <Calculator size={15} className="me-1" aria-hidden="true" />Calculate EMI
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------------- security band */}
      <section className="fnh-security fnh-bleed" aria-labelledby="fnh-security-title">
        <div className="container fnh-security-inner">
          <div className="fnh-security-copy">
            <p className="fnh-eyebrow is-dark">Security by design</p>
            <h2 id="fnh-security-title" className="fnh-h2 is-dark">Protection built into every request</h2>
            <p>
              Balances can never go negative, posted transactions cannot be edited or deleted, and every sensitive
              action is checked against the signed-in user's role on the server.
            </p>
            <Link to="/system-status" className="fnh-link-arrow is-dark">Check live system status <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <ul className="fnh-security-grid">
            {SECURITY.map(({ Icon, title, text }) => (
              <li key={title}>
                <span className="fnh-sec-icon" aria-hidden="true"><Icon size={18} /></span>
                <div>
                  <h3 className="fnh-h3 is-dark">{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- workspaces */}
      <section className="fnh-section" aria-labelledby="fnh-roles-title">
        <header className="fnh-section-head">
          <p className="fnh-eyebrow">One platform, three workspaces</p>
          <h2 id="fnh-roles-title" className="fnh-h2">Built for everyone in the lending chain</h2>
        </header>
        <div className="fnh-roles">
          {ROLES.map(({ Icon, title, to, cta, points }) => (
            <article key={title} className="fnh-role">
              <span className="fnh-role-icon" aria-hidden="true"><Icon size={20} /></span>
              <h3 className="fnh-h3">{title}</h3>
              <ul>
                {points.map((pt) => (
                  <li key={pt}><CircleCheck size={16} aria-hidden="true" />{pt}</li>
                ))}
              </ul>
              {!user && <Link to={to} className="fnh-link-arrow">{cta} <ArrowRight size={16} aria-hidden="true" /></Link>}
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- closing CTA */}
      <section className="fnh-section fnh-final" aria-labelledby="fnh-final-title">
        <div className="fnh-final-card">
          <div>
            <h2 id="fnh-final-title" className="fnh-h2 is-dark">Ready to explore FinNova Bank?</h2>
            <p>Create a customer account in a minute. All money in FinNova is synthetic, so nothing real is ever at risk.</p>
          </div>
          <div className="fnh-final-cta">
            {user ? (
              <Link to="/dashboard" className="btn btn-lg fnh-btn-primary">Open dashboard <ArrowRight size={18} className="ms-1" aria-hidden="true" /></Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-lg fnh-btn-primary">Open an account <ArrowRight size={18} className="ms-1" aria-hidden="true" /></Link>
                <Link to="/login" className="btn btn-lg fnh-btn-ghost is-dark">Sign in</Link>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
