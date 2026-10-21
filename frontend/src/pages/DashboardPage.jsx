import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check, Copy, Eye, EyeOff, FileClock, HandCoins,
  PieChart, Plus, ReceiptText, ShieldCheck, Wallet, WalletCards,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { http } from "../api/http.js";
import { listAccounts } from "../api/accounts.js";
import { listTransactions } from "../api/transactions.js";
import { listLoanProducts, listLoanApplications } from "../api/loans.js";
import { formatDateTime } from "../utils/format.js";

const RUPEE = "\u20B9";
const MASK = "\u2022\u2022\u2022\u2022";
const MINUS = "\u2212";
const RECENT_SIZE = 14;
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const DONUT_COLORS = ["#D7FF58", "#B8A4FF", "#FF625D", "#7ED6F2", "#9A93B8"];
const TILE_TONES = ["lav", "pos", "neg", "sky"];

/* Customer-facing wording for application statuses. */
const APP_STATUS = {
  DRAFT: { label: "Draft", tone: "dim" },
  SUBMITTED: { label: "Submitted", tone: "lav" },
  UNDER_REVIEW: { label: "Under review", tone: "lav" },
  ADDITIONAL_INFO_REQUIRED: { label: "Action needed", tone: "warn" },
  APPROVED: { label: "Awaiting approval", tone: "lav" },
  DISBURSED: { label: "Paid out", tone: "pos" },
  REPAYMENT: { label: "Active loan", tone: "pos" },
  CLOSED: { label: "Closed", tone: "dim" },
  REJECTED: { label: "Not approved", tone: "neg" },
};

const KYC_STATUS = {
  VERIFIED: { label: "Verified", tone: "pos", text: "Your identity is verified. You can apply for loans." },
  PENDING: { label: "Pending review", tone: "warn", text: "A loan officer is reviewing your identity document." },
  REJECTED: { label: "Rejected", tone: "neg", text: "Your document could not be verified. See the note below." },
};

function isOutgoing(t) {
  const d = String(t.direction || "").toUpperCase();
  return d === "OUTGOING" || d === "DEBIT";
}

function errorMessage(error) {
  return error?.response?.data?.message || error?.response?.data?.detail || error?.message || "Please try again.";
}

