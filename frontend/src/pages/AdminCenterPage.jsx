import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity, AlertTriangle, BadgeCheck, Ban, BarChart3, CircleCheck, ClipboardCheck, Eye,
  FileText, Gavel, HandCoins, HeartPulse, Hourglass, IndianRupee, Landmark, PieChart,
  RefreshCw, ShieldCheck, UserCheck, UserPlus, Users, X,
} from "lucide-react";
import { http } from "../api/http.js";
import { getHealth } from "../api/health.js";
import {
  listLoanApplications,
  getLoanApplication,
  getLoanProduct,
  getLoanQuote,
  getLoanApplicationHistory,
  disburseLoanApplication,
  staffLoanApplicationAction,
} from "../api/loans.js";
import { usePanel } from "../hooks/usePanel.js";
import { ConfirmActionDialog } from "../components/ConfirmActionDialog.jsx";
import { AddOfficerDialog } from "../components/AddOfficerDialog.jsx";
import { CreditAccountDialog } from "../components/CreditAccountDialog.jsx";
import { ADMIN_REFRESH_EVENT } from "../components/AdminNav.jsx";
import { ErrorBlock, Loading, Pager, friendlyError, pageInfo } from "../components/panels.jsx";

const PAGE_SIZE = 10;
const STREAM_PAGE_SIZE = 15;
const DECISION_PAGE_SIZES = [100, 50, 20];
const DECISION_MAX_PAGES = 10;
const KYC_LOOKUP_SIZE = 50;
const KYC_LOOKUP_MAX_PAGES = 20;
const OUTCOMES = ["SUCCESS", "FAILURE", "DENIED"];
const EVENT_PATTERN = /^[A-Z0-9_]{1,64}$/;
const EMPTY_AUDIT_FILTERS = { outcome: "", eventType: "", q: "", from: "", to: "" };
const EMPTY_USER_FILTERS = { q: "", role: "", enabled: "" };

const VIEWS = [
  { key: "", label: "Overview", title: "Admin overview", sub: "What needs your decision today, bank-wide figures and system health." },
  { key: "loans", label: "Final approvals", title: "Final loan approvals", sub: "Officers verify applications and forward them here. Your approval pays the loan out to the customer's account." },
  { key: "officers", label: "Officer activity", title: "Officer activity", sub: "Every recorded officer and admin decision, summarised per person for the selected window." },
  { key: "kyc", label: "KYC overview", title: "KYC overview", sub: "Read-only view of identity checks. Decisions are made by loan officers in the Officer workspace." },
  { key: "users", label: "Users & officers", title: "Users & officers", sub: "Find accounts, activate or deactivate access, and create loan officer accounts." },
  { key: "products", label: "Products", title: "Product performance", sub: "Applications, disbursed principal, repayments and outstanding balance per loan product." },
  { key: "audit", label: "Audit log", title: "Audit log", sub: "Security and business events recorded by the server." },
];

const LOAN_TABS = [
  { value: "APPROVED", label: "Awaiting final approval" },
  { value: "SUBMITTED", label: "New" },
  { value: "UNDER_REVIEW", label: "Officer review" },
  { value: "ADDITIONAL_INFO_REQUIRED", label: "Info requested" },
  { value: "REPAYMENT", label: "Paid out" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];

const LOAN_STATUS_LABEL = {
  DRAFT: "draft",
  SUBMITTED: "new",
  UNDER_REVIEW: "officer review",
  ADDITIONAL_INFO_REQUIRED: "info requested",
  APPROVED: "officer verified",
  DISBURSED: "paid out",
  REPAYMENT: "repaying",
  CLOSED: "closed",
  REJECTED: "rejected",
};

const PIPELINE = [
  { key: "SUBMITTED", label: "New (not yet picked up)", statuses: ["SUBMITTED"], tab: "SUBMITTED" },
  { key: "UNDER_REVIEW", label: "Officer review", statuses: ["UNDER_REVIEW"], tab: "UNDER_REVIEW" },
  { key: "ADDITIONAL_INFO_REQUIRED", label: "Waiting for customer info", statuses: ["ADDITIONAL_INFO_REQUIRED"], tab: "ADDITIONAL_INFO_REQUIRED" },
  { key: "APPROVED", label: "Awaiting your final approval", statuses: ["APPROVED"], tab: "APPROVED", action: true },
  { key: "PAID", label: "Paid out / repaying", statuses: ["DISBURSED", "REPAYMENT"], tab: "REPAYMENT" },
  { key: "CLOSED", label: "Closed (fully repaid)", statuses: ["CLOSED"], tab: "ALL" },
  { key: "REJECTED", label: "Rejected", statuses: ["REJECTED"], tab: "REJECTED" },
];

const KYC_TABS = [
  { value: "PENDING", label: "Pending" },
  { value: "VERIFIED", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];

const WINDOWS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const KIND_LABEL = {
  started: "Review started",
  forwarded: "Forwarded to admin",
  info: "Info requested",
  rejected: "Loan rejected",
  paidOut: "Approved & paid out",
  kycVerified: "KYC verified",
  kycRejected: "KYC rejected",
  other: "Other",
};

/* ---------------- formatting helpers ---------------- */

function money(value) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

function moneyShort(value) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2,
  }).format(amount);
}

function count(value) {
  return value === null || value === undefined ? "-" : value;
}

function rate(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "-";
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateTime(value) {
  const d = toDate(value);
  return d ? d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
}

function dateOnly(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";
}

function isoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function statusChipClass(status) {
  const value = String(status || "").toUpperCase();
  if (["SUCCESS", "VERIFIED", "APPROVED", "DISBURSED", "REPAYMENT", "CLOSED"].includes(value)) return "status-chip pos";
  if (["FAILURE", "REJECTED"].includes(value)) return "status-chip neg";
  if (["DENIED", "PENDING", "SUBMITTED", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED"].includes(value)) return "status-chip pending";
  return "status-chip neutral";
}

function loanLabel(status) {
  const value = String(status || "").toUpperCase();
  return LOAN_STATUS_LABEL[value] || value.replaceAll("_", " ").toLowerCase() || "unknown";
}

function documentLabel(type) {
  if (!type) return "-";
  return String(type).toLowerCase().split("_").map((w) => (w === "id" ? "ID" : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

/* Enough of the reference to match a record, never the full value. */
function maskReference(ref) {
  if (!ref) return "unavailable";
  const value = String(ref);
  if (value.length <= 12) return value;
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

function decisionKind(item) {
  const type = String(item.resourceType || "").toUpperCase();
  const value = String(item.decision || "").toUpperCase();
  if (type.includes("KYC")) {
    if (value === "VERIFIED") return "kycVerified";
    if (value === "REJECTED") return "kycRejected";
    return "other";
  }
  if (value === "UNDER_REVIEW") return "started";
  if (value === "APPROVED") return "forwarded";
  if (value === "ADDITIONAL_INFO_REQUIRED") return "info";
  if (value === "REJECTED") return "rejected";
  if (value === "DISBURSED" || value === "REPAYMENT") return "paidOut";
  return "other";
}

function staffName(staffMap, id, role) {
  const user = staffMap.get(Number(id));
  if (user) return user.fullName;
  const label = role ? String(role).replaceAll("_", " ").toLowerCase() : "staff";
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} #${id}`;
}

/* ---------------- data helpers ---------------- */

async function totalOf(url, params) {
  const { data } = await http.get(url, { params: { page: 0, size: 1, ...params } });
  return Number(data?.totalElements ?? data?.total ?? (data?.items ?? []).length);
}

async function findKycForCustomer(customerId) {
  for (let page = 0; page < KYC_LOOKUP_MAX_PAGES; page += 1) {
    const { data } = await http.get("/officer/kyc", { params: { page, size: KYC_LOOKUP_SIZE } });
    const items = data?.items ?? [];
    const match = items.find((k) => Number(k.customerId) === Number(customerId));
    if (match) return match;
    const totalPages = Number(data?.totalPages ?? 0);
    if (items.length === 0 || page + 1 >= totalPages) return null;
  }
  return null;
}

async function fetchQuote(app) {
  try {
    return await getLoanQuote(app.productId, app.principal, app.months, app.annualRate);
  } catch {
    try {
      return await getLoanQuote(app.productId, app.principal, app.months);
    } catch {
      return null;
    }
  }
}

/* Pages through /admin/decisions so per-officer totals are not based on a single page. */
async function fetchDecisionWindow(windowValue, signal) {
  const params = {};
  if (windowValue !== "all") {
    const days = Number(windowValue);
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    params.from = isoDay(start);
    params.to = isoDay(new Date());
  }
  let size = DECISION_PAGE_SIZES[0];
  let first = null;
  for (const candidate of DECISION_PAGE_SIZES) {
    try {
      size = candidate;
      first = (await http.get("/admin/decisions", { signal, params: { ...params, page: 0, size } })).data;
      break;
    } catch (error) {
      if (error?.response?.status !== 400 || candidate === DECISION_PAGE_SIZES[DECISION_PAGE_SIZES.length - 1]) throw error;
    }
  }
  const items = [...(first?.items ?? [])];
  const total = Number(first?.totalElements ?? items.length);
  const totalPages = Number(first?.totalPages ?? 1);
  for (let page = 1; page < Math.min(totalPages, DECISION_MAX_PAGES); page += 1) {
    const { data } = await http.get("/admin/decisions", { signal, params: { ...params, page, size } });
    const pageItems = data?.items ?? [];
    items.push(...pageItems);
    if (pageItems.length === 0) break;
  }
  return { items, total, truncated: items.length < total, windowValue, from: params.from || null };
}

function buildChecks(app, product, quote, kyc) {
  const principal = Number(app.principal);
  const months = Number(app.months);
  const income = Number(app.declaredMonthlyIncome);
  const hasIncome = Number.isFinite(income) && income > 0;
  const calc = quote?.calculation ?? null;
  const emi = calc && Number.isFinite(Number(calc.emi)) ? Number(calc.emi) : null;
  const schedule = Array.isArray(calc?.schedule) && calc.schedule.length > 0 ? calc.schedule : null;
  const totalPayable = schedule
    ? schedule.reduce((sum, row) => sum + Number(row.total ?? 0), 0)
    : emi !== null ? emi * months : null;
  const totalInterest = totalPayable !== null && totalPayable >= principal ? totalPayable - principal : null;
  const foir = emi !== null && hasIncome ? (emi / income) * 100 : null;
  const inBounds = product
    ? principal >= Number(product.minPrincipal) && principal <= Number(product.maxPrincipal)
      && months >= Number(product.minTenureMonths) && months <= Number(product.maxTenureMonths)
    : null;
  const kycStatus = kyc.ok ? (kyc.record?.status ?? "NOT_FOUND") : "UNKNOWN";
  const checks = [
    {
      key: "kyc", label: "KYC identity",
      state: kycStatus === "VERIFIED" ? "pass" : kycStatus === "UNKNOWN" ? "unknown" : "fail",
      detail: kycStatus === "VERIFIED" ? "Identity verified by a loan officer."
        : kycStatus === "UNKNOWN" ? "KYC status could not be loaded."
          : kycStatus === "NOT_FOUND" ? "No KYC record found for this customer."
            : `KYC is ${kycStatus}. Payout stays blocked until it is VERIFIED.`,
    },
    {
      key: "foir", label: "EMI-to-income (FOIR)",
      state: foir === null ? "unknown" : foir <= 40 ? "pass" : foir <= 50 ? "warn" : "fail",
      detail: foir === null ? "Needs an EMI quote and declared income."
        : `${foir.toFixed(1)}% of declared monthly income (guidance: up to 40%, caution to 50%).`,
    },
    {
      key: "bounds", label: "Product limits",
      state: inBounds === null ? "unknown" : inBounds ? "pass" : "fail",
      detail: product
        ? `${money(product.minPrincipal)} to ${money(product.maxPrincipal)}, ${product.minTenureMonths} to ${product.maxTenureMonths} months.`
        : "Product details unavailable.",
    },
  ];
  return { emi, totalPayable, totalInterest, scheduleExact: Boolean(schedule), kycStatus, kycRecord: kyc.record, checks };
}

/* ---------------- small components ---------------- */

function Drawer({ open, titleId, locked, onClose, children, footer }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => panelRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = overflow;
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape" && !locked) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, locked, onClose]);

  if (!open) return null;
  return (
    <div className="ofc-drawer-root">
      <div className="ofc-drawer-backdrop" aria-hidden="true" onMouseDown={() => { if (!locked) onClose(); }} />
      <aside className="ofc-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <div className="ofc-drawer-body">{children}</div>
        {footer && <div className="ofc-drawer-footer">{footer}</div>}
      </aside>
    </div>
  );
}

function CheckIcon({ state }) {
  if (state === "pass") return <CircleCheck size={16} aria-hidden="true" />;
  if (state === "fail") return <Ban size={16} aria-hidden="true" />;
  return <AlertTriangle size={16} aria-hidden="true" />;
}

const CHECK_STATE_TEXT = { pass: "Pass", warn: "Caution", fail: "Fail", unknown: "Unavailable" };

const BIG_METRICS = [
  { key: "customers", label: "Active customers", icon: Users, tone: "green", value: (o) => count(o?.accounts?.activeCustomers) },
  { key: "accounts", label: "Total accounts", icon: Landmark, tone: "blue", value: (o) => count(o?.accounts?.accountCount) },
  { key: "volume", label: "Operations volume", icon: IndianRupee, tone: "purple", value: (o) => moneyShort(o?.accounts?.operationVolume) },
  { key: "principal", label: "Outstanding principal", icon: HandCoins, tone: "green", value: (o) => moneyShort(o?.loans?.outstandingPrincipal) },
];

function StatCard({ def, overview }) {
  return (
    <article className={`card h-100 dashboard-stat dashboard-stat-${def.tone}`}>
      <div className="card-body d-flex justify-content-between align-items-start gap-3">
        <div className="min-w-0">
          <p className="dashboard-stat-label mb-1">{def.label}</p>
          <div className="dashboard-stat-value text-nowrap ofc-num" style={{ fontSize: "clamp(1.1rem, 1.5vw, 1.45rem)" }}>{def.value(overview)}</div>
        </div>
        <span className="dashboard-stat-icon" style={{ width: "2.4rem", height: "2.4rem" }} aria-hidden="true">
          <def.icon size={17} />
        </span>
      </div>
    </article>
  );
}

function AccountDistribution({ overview }) {
  const total = Number(overview?.accounts?.accountCount ?? 0);
  const active = Number(overview?.accounts?.activeAccounts ?? 0);
  const other = Math.max(total - active, 0);
  if (total === 0) return <p className="small text-body-secondary mb-0">No accounts are registered yet.</p>;
  const activePct = (active / total) * 100;
  const gradient = `conic-gradient(var(--fn-chartreuse-dark) 0% ${activePct}%, var(--fn-lavender) ${activePct}% 100%)`;
  return (
    <div className="lt-donut-wrap">
      <div className="lt-donut" style={{ background: gradient }} role="img"
        aria-label={`${active} of ${total} accounts are active (${activePct.toFixed(0)} percent)`}>
        <div className="lt-donut-hole"><strong>{total}</strong><small>total accounts</small></div>
      </div>
      <div className="db-legend">
        <div className="db-legend-row">
          <span className="dot" style={{ background: "var(--fn-chartreuse-dark)" }} />
          <span>Active</span>
          <span className="db-kpi-foot">{activePct.toFixed(0)}%</span>
          <span className="amt">{active}</span>
        </div>
        <div className="db-legend-row">
          <span className="dot" style={{ background: "var(--fn-lavender)" }} />
          <span>Frozen / closed</span>
          <span className="db-kpi-foot">{(100 - activePct).toFixed(0)}%</span>
          <span className="amt">{other}</span>
        </div>
      </div>
    </div>
  );
}

function PanelCard({ id, title, Icon, action, children, className = "" }) {
  return (
    <section className={`card border-0 shadow-sm ${className}`} aria-labelledby={id}>
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h2 id={id} className="h6 mb-0 d-inline-flex align-items-center gap-2">
            {Icon && <Icon size={16} className="text-lav" aria-hidden="true" />} {title}
          </h2>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

/* ================================================================ */

export default function AdminCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get("view") || "";
  const view = VIEWS.some((v) => v.key === rawView) ? rawView : "";
  const meta = VIEWS.find((v) => v.key === view);
  const loanParam = (searchParams.get("loans") || "APPROVED").toUpperCase();
  const loanTab = LOAN_TABS.some((t) => t.value === loanParam) ? loanParam : "APPROVED";
  const kycParam = (searchParams.get("kyc") || "PENDING").toUpperCase();
  const kycTab = KYC_TABS.some((t) => t.value === kycParam) ? kycParam : "PENDING";
  const windowParam = searchParams.get("window") || "30";
  const windowValue = WINDOWS.some((w) => w.value === windowParam) ? windowParam : "30";

  const isOverview = view === "";
  const isLoans = view === "loans";
  const isOfficers = view === "officers";
  const isKyc = view === "kyc";
  const isUsers = view === "users";
  const isProducts = view === "products";
  const isAudit = view === "audit";

  /* Page numbers reset when their filter changes. */
  const [loanPaging, setLoanPaging] = useState({ key: "", page: 0 });
  const loanPage = loanPaging.key === loanTab ? loanPaging.page : 0;
  const [kycDraft, setKycDraft] = useState("");
  const [kycQuery, setKycQuery] = useState("");
  const kycKey = `${kycTab}|${kycQuery}`;
  const [kycPaging, setKycPaging] = useState({ key: "", page: 0 });
  const kycPage = kycPaging.key === kycKey ? kycPaging.page : 0;

  const [userDraft, setUserDraft] = useState(EMPTY_USER_FILTERS);
  const [userFilters, setUserFilters] = useState(EMPTY_USER_FILTERS);
  const [userPage, setUserPage] = useState(0);
  const [perfPage, setPerfPage] = useState(0);

  const [streamActor, setStreamActor] = useState("");
  const [streamKind, setStreamKind] = useState("");
  const [streamPage, setStreamPage] = useState(0);

  const [auditDraft, setAuditDraft] = useState(EMPTY_AUDIT_FILTERS);
  const [auditFilters, setAuditFilters] = useState(EMPTY_AUDIT_FILTERS);
  const [auditPage, setAuditPage] = useState(0);
  const [auditFormError, setAuditFormError] = useState("");

  const [loanPanel, setLoanPanel] = useState(null);
  const [kycPanel, setKycPanel] = useState(null);
  const [loanDialog, setLoanDialog] = useState(null);
  const [loanBusy, setLoanBusy] = useState(false);
  const [loanError, setLoanError] = useState("");
  const [dialog, setDialog] = useState(null);
  const [activating, setActivating] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");
  const [officerOpen, setOfficerOpen] = useState(false);
  const [creatingOfficer, setCreatingOfficer] = useState(false);
  const [officerError, setOfficerError] = useState("");
  const [creditOpen, setCreditOpen] = useState(false);

  const loanSeq = useRef(0);
  const kycSeq = useRef(0);
  const submitLock = useRef(false); /* blocks double submits before React re-renders */
  const topRef = useRef(null);
  const firstView = useRef(true);

  useEffect(() => {
    if (firstView.current) { firstView.current = false; return; }
    topRef.current?.scrollIntoView({ block: "start" });
  }, [view]);

  /* ---------- panels (each loads only while its view is open) ---------- */

  const staff = usePanel(
    async (signal) => {
      const get = (role) => http.get("/admin/users", { signal, params: { role, page: 0, size: 100, sortBy: "createdAt", sortDirection: "DESC" } })
        .then((r) => r.data?.items ?? []);
      const [officers, admins] = await Promise.all([get("LOAN_OFFICER"), get("ADMIN")]);
      return [...officers, ...admins];
    },
    "staff",
    "Staff directory could not be loaded.",
    friendlyError,
  );

  const dashboard = usePanel(
    (signal) => (isOverview ? http.get("/dashboard", { signal }).then((r) => r.data) : Promise.resolve(null)),
    `dashboard|${isOverview}`,
    "Bank overview could not be loaded.",
    friendlyError,
  );

  const attention = usePanel(
    async () => {
      if (!isOverview) return null;
      const [queue, kycPending, ...pipeline] = await Promise.all([
        listLoanApplications({ page: 0, size: 5, status: "APPROVED" }),
        totalOf("/officer/kyc", { status: "PENDING" }).catch(() => null),
        ...PIPELINE.map((stage) =>
          Promise.all(stage.statuses.map((status) => totalOf("/loan-applications", { status }).catch(() => null)))
            .then((values) => (values.every((v) => v === null) ? null : values.reduce((sum, v) => sum + (v ?? 0), 0)))),
      ]);
      const stages = PIPELINE.map((stage, i) => ({ ...stage, value: pipeline[i] }));
      return { queue, kycPending, stages };
    },
    `attention|${isOverview}`,
    "Work queues could not be loaded.",
    friendlyError,
  );

  const health = usePanel(
    (signal) => (isOverview
      ? getHealth(signal).then((data) => {
        if (data?.scope !== "APPLICATION_ONLY" || !data?.status) throw new Error("Unexpected health response");
        return data;
      })
      : Promise.resolve(null)),
    `health|${isOverview}`,
    "API health could not be verified.",
    friendlyError,
  );

  const recentAudit = usePanel(
    (signal) => (isOverview ? http.get("/audit-logs", { signal, params: { page: 0, size: 6 } }).then((r) => r.data) : Promise.resolve(null)),
    `recentAudit|${isOverview}`,
    "Activity feed unavailable.",
    friendlyError,
  );

  const recentDecisions = usePanel(
    (signal) => (isOverview ? http.get("/admin/decisions", { signal, params: { page: 0, size: 6 } }).then((r) => r.data) : Promise.resolve(null)),
    `recentDecisions|${isOverview}`,
    "Recent decisions could not be loaded.",
    friendlyError,
  );

  const loans = usePanel(
    () => (isLoans
      ? listLoanApplications({ page: loanPage, size: PAGE_SIZE, ...(loanTab !== "ALL" ? { status: loanTab } : {}) })
      : Promise.resolve(null)),
    JSON.stringify(["loans", isLoans, loanPage, loanTab]),
    "Loan applications could not be loaded.",
    friendlyError,
  );

  const decisionWindow = usePanel(
    (signal) => (isOfficers ? fetchDecisionWindow(windowValue, signal) : Promise.resolve(null)),
    JSON.stringify(["decisions", isOfficers, windowValue]),
    "Officer activity could not be loaded.",
    friendlyError,
  );

  const kycCounts = usePanel(
    async () => {
      if (!isKyc) return null;
      const values = await Promise.all(["PENDING", "VERIFIED", "REJECTED"].map((status) => totalOf("/officer/kyc", { status }).catch(() => null)));
      return { PENDING: values[0], VERIFIED: values[1], REJECTED: values[2] };
    },
    `kycCounts|${isKyc}`,
    "KYC counts could not be loaded.",
    friendlyError,
  );

  const kyc = usePanel(
    (signal) => (isKyc
      ? http.get("/officer/kyc", {
        signal,
        params: { page: kycPage, size: PAGE_SIZE, ...(kycTab !== "ALL" ? { status: kycTab } : {}), ...(kycQuery ? { q: kycQuery } : {}) },
      }).then((r) => r.data)
      : Promise.resolve(null)),
    JSON.stringify(["kyc", isKyc, kycPage, kycTab, kycQuery]),
    "KYC records could not be loaded.",
    friendlyError,
  );

  const users = usePanel(
    (signal) => (isUsers
      ? http.get("/admin/users", {
        signal,
        params: {
          page: userPage, size: PAGE_SIZE, sortBy: "createdAt", sortDirection: "DESC",
          ...(userFilters.q ? { q: userFilters.q } : {}),
          ...(userFilters.role ? { role: userFilters.role } : {}),
          ...(userFilters.enabled !== "" ? { enabled: userFilters.enabled === "true" } : {}),
        },
      }).then((r) => r.data)
      : Promise.resolve(null)),
    JSON.stringify(["users", isUsers, userPage, userFilters]),
    "Users could not be loaded.",
    friendlyError,
  );

  const performance = usePanel(
    (signal) => (isProducts
      ? http.get("/reports/product-performance", { signal, params: { page: perfPage, size: PAGE_SIZE } }).then((r) => r.data)
      : Promise.resolve(null)),
    JSON.stringify(["perf", isProducts, perfPage]),
    "Product performance could not be loaded.",
    friendlyError,
  );

  const audit = usePanel(
    (signal) => (isAudit
      ? http.get("/audit-logs", {
        signal,
        params: {
          page: auditPage, size: PAGE_SIZE,
          ...(auditFilters.outcome ? { outcome: auditFilters.outcome } : {}),
          ...(auditFilters.eventType ? { eventType: auditFilters.eventType } : {}),
          ...(auditFilters.q ? { q: auditFilters.q } : {}),
          ...(auditFilters.from ? { from: auditFilters.from } : {}),
          ...(auditFilters.to ? { to: auditFilters.to } : {}),
        },
      }).then((r) => r.data)
      : Promise.resolve(null)),
    JSON.stringify(["audit", isAudit, auditPage, auditFilters]),
    "Audit logs could not be loaded.",
    friendlyError,
  );

  const viewPanels = {
    "": [dashboard, attention, health, recentAudit, recentDecisions],
    loans: [loans],
    officers: [decisionWindow],
    kyc: [kycCounts, kyc],
    users: [users],
    products: [performance],
    audit: [audit],
  }[view];
  const anyLoading = [staff, ...viewPanels].some((p) => p.status === "loading");

  const staffList = staff.data ?? [];
  const staffMap = new Map(staffList.map((u) => [Number(u.id), u]));
  const overview = dashboard.data;
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function refreshView() {
    staff.reload();
    viewPanels.forEach((p) => p.reload());
    window.dispatchEvent(new Event(ADMIN_REFRESH_EVENT));
  }

  function updateParams(changes) {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next);
  }

  function goView(key, extra = {}) {
    const next = new URLSearchParams();
    if (key) next.set("view", key);
    Object.entries(extra).forEach(([k, v]) => { if (v) next.set(k, v); });
    setSearchParams(next);
  }

  /* ---------- loan review drawer ---------- */

  const openLoan = useCallback(async (app) => {
    const seq = ++loanSeq.current;
    setLoanPanel({ app, data: null, loading: true, error: "" });
    try {
      const [fresh, product, quote, history, kycResult] = await Promise.all([
        getLoanApplication(app.id).catch(() => app),
        getLoanProduct(app.productId).catch(() => null),
        fetchQuote(app),
        getLoanApplicationHistory(app.id).catch(() => null),
        findKycForCustomer(app.customerId).then((record) => ({ ok: true, record })).catch(() => ({ ok: false, record: null })),
      ]);
      if (seq !== loanSeq.current) return;
      setLoanPanel({
        app: fresh,
        data: { ...buildChecks(fresh, product, quote, kycResult), history: history?.items ?? [] },
        loading: false,
        error: "",
      });
    } catch (error) {
      if (seq !== loanSeq.current) return;
      setLoanPanel({ app, data: null, loading: false, error: friendlyError(error, "Application details could not be loaded.") });
    }
  }, []);

  const closeLoan = useCallback(() => {
    loanSeq.current += 1;
    setLoanPanel(null);
  }, []);

  const openKyc = useCallback(async (item) => {
    const seq = ++kycSeq.current;
    setKycPanel({ item, loading: true, error: "" });
    try {
      const { data } = await http.get(`/officer/kyc/${item.id}`);
      if (seq === kycSeq.current) setKycPanel({ item: data, loading: false, error: "" });
    } catch (error) {
      if (seq === kycSeq.current) setKycPanel({ item, loading: false, error: friendlyError(error, "KYC details could not be loaded.") });
    }
  }, []);

  const closeKyc = useCallback(() => {
    kycSeq.current += 1;
    setKycPanel(null);
  }, []);

  function openLoanDecision(app, action) {
    if (loanBusy) return;
    setLoanError("");
    setLoanDialog({ app, action });
  }

  async function submitLoanDecision(reason) {
    if (!loanDialog || submitLock.current) return;
    submitLock.current = true;
    const { app, action } = loanDialog;
    setLoanBusy(true);
    setLoanError("");
    setNotice("");
    try {
      if (action === "disburse") {
        const loan = await disburseLoanApplication(app.id, reason);
        setNotice(`Application #${app.id} approved. ${money(loan?.principal ?? app.principal)} was credited to account #${loan?.accountId ?? app.accountId}`
          + `${loan?.id ? ` (loan #${loan.id}` : ""}${loan?.emi ? `, EMI ${money(loan.emi)} per month)` : loan?.id ? ")" : ""}.`);
      } else {
        await staffLoanApplicationAction(app.id, "reject", reason);
        setNotice(`Application #${app.id} was rejected. Your reason was recorded.`);
      }
      setLoanDialog(null);
      closeLoan();
      loans.reload();
      attention.reload();
      dashboard.reload();
      recentDecisions.reload();
      window.dispatchEvent(new Event(ADMIN_REFRESH_EVENT));
    } catch (error) {
      setLoanError(friendlyError(error, "The final decision could not be completed. Nothing was changed."));
    } finally {
      submitLock.current = false;
      setLoanBusy(false);
    }
  }

  /* ---------- users ---------- */

  function applyUserFilters(event) {
    event.preventDefault();
    setUserPage(0);
    setUserFilters({ q: userDraft.q.trim(), role: userDraft.role, enabled: userDraft.enabled });
  }

  function openActivation(user) {
    setDialogError("");
    setNotice("");
    setDialog({ user, nextActive: !user.enabled });
  }

  async function submitActivation(reason) {
    if (!dialog || submitLock.current) return;
    submitLock.current = true;
    setActivating(true);
    setDialogError("");
    setNotice("");
    try {
      await http.put(`/admin/users/${dialog.user.id}/activation`, { active: dialog.nextActive, reason });
      setNotice(`User ${dialog.user.email} was ${dialog.nextActive ? "activated" : "deactivated"}.`);
      setDialog(null);
      users.reload();
      staff.reload();
    } catch (error) {
      setDialogError(friendlyError(error, "The user could not be updated. Check the reason and try again."));
    } finally {
      submitLock.current = false;
      setActivating(false);
    }
  }

  async function submitNewOfficer(payload) {
    if (submitLock.current) return;
    submitLock.current = true;
    setCreatingOfficer(true);
    setOfficerError("");
    setNotice("");
    try {
      const response = await http.post("/admin/users", payload);
      setNotice(`Officer account created for ${response.data.email}. They can sign in now.`);
      setOfficerOpen(false);
      users.reload();
      staff.reload();
    } catch (error) {
      const fieldErrors = error.response?.data?.fieldErrors;
      setOfficerError(
        Array.isArray(fieldErrors) && fieldErrors.length > 0
          ? fieldErrors.map((item) => `${item.field}: ${item.message || "invalid"}`).join(" / ")
          : friendlyError(error, "The officer account could not be created.")
      );
    } finally {
      submitLock.current = false;
      setCreatingOfficer(false);
    }
  }

  /* ---------- audit ---------- */

  function applyAuditFilters(event) {
    event.preventDefault();
    const eventType = auditDraft.eventType.trim().toUpperCase();
    if (eventType && !EVENT_PATTERN.test(eventType)) {
      setAuditFormError("Event type may contain only letters, digits and underscores (up to 64).");
      return;
    }
    if (auditDraft.from && auditDraft.to && auditDraft.from > auditDraft.to) {
      setAuditFormError("The start date must not be after the end date.");
      return;
    }
    setAuditFormError("");
    setAuditPage(0);
    setAuditFilters({ outcome: auditDraft.outcome, eventType, q: auditDraft.q.trim(), from: auditDraft.from, to: auditDraft.to });
  }

  function resetAuditFilters() {
    setAuditFormError("");
    setAuditDraft(EMPTY_AUDIT_FILTERS);
    setAuditPage(0);
    setAuditFilters(EMPTY_AUDIT_FILTERS);
  }

  /* ---------- officer activity aggregation ---------- */

  const windowData = decisionWindow.data;
  const decisionItems = windowData?.items ?? [];
  const roster = (() => {
    const rows = new Map();
    const blank = () => ({ started: 0, forwarded: 0, info: 0, rejected: 0, paidOut: 0, kycVerified: 0, kycRejected: 0, other: 0, total: 0, last: null });
    staffList.filter((u) => u.role === "LOAN_OFFICER").forEach((u) => rows.set(Number(u.id), { id: Number(u.id), user: u, role: u.role, ...blank() }));
    decisionItems.forEach((item) => {
      const id = Number(item.actorId);
      if (!rows.has(id)) rows.set(id, { id, user: staffMap.get(id) || null, role: staffMap.get(id)?.role || item.actorRole, ...blank() });
      const row = rows.get(id);
      row[decisionKind(item)] += 1;
      row.total += 1;
      const at = toDate(item.occurredAt);
      if (at && (!row.last || at > row.last)) row.last = at;
    });
    return [...rows.values()].sort((a, b) => b.total - a.total || String(a.user?.fullName || "").localeCompare(String(b.user?.fullName || "")));
  })();
  const streamItems = decisionItems
    .filter((item) => !streamActor || String(item.actorId) === streamActor)
    .filter((item) => !streamKind || decisionKind(item) === streamKind)
    .sort((a, b) => (toDate(b.occurredAt)?.getTime() ?? 0) - (toDate(a.occurredAt)?.getTime() ?? 0));
  const streamPages = Math.max(1, Math.ceil(streamItems.length / STREAM_PAGE_SIZE));
  const safeStreamPage = Math.min(streamPage, streamPages - 1);
  const streamInfo = {
    items: streamItems.slice(safeStreamPage * STREAM_PAGE_SIZE, (safeStreamPage + 1) * STREAM_PAGE_SIZE),
    page: safeStreamPage, total: streamItems.length, totalPages: streamPages,
    hasPrev: safeStreamPage > 0, hasNext: safeStreamPage + 1 < streamPages,
  };

  /* ---------- derived ---------- */

  const loanInfo = pageInfo(loans.data, PAGE_SIZE);
  const kycInfo = pageInfo(kyc.data, PAGE_SIZE);
  const userInfo = pageInfo(users.data, PAGE_SIZE);
  const perfInfo = pageInfo(performance.data, PAGE_SIZE);
  const auditInfo = pageInfo(audit.data, PAGE_SIZE);
  const outstandingSum = perfInfo.items.reduce((sum, item) => sum + Number(item.currentOutstanding || 0), 0);
  const queueInfo = pageInfo(attention.data?.queue, 5);
  const forwardedTotal = attention.data ? (queueInfo.total ?? queueInfo.items.length) : null;
  const pipelineMax = Math.max(1, ...(attention.data?.stages ?? []).map((s) => Number(s.value ?? 0)));

  const panelApp = loanPanel?.app;
  const panelStatus = String(panelApp?.status || "").toUpperCase();
  const assessment = loanPanel?.data;
  const forwardedBy = panelApp?.approvedBy ? staffName(staffMap, panelApp.approvedBy, "LOAN_OFFICER") : null;
  const kycBlocked = assessment ? assessment.kycStatus !== "VERIFIED" && assessment.kycStatus !== "UNKNOWN" : false;

  const loanFooter = panelApp ? (
    panelStatus === "APPROVED" ? (
      <>
        <span className="ofc-hint me-auto">
          {loanPanel.loading ? "Loading verification details..." : kycBlocked ? `Payout blocked: KYC is ${assessment.kycStatus}.` : "Final decision, recorded with your reason."}
        </span>
        <button type="button" className="btn btn-outline-danger" disabled={loanBusy} onClick={() => openLoanDecision(panelApp, "reject")}>
          Reject
        </button>
        <button type="button" className="btn btn-accent d-inline-flex align-items-center gap-2"
          disabled={loanBusy || loanPanel.loading || kycBlocked} onClick={() => openLoanDecision(panelApp, "disburse")}>
          <BadgeCheck size={16} aria-hidden="true" /> Approve &amp; pay out
        </button>
      </>
    ) : (
      <>
        <span className="ofc-hint me-auto">
          {["SUBMITTED", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED"].includes(panelStatus)
            ? "A loan officer must verify and forward this application before you can decide."
            : "No admin action is available for this status."}
        </span>
        <button type="button" className="btn btn-outline-secondary" onClick={closeLoan}>Close</button>
      </>
    )
  ) : null;

  /* ================================================================ */

  return (
    <section className="vstack gap-4 dashboard-page adm-page" ref={topRef}>
      <div className="ofc-banner d-flex flex-wrap justify-content-between align-items-end gap-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1">FINNOVA BANK / ADMINISTRATION</p>
          <h1 className="mb-1">{meta.title}</h1>
          <p className="sub mb-0">{meta.sub}</p>
        </div>
        <div className="d-flex flex-column align-items-end gap-2">
          <span className="small fw-semibold">{today}</span>
          <button type="button" className="btn btn-dark d-inline-flex align-items-center gap-2" onClick={refreshView} disabled={anyLoading}>
            <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
            {anyLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <nav className="adm-tabs" aria-label="Admin sections">
        {VIEWS.map((v) => (
          <button key={v.key || "overview"} type="button" className={`fn-chip ${view === v.key ? "active" : ""}`}
            aria-current={view === v.key ? "page" : undefined} onClick={() => goView(v.key)}>
            {v.label}
          </button>
        ))}
      </nav>

      {notice && (
        <div className="alert alert-success d-flex justify-content-between align-items-start gap-2 mb-0" role="status">
          <span>{notice}</span>
          <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setNotice("")} />
        </div>
      )}

      {/* ======================= OVERVIEW ======================= */}
      {isOverview && (
        <>
          {dashboard.status === "error" && !dashboard.data ? (
            <ErrorBlock message={dashboard.message} onRetry={dashboard.reload} />
          ) : !dashboard.data ? (
            <Loading label="Loading bank overview..." />
          ) : (
            <div className="row g-3" aria-busy={dashboard.status === "loading"}>
              {BIG_METRICS.map((def) => (
                <div className="col-12 col-sm-6 col-xl-3" key={def.key}><StatCard def={def} overview={overview} /></div>
              ))}
            </div>
          )}

          <div className="row g-4">
            <div className="col-12 col-xl-8 vstack gap-4">
              <PanelCard id="adm-attention" title="Needs your attention" Icon={Gavel}>
                {attention.status === "error" && !attention.data ? (
                  <ErrorBlock message={attention.message} onRetry={attention.reload} />
                ) : !attention.data ? (
                  <Loading label="Checking work queues..." />
                ) : (
                  <>
                    <div className="adm-attn-grid">
                      <button type="button" className={`adm-attn ${forwardedTotal > 0 ? "hot" : ""}`} onClick={() => goView("loans")}>
                        <span className="num">{count(forwardedTotal)}</span>
                        <span className="lbl">Loans awaiting final approval</span>
                      </button>
                      <button type="button" className="adm-attn" onClick={() => goView("loans", { loans: "UNDER_REVIEW" })}>
                        <span className="num">{count(attention.data.stages.filter((s) => ["SUBMITTED", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED"].includes(s.key))
                          .reduce((sum, s) => (s.value === null || sum === null ? null : sum + s.value), 0))}</span>
                        <span className="lbl">Applications with officers</span>
                      </button>
                      <button type="button" className="adm-attn" onClick={() => goView("kyc")}>
                        <span className="num">{count(attention.data.kycPending)}</span>
                        <span className="lbl">KYC checks pending</span>
                      </button>
                      <div className={`adm-attn static ${Number(overview?.loans?.overdueInstallments) > 0 ? "warn" : ""}`}>
                        <span className="num">{count(overview?.loans?.overdueInstallments)}</span>
                        <span className="lbl">Overdue installments</span>
                      </div>
                    </div>

                    <div className="ofc-section-title mt-4 mb-2">Awaiting your final approval</div>
                    {queueInfo.items.length === 0 ? (
                      <p className="small text-body-secondary mb-0">
                        <CircleCheck size={15} className="me-1" aria-hidden="true" />
                        Nothing waiting. Officers have not forwarded any new applications.
                      </p>
                    ) : (
                      <div className="vstack gap-2">
                        {queueInfo.items.map((app) => (
                          <div key={app.id} className="adm-queue-row">
                            <div className="min-w-0">
                              <div className="fw-semibold text-truncate">#{app.id} &middot; {app.productName}</div>
                              <div className="small text-body-secondary text-truncate">
                                Customer #{app.customerId} &middot; {app.months} mo &middot; forwarded by {app.approvedBy ? staffName(staffMap, app.approvedBy, "LOAN_OFFICER") : "an officer"}
                              </div>
                            </div>
                            <div className="fw-bold ofc-num text-nowrap">{moneyShort(app.principal)}</div>
                            <button type="button" className="btn btn-sm btn-accent d-inline-flex align-items-center gap-1" onClick={() => openLoan(app)}>
                              <Eye size={14} aria-hidden="true" /> Review
                            </button>
                          </div>
                        ))}
                        {forwardedTotal > queueInfo.items.length && (
                          <button type="button" className="btn btn-link btn-sm align-self-start p-0" onClick={() => goView("loans")}>
                            View all {forwardedTotal} in the approval queue
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </PanelCard>

              <PanelCard id="adm-pipeline" title="Loan pipeline" Icon={HandCoins}
                action={<span className="small text-body-secondary">Current status of every submitted application</span>}>
                {!attention.data ? (
                  attention.status === "error" ? <ErrorBlock message={attention.message} onRetry={attention.reload} /> : <Loading label="Counting applications..." />
                ) : (
                  <div className="vstack gap-2">
                    {attention.data.stages.map((stage) => (
                      <button key={stage.key} type="button" className="adm-pipe-row" onClick={() => goView("loans", { loans: stage.tab })}
                        aria-label={`${stage.label}: ${stage.value ?? "unavailable"}. Open list.`}>
                        <span className="lbl">{stage.label}</span>
                        <span className="share-track adm-pipe-track" aria-hidden="true">
                          <span className={stage.action ? "action" : ""} style={{ width: `${stage.value ? Math.max((stage.value / pipelineMax) * 100, 3) : 0}%` }} />
                        </span>
                        <span className="val ofc-num">{stage.value ?? "-"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </PanelCard>

              <div className="row g-4">
                <div className="col-12 col-lg-6">
                  <PanelCard id="adm-recent-decisions" title="Latest staff decisions" Icon={UserCheck} className="h-100"
                    action={<button type="button" className="btn btn-link btn-sm p-0" onClick={() => goView("officers")}>All activity</button>}>
                    {recentDecisions.status === "error" && !recentDecisions.data ? (
                      <ErrorBlock message={recentDecisions.message} onRetry={recentDecisions.reload} />
                    ) : !recentDecisions.data ? (
                      <Loading label="Loading decisions..." />
                    ) : (recentDecisions.data.items ?? []).length === 0 ? (
                      <p className="small text-body-secondary mb-0">No decisions recorded yet.</p>
                    ) : (
                      (recentDecisions.data.items ?? []).map((item) => (
                        <div className="act-row" key={item.id}>
                          <span className={`act-dot ${decisionKind(item) === "rejected" || decisionKind(item) === "kycRejected" ? "FAILURE" : "SUCCESS"}`} aria-hidden="true" />
                          <div className="min-w-0">
                            <div className="act-title text-truncate">{KIND_LABEL[decisionKind(item)]} &middot; #{item.resourceId}</div>
                            <div className="act-meta">{staffName(staffMap, item.actorId, item.actorRole)} &middot; {dateTime(item.occurredAt)}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </PanelCard>
                </div>
                <div className="col-12 col-lg-6">
                  <PanelCard id="adm-recent-audit" title="Recent audit events" Icon={Activity} className="h-100"
                    action={<button type="button" className="btn btn-link btn-sm p-0" onClick={() => goView("audit")}>Full log</button>}>
                    {recentAudit.status === "error" && !recentAudit.data ? (
                      <ErrorBlock message={recentAudit.message} onRetry={recentAudit.reload} />
                    ) : !recentAudit.data ? (
                      <Loading label="Loading activity..." />
                    ) : (recentAudit.data.items ?? []).length === 0 ? (
                      <p className="small text-body-secondary mb-0">No audit events recorded yet.</p>
                    ) : (
                      (recentAudit.data.items ?? []).slice(0, 6).map((entry) => (
                        <div className="act-row" key={entry.id}>
                          <span className={`act-dot ${entry.outcome || ""}`} aria-hidden="true" />
                          <div className="min-w-0">
                            <div className="act-title font-monospace text-truncate">{entry.eventType}</div>
                            <div className="act-meta">
                              {entry.actorUserId ? staffName(staffMap, entry.actorUserId, entry.actorRole) : (entry.actorRole ?? entry.actorType ?? "System")} &middot; {dateTime(entry.occurredAt)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </PanelCard>
                </div>
              </div>
            </div>

            <div className="col-12 col-xl-4 vstack gap-4">
              <PanelCard id="adm-qa" title="Quick actions">
                <div className="vstack gap-2">
                  <button type="button" className="qa-tile text-start" onClick={() => goView("loans")}>
                    <span className="qa-ico pos"><Gavel size={16} aria-hidden="true" /></span>Review final approvals
                  </button>
                  <button type="button" className="qa-tile text-start" onClick={() => setCreditOpen(true)}>
                    <span className="qa-ico pos"><HandCoins size={16} aria-hidden="true" /></span>Credit money to an account
                  </button>
                  <button type="button" className="qa-tile text-start" onClick={() => { setOfficerError(""); setOfficerOpen(true); }}>
                    <span className="qa-ico lav"><UserPlus size={16} aria-hidden="true" /></span>Add a loan officer
                  </button>
                  <button type="button" className="qa-tile text-start" onClick={() => goView("officers")}>
                    <span className="qa-ico lav"><UserCheck size={16} aria-hidden="true" /></span>Officer activity
                  </button>
                  <Link className="qa-tile" to="/officer">
                    <span className="qa-ico sky"><ClipboardCheck size={16} aria-hidden="true" /></span>Open officer workspace
                  </Link>
                </div>
              </PanelCard>

              <PanelCard id="adm-dist" title="Account distribution" Icon={PieChart}>
                {!overview ? <Loading label="Computing..." /> : <AccountDistribution overview={overview} />}
              </PanelCard>

              <PanelCard id="adm-health" title="System health" Icon={HeartPulse}>
                {health.status === "error" && !health.data ? (
                  <ErrorBlock message={health.message} onRetry={health.reload} />
                ) : !health.data ? (
                  <Loading label="Checking API..." />
                ) : (
                  <>
                    <div className="health-row">
                      <span className="small fw-semibold">API server</span>
                      <span className={health.data.status === "UP" ? "status-chip pos" : "status-chip pending"}>
                        {health.data.status === "UP" ? "Online" : health.data.status}
                      </span>
                    </div>
                    <p className="small text-body-secondary mt-2 mb-2">Application liveness only, from the /health endpoint.</p>
                    <Link to="/system-status" className="qa-tile justify-content-center">Open full status page</Link>
                  </>
                )}
              </PanelCard>
            </div>
          </div>
          {overview?.dateFilterMeaning && <p className="small text-body-secondary mb-0">{overview.dateFilterMeaning}</p>}
        </>
      )}

      {/* ======================= FINAL APPROVALS ======================= */}
      {isLoans && (
        <section className="card border-0 shadow-sm" aria-labelledby="adm-loans-title">
          <div className="card-body">
            <h2 id="adm-loans-title" className="visually-hidden">Loan applications</h2>
            <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter by status">
              {LOAN_TABS.map((tab) => (
                <button key={tab.value} type="button" className={`fn-chip ${loanTab === tab.value ? "active" : ""}`}
                  aria-pressed={loanTab === tab.value} onClick={() => updateParams({ loans: tab.value === "APPROVED" ? null : tab.value })}>
                  {tab.label}
                </button>
              ))}
            </div>
            {loanTab === "APPROVED" && (
              <div className="ofc-callout info mb-3">
                These applications were verified and forwarded by a loan officer. Open one to check KYC, the EMI and its history,
                then approve (the principal is paid into the customer&apos;s account) or reject with a reason.
              </div>
            )}
            {loans.status === "error" && !loans.data ? (
              <ErrorBlock message={loans.message} onRetry={loans.reload} />
            ) : !loans.data ? (
              <Loading label="Loading applications..." />
            ) : (
              <>
                <div className="table-responsive ofc-table-wrap" aria-busy={loans.status === "loading"}>
                  <table className="table table-hover align-middle mb-0 ofc-table adm-table-loans">
                    <caption className="visually-hidden">Loan applications</caption>
                    <thead>
                      <tr>
                        <th scope="col">App</th>
                        <th scope="col">Applicant</th>
                        <th scope="col">Product</th>
                        <th scope="col" className="text-end">Amount</th>
                        <th scope="col">Tenure</th>
                        <th scope="col">Officer</th>
                        <th scope="col" className="ofc-col-status">Status</th>
                        <th scope="col" className="ofc-col-actions text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanInfo.items.map((app) => {
                        const st = String(app.status || "").toUpperCase();
                        const officerId = app.approvedBy || app.assignedOfficerId;
                        return (
                          <tr key={app.id} className={Number(panelApp?.id) === Number(app.id) ? "table-active" : ""}>
                            <th scope="row" className="text-nowrap">#{app.id}</th>
                            <td>
                              <div className="fw-semibold text-nowrap">Customer #{app.customerId}</div>
                              <div className="small text-body-secondary text-nowrap">A/c #{app.accountId}</div>
                            </td>
                            <td className="ofc-col-product">
                              <div className="fw-semibold text-truncate" title={app.productName}>{app.productName}</div>
                              <div className="small text-body-secondary">{rate(app.annualRate)} p.a.</div>
                            </td>
                            <td className="text-end text-nowrap fw-semibold ofc-num" title={money(app.principal)}>{moneyShort(app.principal)}</td>
                            <td className="text-nowrap">{app.months} mo</td>
                            <td className="adm-col-officer">
                              {officerId ? (
                                <>
                                  <div className="fw-semibold text-truncate">{staffName(staffMap, officerId, "LOAN_OFFICER")}</div>
                                  <div className="small text-body-secondary">{app.approvedBy ? "Forwarded" : "Assigned"}</div>
                                </>
                              ) : <span className="small text-body-secondary">Unassigned</span>}
                            </td>
                            <td className="text-nowrap ofc-col-status"><span className={statusChipClass(st)}>{loanLabel(st)}</span></td>
                            <td className="ofc-col-actions">
                              <div className="ofc-row-actions">
                                <button type="button" className={`btn btn-sm ${st === "APPROVED" ? "btn-accent" : "btn-outline-primary"}`}
                                  aria-label={`${st === "APPROVED" ? "Review and decide" : "View"} application ${app.id}`} onClick={() => openLoan(app)}>
                                  <Eye size={14} aria-hidden="true" /> {st === "APPROVED" ? "Review" : "View"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {loanInfo.items.length === 0 && (
                        <tr><td colSpan="8" className="text-center text-body-secondary py-4">
                          {loanTab === "APPROVED" ? "No applications are waiting for your final approval." : "No applications match this filter."}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager info={loanInfo} onPage={(page) => setLoanPaging({ key: loanTab, page })} label="Loan application pages" />
              </>
            )}
          </div>
        </section>
      )}

      {/* ======================= OFFICER ACTIVITY ======================= */}
      {isOfficers && (
        <>
          <div className="d-flex flex-wrap align-items-center gap-2" role="group" aria-label="Time window">
            {WINDOWS.map((w) => (
              <button key={w.value} type="button" className={`fn-chip ${windowValue === w.value ? "active" : ""}`}
                aria-pressed={windowValue === w.value} onClick={() => { setStreamPage(0); updateParams({ window: w.value === "30" ? null : w.value }); }}>
                {w.label}
              </button>
            ))}
            {windowData && (
              <span className="small text-body-secondary ms-md-auto">
                {windowData.truncated
                  ? `Based on the latest ${windowData.items.length} of ${windowData.total} decisions. Choose a shorter window for exact totals.`
                  : `${windowData.total} decision${windowData.total === 1 ? "" : "s"} in this window.`}
              </span>
            )}
          </div>

          <PanelCard id="adm-roster" title="Per-officer summary" Icon={UserCheck}>
            {decisionWindow.status === "error" && !decisionWindow.data ? (
              <ErrorBlock message={decisionWindow.message} onRetry={decisionWindow.reload} />
            ) : !decisionWindow.data || (staff.status === "loading" && !staff.data) ? (
              <Loading label="Collecting decisions..." />
            ) : (
              <div className="table-responsive ofc-table-wrap" aria-busy={decisionWindow.status === "loading"}>
                <table className="table table-hover align-middle mb-0 ofc-table adm-table-roster">
                  <thead>
                    <tr>
                      <th scope="col">Staff member</th>
                      <th scope="col" className="text-end">Reviews</th>
                      <th scope="col" className="text-end">Forwarded</th>
                      <th scope="col" className="text-end">Info req.</th>
                      <th scope="col" className="text-end">Rejected</th>
                      <th scope="col" className="text-end">Paid out</th>
                      <th scope="col" className="text-end">KYC ok</th>
                      <th scope="col" className="text-end">KYC rej.</th>
                      <th scope="col" className="text-end">Total</th>
                      <th scope="col">Last action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((row) => (
                      <tr key={row.id}>
                        <td className="ofc-col-customer">
                          <button type="button" className="btn btn-link p-0 fw-semibold text-start text-decoration-none"
                            onClick={() => { setStreamActor(String(row.id)); setStreamPage(0); document.getElementById("adm-stream")?.scrollIntoView({ block: "start" }); }}>
                            {row.user ? row.user.fullName : staffName(staffMap, row.id, row.role)}
                          </button>
                          <div className="small text-body-secondary text-truncate">
                            {String(row.role || "").replaceAll("_", " ").toLowerCase()}
                            {row.user && !row.user.enabled ? " / disabled" : ""}
                          </div>
                        </td>
                        {["started", "forwarded", "info", "rejected", "paidOut", "kycVerified", "kycRejected"].map((key) => (
                          <td key={key} className={`text-end ofc-num ${row[key] === 0 ? "text-body-secondary" : ""}`}>{row[key]}</td>
                        ))}
                        <td className="text-end ofc-num fw-bold">{row.total}</td>
                        <td className="small text-nowrap">{row.last ? dateTime(row.last) : <span className="text-body-secondary">No activity</span>}</td>
                      </tr>
                    ))}
                    {roster.length === 0 && (
                      <tr><td colSpan="10" className="text-center text-body-secondary py-4">No officers or decisions found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </PanelCard>

          <section className="card border-0 shadow-sm" aria-labelledby="adm-stream">
            <div className="card-body">
              <div className="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
                <h2 id="adm-stream" className="h6 mb-0 d-inline-flex align-items-center gap-2 ofc-anchor">
                  <FileText size={16} className="text-lav" aria-hidden="true" /> Decision stream
                </h2>
                <div className="d-flex flex-wrap gap-2">
                  <select className="form-select form-select-sm adm-select" aria-label="Filter by staff member" value={streamActor}
                    onChange={(e) => { setStreamActor(e.target.value); setStreamPage(0); }}>
                    <option value="">All staff</option>
                    {roster.map((row) => (
                      <option key={row.id} value={String(row.id)}>{row.user ? row.user.fullName : staffName(staffMap, row.id, row.role)}</option>
                    ))}
                  </select>
                  <select className="form-select form-select-sm adm-select" aria-label="Filter by decision" value={streamKind}
                    onChange={(e) => { setStreamKind(e.target.value); setStreamPage(0); }}>
                    <option value="">All decisions</option>
                    {Object.entries(KIND_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </div>
              </div>
              {!decisionWindow.data ? (
                decisionWindow.status === "error" ? <ErrorBlock message={decisionWindow.message} onRetry={decisionWindow.reload} /> : <Loading label="Loading decisions..." />
              ) : (
                <>
                  <div className="table-responsive ofc-table-wrap">
                    <table className="table table-hover align-middle mb-0 ofc-table ofc-table-history">
                      <thead>
                        <tr><th scope="col">When</th><th scope="col">Staff</th><th scope="col">Decision</th><th scope="col">Record</th><th scope="col">Reason</th></tr>
                      </thead>
                      <tbody>
                        {streamInfo.items.map((item) => {
                          const kind = decisionKind(item);
                          return (
                            <tr key={item.id}>
                              <td className="small text-nowrap">{dateTime(item.occurredAt)}</td>
                              <td className="text-nowrap">{staffName(staffMap, item.actorId, item.actorRole)}</td>
                              <td className="text-nowrap"><span className={statusChipClass(kind === "forwarded" ? "APPROVED" : item.decision)}>{KIND_LABEL[kind]}</span></td>
                              <td className="small text-nowrap">{String(item.resourceType || "").includes("KYC") ? "KYC" : "Application"} #{item.resourceId}</td>
                              <td className="small ofc-col-reason">{item.reason || "-"}</td>
                            </tr>
                          );
                        })}
                        {streamInfo.items.length === 0 && (
                          <tr><td colSpan="5" className="text-center text-body-secondary py-4">No decisions match these filters.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Pager info={streamInfo} onPage={setStreamPage} label="Decision stream pages" />
                </>
              )}
            </div>
          </section>
        </>
      )}

      {/* ======================= KYC OVERVIEW ======================= */}
      {isKyc && (
        <section className="card border-0 shadow-sm" aria-labelledby="adm-kyc-title">
          <div className="card-body">
            <h2 id="adm-kyc-title" className="visually-hidden">KYC records</h2>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div className="d-flex flex-wrap gap-2" role="group" aria-label="Filter by KYC status">
                {KYC_TABS.map((tab) => {
                  const n = kycCounts.data ? kycCounts.data[tab.value] : null;
                  return (
                    <button key={tab.value} type="button" className={`fn-chip ${kycTab === tab.value ? "active" : ""}`}
                      aria-pressed={kycTab === tab.value} onClick={() => updateParams({ kyc: tab.value === "PENDING" ? null : tab.value })}>
                      {tab.label}{n !== null && n !== undefined ? ` (${n})` : ""}
                    </button>
                  );
                })}
              </div>
              <form className="d-flex gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setKycQuery(kycDraft.trim()); }}>
                <input className="form-control form-control-sm adm-search" value={kycDraft} maxLength={100}
                  onChange={(e) => setKycDraft(e.target.value)} placeholder="Name or email" aria-label="Search KYC records" />
                <button type="submit" className="btn btn-sm btn-primary">Search</button>
              </form>
            </div>
            <div className="ofc-callout info mb-3">
              <ShieldCheck size={14} className="me-1" aria-hidden="true" />
              Read-only. Approving or rejecting KYC is a loan officer decision and the server rejects it for admins.
            </div>
            {kyc.status === "error" && !kyc.data ? (
              <ErrorBlock message={kyc.message} onRetry={kyc.reload} />
            ) : !kyc.data ? (
              <Loading label="Loading KYC records..." />
            ) : (
              <>
                <div className="table-responsive ofc-table-wrap" aria-busy={kyc.status === "loading"}>
                  <table className="table table-hover align-middle mb-0 ofc-table ofc-table-kyc">
                    <thead>
                      <tr>
                        <th scope="col">Customer</th>
                        <th scope="col">Document</th>
                        <th scope="col">Submitted</th>
                        <th scope="col" className="ofc-col-status">Status</th>
                        <th scope="col" className="ofc-col-actions text-end">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kycInfo.items.map((item) => (
                        <tr key={item.id}>
                          <td className="ofc-col-customer">
                            <div className="fw-semibold text-truncate">{item.fullName || `Customer #${item.customerId}`}</div>
                            <div className="small text-body-secondary text-truncate">{item.email || `Customer #${item.customerId}`}</div>
                          </td>
                          <td>
                            <div className="fw-semibold text-nowrap">{documentLabel(item.documentType)}</div>
                            <div className="small text-body-secondary font-monospace">{maskReference(item.documentReference)}</div>
                          </td>
                          <td className="small text-nowrap">{dateOnly(item.createdAt)}</td>
                          <td className="ofc-col-status"><span className={statusChipClass(item.status)}>{String(item.status || "-").toLowerCase()}</span></td>
                          <td className="ofc-col-actions">
                            <div className="ofc-row-actions">
                              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openKyc(item)}
                                aria-label={`View KYC record of ${item.fullName || `customer ${item.customerId}`}`}>
                                <Eye size={14} aria-hidden="true" /> View
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {kycInfo.items.length === 0 && (
                        <tr><td colSpan="5" className="text-center text-body-secondary py-4">No KYC records match this filter.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager info={kycInfo} onPage={(page) => setKycPaging({ key: kycKey, page })} label="KYC pages" />
              </>
            )}
          </div>
        </section>
      )}

      {/* ======================= USERS ======================= */}
      {isUsers && (
        <section className="card border-0 shadow-sm" aria-labelledby="adm-users-title">
          <div className="card-body">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h2 id="adm-users-title" className="h6 mb-0 d-inline-flex align-items-center gap-2">
                <Users size={16} className="text-lav" aria-hidden="true" /> Directory
              </h2>
              <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
                onClick={() => { setOfficerError(""); setOfficerOpen(true); }}>
                <UserPlus size={15} aria-hidden="true" /> Add officer
              </button>
            </div>
            <form className="row g-2 mb-3" onSubmit={applyUserFilters}>
              <div className="col-md-5">
                <label htmlFor="adm-user-q" className="form-label small">Search</label>
                <input id="adm-user-q" className="form-control" value={userDraft.q} maxLength={100}
                  onChange={(e) => setUserDraft({ ...userDraft, q: e.target.value })} placeholder="Name or email" />
              </div>
              <div className="col-6 col-md-3">
                <label htmlFor="adm-user-role" className="form-label small">Role</label>
                <select id="adm-user-role" className="form-select" value={userDraft.role}
                  onChange={(e) => setUserDraft({ ...userDraft, role: e.target.value })}>
                  <option value="">All roles</option>
                  <option value="CUSTOMER">Customers</option>
                  <option value="LOAN_OFFICER">Loan officers</option>
                  <option value="ADMIN">Admins</option>
                </select>
              </div>
              <div className="col-6 col-md-2">
                <label htmlFor="adm-user-enabled" className="form-label small">Access</label>
                <select id="adm-user-enabled" className="form-select" value={userDraft.enabled}
                  onChange={(e) => setUserDraft({ ...userDraft, enabled: e.target.value })}>
                  <option value="">All</option>
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
              <div className="col-md-2 d-flex align-items-end">
                <button className="btn btn-primary w-100" type="submit">Apply</button>
              </div>
            </form>
            {users.status === "error" && !users.data ? (
              <ErrorBlock message={users.message} onRetry={users.reload} />
            ) : !users.data ? (
              <Loading label="Loading users..." />
            ) : (
              <>
                <div className="table-responsive ofc-table-wrap" aria-busy={users.status === "loading"}>
                  <table className="table table-hover align-middle mb-0 ofc-table adm-table-users">
                    <thead>
                      <tr>
                        <th scope="col">User</th><th scope="col">Role</th><th scope="col">Access</th><th scope="col">Created</th>
                        <th scope="col" className="ofc-col-actions text-end">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userInfo.items.map((user) => (
                        <tr key={user.id}>
                          <td className="ofc-col-customer">
                            <div className="fw-semibold text-truncate">{user.fullName}</div>
                            <div className="small text-body-secondary text-truncate">{user.email} &middot; #{user.id}</div>
                          </td>
                          <td className="text-nowrap"><span className="status-chip neutral">{String(user.role || "").replaceAll("_", " ").toLowerCase()}</span></td>
                          <td><span className={user.enabled ? "status-chip pos" : "status-chip neutral"}>{user.enabled ? "Enabled" : "Disabled"}</span></td>
                          <td className="small text-nowrap">{dateOnly(user.createdAt)}</td>
                          <td className="ofc-col-actions">
                            <div className="ofc-row-actions">
                              <button type="button" disabled={activating} onClick={() => openActivation(user)}
                                className={`btn btn-sm ${user.enabled ? "btn-outline-danger" : "btn-outline-success"}`}>
                                {user.enabled ? <Ban size={13} aria-hidden="true" /> : <CircleCheck size={13} aria-hidden="true" />}
                                {user.enabled ? " Deactivate" : " Activate"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {userInfo.items.length === 0 && (
                        <tr><td colSpan="5" className="text-center text-body-secondary py-4">No users found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager info={userInfo} onPage={setUserPage} label="User pages" />
              </>
            )}
          </div>
        </section>
      )}

      {/* ======================= PRODUCTS ======================= */}
      {isProducts && (
        <PanelCard id="adm-perf" title="Loan products" Icon={BarChart3}
          action={<Link to="/loan-products" className="btn btn-sm btn-outline-secondary">Product catalogue</Link>}>
          {performance.status === "error" && !performance.data ? (
            <ErrorBlock message={performance.message} onRetry={performance.reload} />
          ) : !performance.data ? (
            <Loading label="Loading product performance..." />
          ) : (
            <>
              <div className="table-responsive ofc-table-wrap" aria-busy={performance.status === "loading"}>
                <table className="table table-hover align-middle mb-0 ofc-table adm-table-perf">
                  <thead>
                    <tr>
                      <th scope="col">Product</th><th scope="col" className="text-end">Applications</th><th scope="col" className="text-end">Requested</th>
                      <th scope="col" className="text-end">Disbursed</th><th scope="col" className="text-end">Repaid</th>
                      <th scope="col" className="text-end">Outstanding</th><th scope="col">Share of outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfInfo.items.map((item) => {
                      const share = outstandingSum > 0 ? (Number(item.currentOutstanding || 0) / outstandingSum) * 100 : 0;
                      return (
                        <tr key={item.productId}>
                          <td className="fw-semibold">{item.productName}</td>
                          <td className="text-end ofc-num">{count(item.submittedApplications)}</td>
                          <td className="text-end ofc-num text-nowrap">{moneyShort(item.requestedPrincipal)}</td>
                          <td className="text-end ofc-num text-nowrap">{moneyShort(item.disbursedPrincipal)}</td>
                          <td className="text-end ofc-num text-nowrap">{moneyShort(item.repayments)}</td>
                          <td className="text-end ofc-num text-nowrap fw-semibold">{moneyShort(item.currentOutstanding)}</td>
                          <td>
                            {outstandingSum > 0 ? (
                              <div className="d-flex align-items-center gap-2">
                                <span className="share-track" aria-hidden="true"><span style={{ width: `${Math.max(share, 2)}%` }} /></span>
                                <span className="small text-body-secondary ofc-num">{share.toFixed(0)}%</span>
                              </div>
                            ) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                    {perfInfo.items.length === 0 && (
                      <tr><td colSpan="7" className="text-center text-body-secondary py-4">No performance data available.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pager info={perfInfo} onPage={setPerfPage} label="Product performance pages" />
            </>
          )}
        </PanelCard>
      )}

      {/* ======================= AUDIT ======================= */}
      {isAudit && (
        <section className="card border-0 shadow-sm" aria-labelledby="adm-audit-title">
          <div className="card-body">
            <h2 id="adm-audit-title" className="visually-hidden">Audit events</h2>
            <form className="row g-2 mb-3" onSubmit={applyAuditFilters}>
              <div className="col-lg-3 col-md-6">
                <label htmlFor="audit-q" className="form-label small">Search</label>
                <input id="audit-q" className="form-control" value={auditDraft.q} maxLength={100}
                  onChange={(e) => setAuditDraft({ ...auditDraft, q: e.target.value })} placeholder="Event or resource" />
              </div>
              <div className="col-lg-3 col-md-6">
                <label htmlFor="audit-event" className="form-label small">Event type</label>
                <input id="audit-event" className="form-control font-monospace" value={auditDraft.eventType} maxLength={64}
                  onChange={(e) => setAuditDraft({ ...auditDraft, eventType: e.target.value })} placeholder="e.g. LOAN_DISBURSED" />
              </div>
              <div className="col-lg-2 col-md-4">
                <label htmlFor="audit-outcome" className="form-label small">Outcome</label>
                <select id="audit-outcome" className="form-select" value={auditDraft.outcome}
                  onChange={(e) => setAuditDraft({ ...auditDraft, outcome: e.target.value })}>
                  <option value="">All</option>
                  {OUTCOMES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="col-lg-2 col-md-4">
                <label htmlFor="audit-from" className="form-label small">From</label>
                <input id="audit-from" type="date" className="form-control" value={auditDraft.from}
                  onChange={(e) => setAuditDraft({ ...auditDraft, from: e.target.value })} />
              </div>
              <div className="col-lg-2 col-md-4">
                <label htmlFor="audit-to" className="form-label small">To</label>
                <input id="audit-to" type="date" className="form-control" value={auditDraft.to}
                  onChange={(e) => setAuditDraft({ ...auditDraft, to: e.target.value })} />
              </div>
              <div className="col-12 d-flex gap-2">
                <button className="btn btn-primary" type="submit">Apply filters</button>
                <button className="btn btn-outline-secondary" type="button" onClick={resetAuditFilters}>Reset</button>
              </div>
              {auditFormError && <div className="col-12 text-danger small" role="alert">{auditFormError}</div>}
            </form>
            {audit.status === "error" && !audit.data ? (
              <ErrorBlock message={audit.message} onRetry={audit.reload} />
            ) : !audit.data ? (
              <Loading label="Loading audit logs..." />
            ) : (
              <>
                <div className="table-responsive ofc-table-wrap" aria-busy={audit.status === "loading"}>
                  <table className="table table-hover align-middle mb-0 ofc-table ofc-table-history">
                    <thead>
                      <tr><th scope="col">Time</th><th scope="col">Actor</th><th scope="col">Event</th><th scope="col">Resource</th><th scope="col">Outcome</th></tr>
                    </thead>
                    <tbody>
                      {auditInfo.items.map((entry) => (
                        <tr key={entry.id}>
                          <td className="small text-nowrap">{dateTime(entry.occurredAt)}</td>
                          <td className="text-nowrap">
                            {entry.actorUserId && staffMap.has(Number(entry.actorUserId))
                              ? staffMap.get(Number(entry.actorUserId)).fullName
                              : `${entry.actorRole ?? entry.actorType ?? "-"}${entry.actorUserId ? ` #${entry.actorUserId}` : ""}`}
                          </td>
                          <td className="font-monospace small">{entry.eventType}</td>
                          <td className="small">
                            {entry.resourceType}
                            {entry.resourceId ? <span className="font-monospace"> / {entry.resourceId}</span> : ""}
                          </td>
                          <td><span className={statusChipClass(entry.outcome)}>{entry.outcome}</span></td>
                        </tr>
                      ))}
                      {auditInfo.items.length === 0 && (
                        <tr><td colSpan="5" className="text-center text-body-secondary py-4">No audit entries match these filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager info={auditInfo} onPage={setAuditPage} label="Audit log pages" />
              </>
            )}
          </div>
        </section>
      )}

      <p className="small text-body-secondary mb-0">
        Simulation environment. Figures are current values from the server; nothing on this page is estimated or sample data.
      </p>

      {/* ======================= LOAN DRAWER ======================= */}
      <Drawer open={Boolean(loanPanel)} titleId="adm-loan-title" locked={loanBusy || Boolean(loanDialog)} onClose={closeLoan} footer={loanFooter}>
        {panelApp && (
          <>
            <div className="ofc-drawer-head">
              <div className="min-w-0">
                <p className="eyebrow mb-1">{panelStatus === "APPROVED" ? "FINAL APPROVAL" : "LOAN APPLICATION"}</p>
                <h2 id="adm-loan-title" className="h5 mb-1">Application #{panelApp.id}</h2>
                <span className={statusChipClass(panelStatus)}>{loanLabel(panelStatus)}</span>
              </div>
              <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Close panel" onClick={closeLoan} disabled={loanBusy}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="ofc-drawer-section">
              <div className="ofc-section-title">Application</div>
              <dl className="ofc-facts">
                <div><dt>Applicant</dt><dd>
                  {assessment?.kycRecord?.fullName || `Customer #${panelApp.customerId}`}
                  {assessment?.kycRecord?.fullName && <span className="d-block small text-body-secondary fw-normal">Customer #{panelApp.customerId}</span>}
                </dd></div>
                <div><dt>Payout account</dt><dd>A/c #{panelApp.accountId}</dd></div>
                <div><dt>Loan product</dt><dd>{panelApp.productName}</dd></div>
                <div><dt>Requested amount</dt><dd className="ofc-num">{money(panelApp.principal)}</dd></div>
                <div><dt>Interest rate</dt><dd>{rate(panelApp.annualRate)} p.a.</dd></div>
                <div><dt>Tenure</dt><dd>{panelApp.months} months</dd></div>
                <div><dt>Declared monthly income</dt><dd className="ofc-num">{money(panelApp.declaredMonthlyIncome)}</dd></div>
                <div><dt>Submitted</dt><dd>{dateTime(panelApp.submittedAt)}</dd></div>
                <div className="wide"><dt>Purpose</dt><dd className="fw-normal">{panelApp.purpose || "-"}</dd></div>
              </dl>
            </div>

            <div className="ofc-drawer-section">
              <div className="ofc-section-title">Officer verification</div>
              <dl className="ofc-facts">
                <div><dt>{panelApp.approvedBy ? "Forwarded by" : "Assigned officer"}</dt><dd>
                  {forwardedBy || (panelApp.assignedOfficerId ? staffName(staffMap, panelApp.assignedOfficerId, "LOAN_OFFICER") : "Not yet assigned")}
                </dd></div>
                <div><dt>Status</dt><dd>{loanLabel(panelStatus)}</dd></div>
                {panelApp.decisionReason && (
                  <div className="wide"><dt>Officer note</dt><dd className="fw-normal">{panelApp.decisionReason}</dd></div>
                )}
              </dl>
            </div>

            {loanPanel.error ? (
              <div className="ofc-drawer-section"><ErrorBlock message={loanPanel.error} onRetry={() => openLoan(panelApp)} /></div>
            ) : loanPanel.loading || !assessment ? (
              <div className="ofc-drawer-section"><Loading label="Loading KYC status, EMI quote and history..." /></div>
            ) : (
              <>
                <div className="ofc-drawer-section">
                  <div className="ofc-section-title">Repayment estimate</div>
                  <div className="ofc-emi">
                    <div><div className="label">Monthly EMI</div><div className="value">{money(assessment.emi)}</div></div>
                    <div><div className="label">Total interest</div><div className="value">{money(assessment.totalInterest)}</div></div>
                    <div><div className="label">Total payable</div><div className="value">{money(assessment.totalPayable)}</div></div>
                  </div>
                  <p className="ofc-hint mt-2 mb-0">
                    {assessment.emi === null ? "The EMI quote is unavailable for this product right now."
                      : assessment.scheduleExact ? "From the bank's EMI engine (amortization schedule)."
                        : "EMI from the bank's EMI engine; totals are EMI x tenure (approximate)."}
                  </p>
                </div>

                <div className="ofc-drawer-section">
                  <div className="ofc-section-title">Pre-payout checks</div>
                  {assessment.checks.map((check) => (
                    <div key={check.key} className={`ofc-check ${check.state}`}>
                      <span className="ico"><CheckIcon state={check.state} /></span>
                      <div className="flex-grow-1 min-w-0">
                        <div className="d-flex justify-content-between gap-2">
                          <span className="fw-semibold">{check.label}</span>
                          <span className="ofc-check-state">{CHECK_STATE_TEXT[check.state]}</span>
                        </div>
                        <div className="small text-body-secondary">{check.detail}</div>
                      </div>
                    </div>
                  ))}
                  <p className="ofc-hint mt-2 mb-0">Indicative. The server re-checks status, KYC and limits when you approve.</p>
                </div>

                <div className="ofc-drawer-section">
                  <div className="ofc-section-title">Status history</div>
                  {assessment.history.length === 0 ? (
                    <p className="ofc-hint mb-0">No history recorded yet.</p>
                  ) : (
                    <ol className="ofc-timeline">
                      {assessment.history.map((h) => (
                        <li key={h.id}>
                          <div className="small fw-semibold">
                            {loanLabel(h.fromStatus)} <span aria-hidden="true">&rarr;</span><span className="visually-hidden">to</span> {loanLabel(h.toStatus)}
                          </div>
                          <div className="small text-body-secondary">
                            {dateTime(h.occurredAt)} &middot; {h.actorUserId && staffMap.has(Number(h.actorUserId))
                              ? staffMap.get(Number(h.actorUserId)).fullName
                              : h.actorRole ? h.actorRole.replaceAll("_", " ").toLowerCase() : String(h.actorType || "").toLowerCase()}
                          </div>
                          {h.notes && <div className="small">{h.notes}</div>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </Drawer>

      {/* ======================= KYC DRAWER (read-only) ======================= */}
      <Drawer open={Boolean(kycPanel)} titleId="adm-kyc-drawer-title" locked={false} onClose={closeKyc}
        footer={kycPanel ? (
          <>
            <span className="ofc-hint me-auto">Read-only for admins.</span>
            <button type="button" className="btn btn-outline-secondary" onClick={closeKyc}>Close</button>
          </>
        ) : null}>
        {kycPanel && (
          <>
            <div className="ofc-drawer-head">
              <div className="min-w-0">
                <p className="eyebrow mb-1">KYC RECORD</p>
                <h2 id="adm-kyc-drawer-title" className="h5 mb-1">{kycPanel.item.fullName || `Customer #${kycPanel.item.customerId}`}</h2>
                <span className={statusChipClass(kycPanel.item.status)}>{String(kycPanel.item.status || "-").toLowerCase()}</span>
              </div>
              <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Close panel" onClick={closeKyc}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            {kycPanel.error && <div className="ofc-drawer-section"><ErrorBlock message={kycPanel.error} onRetry={() => openKyc(kycPanel.item)} /></div>}
            {kycPanel.loading ? (
              <div className="ofc-drawer-section"><Loading label="Loading KYC record..." /></div>
            ) : (
              <div className="ofc-drawer-section">
                <dl className="ofc-facts">
                  <div><dt>Customer</dt><dd>#{kycPanel.item.customerId}</dd></div>
                  <div><dt>Email</dt><dd>{kycPanel.item.email || "-"}</dd></div>
                  <div><dt>Document type</dt><dd>{documentLabel(kycPanel.item.documentType)}</dd></div>
                  <div><dt>Reference</dt><dd className="font-monospace">{maskReference(kycPanel.item.documentReference)}</dd></div>
                  <div><dt>Submitted</dt><dd>{dateTime(kycPanel.item.createdAt)}</dd></div>
                  <div><dt>Reviewed</dt><dd>{kycPanel.item.reviewedAt ? dateTime(kycPanel.item.reviewedAt) : "Not yet"}</dd></div>
                  {kycPanel.item.reviewedBy && (
                    <div><dt>Reviewed by</dt><dd>{staffName(staffMap, kycPanel.item.reviewedBy, "LOAN_OFFICER")}</dd></div>
                  )}
                  {kycPanel.item.reviewNotes && (
                    <div className="wide"><dt>Review notes</dt><dd className="fw-normal">{kycPanel.item.reviewNotes}</dd></div>
                  )}
                </dl>
                <p className="ofc-hint mt-3 mb-0">Document images are not stored by this system, so no preview is available.</p>
              </div>
            )}
          </>
        )}
      </Drawer>

      {/* ======================= DIALOGS ======================= */}
      <ConfirmActionDialog
        open={Boolean(loanDialog)}
        title={loanDialog ? (loanDialog.action === "disburse" ? `Approve and pay out application #${loanDialog.app.id}?` : `Reject application #${loanDialog.app.id}?`) : ""}
        description={loanDialog
          ? loanDialog.action === "disburse"
            ? `${money(loanDialog.app.principal)} will be credited to account #${loanDialog.app.accountId} and a ${loanDialog.app.months}-month repayment schedule will start. This cannot be undone.`
            : `Application #${loanDialog.app.id} (${money(loanDialog.app.principal)}) will be rejected. The customer sees your reason.`
          : ""}
        confirmLabel={loanDialog?.action === "disburse" ? "Approve & pay out" : "Reject application"}
        tone={loanDialog?.action === "disburse" ? "success" : "danger"}
        reasonLabel="Decision note (recorded in the audit log and loan history)"
        reasonPlaceholder={loanDialog?.action === "disburse"
          ? "e.g. Officer verification reviewed; KYC verified; affordability acceptable."
          : "e.g. EMI exceeds affordability guidance for the declared income."}
        busy={loanBusy}
        error={loanError}
        onCancel={() => { if (!loanBusy) setLoanDialog(null); }}
        onConfirm={submitLoanDecision}
      />

      <ConfirmActionDialog
        open={Boolean(dialog)}
        title={dialog ? `${dialog.nextActive ? "Activate" : "Deactivate"} ${dialog.user.fullName}?` : ""}
        description={dialog
          ? dialog.nextActive
            ? `${dialog.user.email} will be able to sign in again. This is recorded with your reason.`
            : `${dialog.user.email} will be blocked from signing in until re-activated. No data is deleted. This is recorded with your reason.`
          : ""}
        confirmLabel={dialog?.nextActive ? "Activate" : "Deactivate"}
        tone={dialog?.nextActive ? "success" : "danger"}
        reasonLabel="Reason"
        reasonPlaceholder="Why is this change needed?"
        busy={activating}
        error={dialogError}
        onCancel={() => { if (!activating) setDialog(null); }}
        onConfirm={submitActivation}
      />

      <CreditAccountDialog
        open={creditOpen}
        onCancel={() => setCreditOpen(false)}
        onCreated={() => { recentAudit.reload(); dashboard.reload(); }}
      />

      <AddOfficerDialog
        open={officerOpen}
        busy={creatingOfficer}
        error={officerError}
        onCancel={() => { if (!creatingOfficer) setOfficerOpen(false); }}
        onSubmit={submitNewOfficer}
      />
    </section>
  );
}