function daypart(hour) {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function documentLabel(type) {
  if (!type) return "Document";
  return String(type).toLowerCase().split("_").map((w) => (w === "id" ? "ID" : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

function WaveChart({ transactions }) {
  const points = useMemo(() => {
    let acc = 0;
    const values = [...transactions].reverse().map((t) => (acc += (isOutgoing(t) ? -1 : 1) * Math.abs(Number(t.amount || 0))));
    if (values.length === 1) values.unshift(0);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0.01);
    const span = max - min || 1;
    const W = 100, H = 46, PAD = 6;
    return values.map((v, i) => [
      (i / (values.length - 1)) * W,
      PAD + (1 - (v - min) / span) * (H - PAD * 2),
    ]);
  }, [transactions]);

  if (points.length < 2) return null;
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  const end = points[points.length - 1];

  return (
    <svg className="db-wave" viewBox="0 0 100 46" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="waveFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D7FF58" stopOpacity="0.42" />
          <stop offset="60%" stopColor="#8E79F6" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#8E79F6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L 100,46 L 0,46 Z`} fill="url(#waveFill)" stroke="none" />
      <path d={d} fill="none" stroke="#D7FF58" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx={end[0]} cy={end[1]} r="2.2" fill="#D7FF58" />
      <circle cx={end[0]} cy={end[1]} r="4.4" fill="#D7FF58" opacity="0.25" />
    </svg>
  );
}

function SpendingDonut({ transactions, reveal }) {
  const segments = useMemo(() => {
    const totals = new Map();
    transactions.filter(isOutgoing).forEach((t) => {
      const key = String(t.transactionType || "Other").replaceAll("_", " ");
      totals.set(key, (totals.get(key) || 0) + Math.abs(Number(t.amount || 0)));
    });
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const grand = sorted.reduce((sum, [, v]) => sum + v, 0);
    if (grand <= 0) return { items: [], grand: 0 };
    const top = sorted.slice(0, 4);
    if (sorted.length > 4) top.push(["Others", sorted.slice(4).reduce((s, [, v]) => s + v, 0)]);
    return {
      grand,
      items: top.map(([label, amount], i) => ({ label, amount, pct: (amount / grand) * 100, color: DONUT_COLORS[i % DONUT_COLORS.length] })),
    };
  }, [transactions]);

  if (segments.grand === 0) {
    return <p className="db-sub small mb-0">No money went out in these transactions. The split appears after your first outgoing transfer.</p>;
  }

  let cursor = 0;
  const gradient = segments.items.map((s) => {
    const part = `${s.color} ${cursor.toFixed(2)}% ${(cursor + s.pct).toFixed(2)}%`;
    cursor += s.pct;
    return part;
  }).join(", ");

  return (
    <div className="db-donut-wrap">
      <div className="db-donut" style={{ background: `conic-gradient(${gradient})` }} role="img"
        aria-label={`Money out across ${segments.items.length} categories, total ${inr.format(segments.grand)}`}>
        <div className="db-donut-hole">
          <strong>{reveal ? inr.format(segments.grand) : `${RUPEE} ${MASK}`}</strong>
          <small>money out</small>
        </div>
      </div>
      <div className="db-legend">
        {segments.items.map((s) => (
          <div className="db-legend-row" key={s.label}>
            <span className="dot" style={{ background: s.color }} />
            <span className="text-truncate">{s.label}</span>
            <span className="db-kpi-foot">{s.pct.toFixed(0)}%</span>
            <span className="amt">{reveal ? inr.format(s.amount) : MASK}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RetryBox({ text, onRetry }) {
  return (
    <div className="db-alert d-flex align-items-center justify-content-between gap-2">
      <span>{text}</span>
      <button type="button" className="btn btn-sm btn-glass" onClick={onRetry}>Retry</button>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const [accounts, setAccounts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [products, setProducts] = useState(null);
  const [applications, setApplications] = useState(null);
  const [kyc, setKyc] = useState(undefined);
  const [errors, setErrors] = useState({ accounts: "", transactions: "", products: "", applications: "", kyc: "" });
  const [refresh, setRefresh] = useState(0);
  const [reveal, setReveal] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  async function copyNumber(account) {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(account.accountNumber); }
      else {
        const node = document.createElement("textarea");
        node.value = account.accountNumber;
        document.body.appendChild(node);
        node.select();
        document.execCommand("copy");
        node.remove();
      }
      setCopiedId(account.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard unavailable */ }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [a, t, p, apps, k] = await Promise.allSettled([
        listAccounts({ page: 0, size: 100, sortBy: "createdAt", sortDirection: "DESC" }),
        listTransactions({ page: 0, size: RECENT_SIZE, sortBy: "createdAt", sortDirection: "DESC" }),
        listLoanProducts({ page: 0, size: 3 }),
        listLoanApplications({ page: 0, size: 3 }),
        http.get("/kyc").then((r) => r.data),
      ]);
      if (cancelled) return;
      const pick = (result, key, setter) => {
        if (result.status === "fulfilled") {
          const data = result.value;
          setter(Array.isArray(data) ? data : data?.items ?? []);
          setErrors((current) => ({ ...current, [key]: "" }));
        } else {
          setter([]);
          setErrors((current) => ({ ...current, [key]: errorMessage(result.reason) }));
        }
      };
      pick(a, "accounts", setAccounts);
      pick(t, "transactions", setTransactions);
      pick(p, "products", setProducts);
      pick(apps, "applications", setApplications);
      if (k.status === "fulfilled") {
        setKyc(k.value || null);
        setErrors((current) => ({ ...current, kyc: "" }));
      } else if (k.reason?.response?.status === 404) {
        setKyc(null);
        setErrors((current) => ({ ...current, kyc: "" }));
      } else {
        setKyc(null);
        setErrors((current) => ({ ...current, kyc: errorMessage(k.reason) }));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [refresh]);

  const retry = () => setRefresh((v) => v + 1);

  const activeAccounts = useMemo(
    () => (accounts ?? []).filter((a) => String(a.status).toUpperCase() === "ACTIVE"),
    [accounts],
  );
  const totalBalance = useMemo(
    () => activeAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0),
    [activeAccounts],
  );
  const netFlow = useMemo(
    () => (transactions ?? []).reduce((sum, t) => sum + (isOutgoing(t) ? -1 : 1) * Number(t.amount || 0), 0),
    [transactions],
  );
  const txnCount = (transactions ?? []).length;
  const hasActivity = txnCount > 0;

  const money = (value) => (reveal ? inr.format(value) : `${RUPEE} ${MASK}`);
  const firstName = (user?.fullName || "Customer").split(" ")[0];

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: reduceMotion ? 0 : 0.06 } } };
  const item = {
    hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 0.61, 0.36, 1] } },
  };

  if (!user) return null;

  const kycStatus = kyc ? String(kyc.status || "").toUpperCase() : null;
  const kycMeta = kycStatus ? KYC_STATUS[kycStatus] || { label: kycStatus.toLowerCase(), tone: "dim", text: "" } : null;

  return (
    <motion.section className="db-night" variants={container} initial="hidden" animate="show" aria-labelledby="dashboard-heading">
      <motion.div variants={item} className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h1 id="dashboard-heading" className="db-hello mb-1 fw-bold text-white">Good {daypart(new Date().getHours())}, {firstName}</h1>
          <p className="db-sub mb-0 text-light opacity-85">Your accounts, recent activity and applications.</p>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <Link to="/transfer" className="btn btn-accent d-inline-flex align-items-center gap-2 shadow-sm">
            <ArrowLeftRight size={16} strokeWidth={2.2} aria-hidden="true" /> Send money
          </Link>
          <Link to="/loan-products" className="btn btn-glass d-inline-flex align-items-center gap-2">
            <HandCoins size={16} strokeWidth={2.2} aria-hidden="true" /> Apply for a loan
          </Link>
        </div>
      </motion.div>

      {/* Balance hero and accounts */}
      <motion.div variants={item} className="row g-3 mb-3">
        <div className="col-12 col-xl-5">
          <div className="db-card db-hero">
            <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
              <span className="db-kpi-label">Total balance (active accounts)</span>
              <button type="button" className="btn btn-sm btn-glass px-2 py-1" onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Hide balances" : "Show balances"} title={reveal ? "Hide balances" : "Show balances"}>
                {reveal ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
              </button>
            </div>
            {accounts === null ? (
              <span className="fn-skeleton d-block mt-2" style={{ width: "55%", height: "2.8rem" }} aria-hidden="true" />
            ) : errors.accounts ? (
              <RetryBox text="Balances unavailable." onRetry={retry} />
            ) : (
              <>
                <div className="hero-balance">{money(totalBalance)}</div>
                {hasActivity && !errors.transactions && (
                  <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                    <span className={`small fw-semibold ${netFlow >= 0 ? "text-pos" : "db-neg-text"}`}>
                      {netFlow >= 0 ? "+" : MINUS}{money(Math.abs(netFlow))}
                    </span>
                    <span className="db-kpi-foot">net change across your last {txnCount} transaction{txnCount === 1 ? "" : "s"}</span>
                  </div>
                )}
                <div className="mt-3">
                  {hasActivity ? (
                    <WaveChart transactions={transactions} />
                  ) : (
                    <p className="db-kpi-foot mb-0">The activity line appears after your first transaction.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="col-12 col-xl-7">
          <div className="row g-3 h-100">
            {accounts === null ? (
              <div className="col-12"><span className="fn-skeleton d-block" style={{ width: "100%", height: "9rem" }} aria-hidden="true" /></div>
            ) : !errors.accounts && accounts.length === 0 ? (
              <div className="col-12">
                <div className="db-card d-flex flex-column justify-content-center align-items-start gap-2">
                  <span className="db-ico lav"><WalletCards size={19} aria-hidden="true" /></span>
                  <strong>No accounts yet</strong>
                  <Link to="/accounts" className="btn btn-accent btn-sm d-inline-flex align-items-center gap-2 mt-1">
                    <Plus size={14} aria-hidden="true" /> Open account
                  </Link>
                </div>
              </div>
            ) : (
              (accounts ?? []).slice(0, 4).map((account, index) => (
                <div className="col-12 col-sm-6" key={account.id}>
                  <div className="db-card db-card-interactive h-100">
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <span className={`db-ico ${TILE_TONES[index % TILE_TONES.length]}`}><Wallet size={18} aria-hidden="true" /></span>
                      <span className={`db-chip ${String(account.status).toUpperCase() === "ACTIVE" ? "" : "dim"}`}>{account.status}</span>
                    </div>
                    <div className="db-kpi-label mt-3 text-truncate">{account.nickname || account.accountType || "Account"}</div>
                    <div className="db-kpi-value">{money(Number(account.balance || 0))}</div>
                    <div className="d-flex align-items-center flex-wrap gap-2 mt-1">
                      <span className="db-kpi-foot font-monospace">**** {String(account.accountNumber || "").slice(-4)}</span>
                      <button type="button" className="btn btn-glass btn-sm d-inline-flex align-items-center gap-1 py-0 px-2"
                        style={{ fontSize: "0.7rem" }} aria-label="Copy account number" onClick={() => copyNumber(account)}>
                        {copiedId === account.id ? <Check size={11} aria-hidden="true" /> : <Copy size={11} aria-hidden="true" />}
                        {copiedId === account.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>

      {/* Spending, recent transactions, loan applications */}
      <motion.div variants={item} className="row g-3">
        <div className="col-12 col-xl-4">
          <div className="db-card h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2 className="h6 mb-0 d-inline-flex align-items-center gap-2"><PieChart size={15} aria-hidden="true" /> Where money went</h2>
              <span className="db-chip dim">Last {txnCount || RECENT_SIZE} transactions</span>
            </div>
            {transactions === null ? (
              <span className="fn-skeleton d-block" style={{ width: "100%", height: "9rem" }} aria-hidden="true" />
            ) : errors.transactions ? (
              <RetryBox text="Unavailable." onRetry={retry} />
            ) : (
              <SpendingDonut transactions={transactions} reveal={reveal} />
            )}
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="db-card h-100">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h2 className="h6 mb-0 d-inline-flex align-items-center gap-2"><ReceiptText size={15} aria-hidden="true" /> Recent transactions</h2>
              <Link to="/transactions" className="db-chip lav text-decoration-none">View all</Link>
            </div>
            {transactions === null ? (
              <><span className="fn-skeleton row-skeleton" aria-hidden="true" /><span className="fn-skeleton row-skeleton" aria-hidden="true" /></>
            ) : errors.transactions ? (
              <RetryBox text="Transactions unavailable." onRetry={retry} />
            ) : transactions.length === 0 ? (
              <p className="db-sub small mb-0">No transactions yet.</p>
            ) : (
              <div>
                {transactions.slice(0, 4).map((t) => {
                  const out = isOutgoing(t);
                  return (
                    <div className="db-txn-row" key={t.id}>
                      <span className={`txn-icon ${out ? "out" : "in"}`} style={{ width: "2.2rem", height: "2.2rem" }} aria-hidden="true">
                        {out ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
                      </span>
                      <div className="flex-grow-1 min-w-0">
                        <div className="db-txn-name text-truncate">{t.description || t.transactionType || "Transaction"}</div>
                        <div className="db-txn-meta">{t.createdAt ? formatDateTime(t.createdAt) : t.reference || ""}</div>
                      </div>
                      <span className={`db-txn-amt ${out ? "out" : "in"}`}>{out ? MINUS : "+"}{reveal ? inr.format(Number(t.amount || 0)) : MASK}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="db-card h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2 className="h6 mb-0 d-inline-flex align-items-center gap-2"><FileClock size={15} aria-hidden="true" /> My loan applications</h2>
              <Link to="/loan-products" className="db-chip lav text-decoration-none">Loans</Link>
            </div>
            {applications === null ? (
              <span className="fn-skeleton d-block" style={{ width: "100%", height: "6rem" }} aria-hidden="true" />
            ) : errors.applications ? (
              <RetryBox text="Applications unavailable." onRetry={retry} />
            ) : applications.length === 0 ? (
              <div className="vstack gap-2 align-items-start">
                <p className="db-sub small mb-0">You have not applied for a loan yet.</p>
                <Link to="/loan-products" className="btn btn-accent btn-sm">Compare loan products</Link>
              </div>
            ) : (
              <div className="vstack gap-2">
                {applications.slice(0, 3).map((app) => {
                  const st = String(app.status || "").toUpperCase();
                  const meta = APP_STATUS[st] || { label: st.replaceAll("_", " ").toLowerCase(), tone: "dim" };
                  return (
                    <div key={app.id} className="db-app-row">
                      <div className="min-w-0">
                        <div className="fw-semibold small text-white text-truncate">{app.productName || "Loan"} &middot; #{app.id}</div>
                        <div className="db-txn-meta">{money(Number(app.principal || 0))} &middot; {app.months} months</div>
                      </div>
                      <span className={`db-status ${meta.tone}`}>{meta.label}</span>
                    </div>
                  );
                })}
                {applications.some((app) => String(app.status).toUpperCase() === "ADDITIONAL_INFO_REQUIRED") && (
                  <p className="db-kpi-foot mb-0">An officer has asked for more information. Open Loans to respond.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Identity check and loan products */}
      <motion.div variants={item} className="row g-3 mt-1">
        <div className="col-12 col-xl-5">
          <div className="db-card h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2 className="h6 mb-0 d-inline-flex align-items-center gap-2"><ShieldCheck size={15} aria-hidden="true" /> Identity check (KYC)</h2>
              {kycMeta && <span className={`db-status ${kycMeta.tone}`}>{kycMeta.label}</span>}
            </div>
            {kyc === undefined ? (
              <span className="fn-skeleton d-block" style={{ width: "100%", height: "4rem" }} aria-hidden="true" />
            ) : errors.kyc ? (
              <RetryBox text="KYC status unavailable." onRetry={retry} />
            ) : !kyc ? (
              <p className="db-sub small mb-0">No identity record is on file yet. Contact the bank to complete KYC.</p>
            ) : (
              <>
                {kycMeta.text && <p className="db-sub small mb-2">{kycMeta.text}</p>}
                <div className="db-kpi-foot">
                  {documentLabel(kyc.documentType)}
                  {kyc.createdAt ? ` \u00B7 submitted ${formatDateTime(kyc.createdAt)}` : ""}
                </div>
                {kycStatus === "REJECTED" && kyc.reviewNotes && (
                  <div className="db-alert mt-2">Officer note: {kyc.reviewNotes}</div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="col-12 col-xl-7">
          <div className="db-card h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2 className="h6 mb-0 d-inline-flex align-items-center gap-2"><HandCoins size={15} aria-hidden="true" /> Loan products</h2>
              <Link to="/loan-products" className="db-chip lav text-decoration-none">View all</Link>
            </div>
            {products === null ? (
              <span className="fn-skeleton d-block" style={{ width: "100%", height: "5rem" }} aria-hidden="true" />
            ) : errors.products ? (
              <RetryBox text="Loan products unavailable." onRetry={retry} />
            ) : products.length === 0 ? (
              <p className="db-sub small mb-0">No active loan products right now.</p>
            ) : (
              <div className="row g-2">
                {products.slice(0, 3).map((product) => (
                  <div key={product.id} className="col-12 col-md-4">
                    <div className="db-product h-100">
                      <div className="fw-bold small text-white text-truncate">{product.name}</div>
                      <div className="db-txn-meta">Up to {inr.format(Number(product.maxPrincipal || 0))}</div>
                      <Link to="/loan-products" className="btn btn-accent btn-sm py-1 px-2 mt-2" style={{ fontSize: "0.75rem" }}>View details</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <motion.p variants={item} className="db-kpi-foot mt-4 mb-0">
        FinNova Bank is a simulation. Every figure on this page comes from your accounts on the server; nothing here is real money.
      </motion.p>
    </motion.section>
  );
}
