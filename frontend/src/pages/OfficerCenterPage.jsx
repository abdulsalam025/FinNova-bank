import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, CircleAlert, CircleCheck, CircleHelp, CircleX, ClipboardCheck, Eye, FileCheck2, FileClock, FileX2,
  HandCoins, History, ListChecks, RefreshCw, ShieldCheck, ShieldQuestion, UserCheck, X,
} from "lucide-react";
import { http } from "../api/http.js";
import {
  listLoanApplications,
  getLoanApplication,
  getLoanProduct,
  getLoanQuote,
  getLoanApplicationHistory,
  staffLoanApplicationAction,
} from "../api/loans.js";
import { usePanel } from "../hooks/usePanel.js";
import { ConfirmActionDialog } from "../components/ConfirmActionDialog.jsx";
import { ErrorBlock, Loading, Pager, friendlyError, pageInfo } from "../components/panels.jsx";
import { OFFICER_REFRESH_EVENT } from "../components/OfficerNav.jsx";

const PAGE_SIZE = 10;
const KYC_LOOKUP_SIZE = 50;
const KYC_LOOKUP_MAX_PAGES = 20;

const KYC_TABS = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "VERIFIED", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
];

const LOAN_TABS = [
  { value: "", label: "All" },
  { value: "SUBMITTED", label: "New" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "ADDITIONAL_INFO_REQUIRED", label: "Info requested" },
  { value: "APPROVED", label: "Forwarded to admin" },
  { value: "REJECTED", label: "Rejected" },
];

const LOAN_STATUS_LABEL = {
  DRAFT: "Draft",
  SUBMITTED: "New",
  UNDER_REVIEW: "Under review",
  ADDITIONAL_INFO_REQUIRED: "Info requested",
  APPROVED: "Forwarded to admin",
  REJECTED: "Rejected",
  DISBURSED: "Disbursed",
  REPAYMENT: "Repaying",
  CLOSED: "Closed",
};

const EMPTY_CHECKS = { identity: false, affordability: false, policy: false, purpose: false };

const KYC_COPY = {
  VERIFIED: {
    title: "Verify this customer's KYC?",
    impact: "The identity record becomes VERIFIED. Loan applications from this customer can then be forwarded to Admin.",
    confirmLabel: "Verify KYC",
    tone: "success",
    placeholder: "e.g. Document details match the registered profile.",
  },
  REJECTED: {
    title: "Reject this KYC submission?",
    impact: "The record becomes REJECTED. The customer sees your reason and can resubmit corrected details. State clearly what needs fixing.",
    confirmLabel: "Reject KYC",
    tone: "danger",
    placeholder: "e.g. Document number does not match the profile name.",
  },
};

const LOAN_COPY = {
  review: {
    title: "Start review of this application?",
    impact: "Assigns the application to you and moves it to UNDER REVIEW.",
    confirmLabel: "Start review",
    tone: "success",
    placeholder: "e.g. Assigned for KYC, affordability and policy verification.",
  },
  "request-info": {
    title: "Request more information from the customer?",
    impact: "Moves the application to INFO REQUESTED. The customer sees your request and must respond before review continues.",
    confirmLabel: "Request information",
    tone: "danger",
    placeholder: "e.g. Please confirm employment tenure and current monthly obligations.",
  },
  approve: {
    title: "Forward this application to Admin?",
    impact: "Records your verification and sends the application to Admin for final approval. Only Admin approval credits the (simulated) loan amount to the customer's account.",
    confirmLabel: "Forward to Admin",
    tone: "success",
    placeholder: "e.g. KYC verified, FOIR within guidance, product limits met. Recommended.",
  },
  reject: {
    title: "Reject this loan application?",
    impact: "The application is closed as REJECTED. Your reason is shown to the customer and recorded in the audit trail.",
    confirmLabel: "Reject application",
    tone: "danger",
    placeholder: "e.g. Requested EMI exceeds a sustainable share of declared income.",
  },
};

const LOAN_NOTICE = {
  review: (id) => `Application #${id} is now under your review.`,
  "request-info": (id) => `Additional information requested for application #${id}.`,
  approve: (id) => `Application #${id} verified and forwarded to Admin for final approval.`,
  reject: (id) => `Application #${id} was rejected.`,
};

function money(value) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

/* Table cells: drop ".00" on whole rupee amounts so columns stay compact (full value in the title). */
function moneyShort(value) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2,
  }).format(amount);
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

function timeOnly(value) {
  const d = toDate(value);
  return d ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
}

function statusChipClass(status) {
  const value = String(status || "").toUpperCase();
  if (["VERIFIED", "APPROVED", "DISBURSED", "REPAYMENT", "FORWARDED"].includes(value)) return "status-chip pos";
  if (value === "REJECTED") return "status-chip neg";
  if (["PENDING", "SUBMITTED", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED"].includes(value)) return "status-chip pending";
  return "status-chip neutral";
}

function loanLabel(status) {
  const value = String(status || "").toUpperCase();
  return LOAN_STATUS_LABEL[value] || value.replaceAll("_", " ").toLowerCase() || "unknown";
}

function decisionLabel(item) {
  if (item.resourceType === "LOAN_APPLICATION" && item.decision === "APPROVED") return "FORWARDED";
  return String(item.decision || "-").replaceAll("_", " ");
}

function documentLabel(type) {
  if (!type) return "-";
  return String(type).toLowerCase().split("_").map((w) => (w === "id" ? "ID" : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

/* Officers only need enough of the reference to match a record, not the full value. */
function maskReference(ref) {
  if (!ref) return "unavailable";
  const value = String(ref);
  if (value.length <= 12) return value;
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
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

function buildAssessment(app, product, quote, history, kyc) {
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
  const totalInterest = totalPayable !== null ? totalPayable - principal : null;
  const foir = emi !== null && hasIncome ? (emi / income) * 100 : null;
  const multiplier = product?.maxIncomeMultiplier != null ? Number(product.maxIncomeMultiplier) : null;
  const incomeCap = hasIncome && multiplier ? income * multiplier : null;
  const inBounds = product
    ? principal >= Number(product.minPrincipal) && principal <= Number(product.maxPrincipal)
      && months >= Number(product.minTenureMonths) && months <= Number(product.maxTenureMonths)
    : null;
  const kycStatus = kyc.ok ? (kyc.record?.status ?? "NOT_FOUND") : "UNKNOWN";

  const checks = [
    {
      key: "kyc",
      label: "KYC identity",
      state: kycStatus === "VERIFIED" ? "pass" : kycStatus === "UNKNOWN" ? "unknown" : "fail",
      detail: kycStatus === "VERIFIED" ? "Identity verified."
        : kycStatus === "UNKNOWN" ? "KYC status could not be loaded."
          : kycStatus === "NOT_FOUND" ? "No KYC record found for this customer."
            : `KYC is ${kycStatus}. Forwarding is blocked until it is VERIFIED.`,
    },
    {
      key: "foir",
      label: "EMI-to-income (FOIR)",
      state: foir === null ? "unknown" : foir <= 40 ? "pass" : foir <= 50 ? "warn" : "fail",
      detail: foir === null ? "Needs an EMI quote and declared income."
        : `${foir.toFixed(1)}% of declared monthly income (guidance: up to 40%, caution to 50%).`,
    },
    {
      key: "cap",
      label: "Income multiplier",
      state: incomeCap === null ? "unknown" : principal <= incomeCap ? "pass" : "fail",
      detail: incomeCap === null ? "Product multiplier or declared income unavailable."
        : `Indicative cap ${money(incomeCap)} (${multiplier}x monthly income).`,
    },
    {
      key: "bounds",
      label: "Product limits",
      state: inBounds === null ? "unknown" : inBounds ? "pass" : "fail",
      detail: product
        ? `${money(product.minPrincipal)} to ${money(product.maxPrincipal)}, ${product.minTenureMonths} to ${product.maxTenureMonths} months.`
        : "Product details unavailable.",
    },
  ];

  return {
    product,
    emi,
    totalPayable,
    totalInterest,
    scheduleExact: Boolean(schedule),
    kycStatus,
    kycRecord: kyc.record,
    history: history?.items ?? [],
    checks,
  };
}

function CheckIcon({ state }) {
  if (state === "pass") return <CircleCheck size={17} aria-hidden="true" />;
  if (state === "fail") return <CircleX size={17} aria-hidden="true" />;
  if (state === "warn") return <CircleAlert size={17} aria-hidden="true" />;
  return <CircleHelp size={17} aria-hidden="true" />;
}

const CHECK_STATE_TEXT = { pass: "Pass", warn: "Caution", fail: "Fail", unknown: "Unavailable" };

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

export default function OfficerCenterPage() {
  /* Filters live in the URL (?view=&loans=&kyc=) so sidebar links, bookmarks and Back work. */
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const view = searchParams.get("view");
  const loanParam = searchParams.get("loans") || "";
  const loanStatus = LOAN_TABS.some((t) => t.value === loanParam) ? loanParam : "";
  const kycParam = (searchParams.get("kyc") || "PENDING").toUpperCase();
  const kycStatus = kycParam === "ALL" ? "" : KYC_TABS.some((t) => t.value === kycParam) ? kycParam : "PENDING";

  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const applied = { q: query, status: kycStatus };

  /* Page numbers reset automatically when their filter changes (no extra request). */
  const [loanPaging, setLoanPaging] = useState({ key: "", page: 0 });
  const loanPage = loanPaging.key === loanStatus ? loanPaging.page : 0;
  const setLoanPage = (page) => setLoanPaging({ key: loanStatus, page });
  const kycKey = `${kycStatus}|${query}`;
  const [kycPaging, setKycPaging] = useState({ key: "PENDING|", page: 0 });
  const kycPage = kycPaging.key === kycKey ? kycPaging.page : 0;
  const setKycPage = (page) => setKycPaging({ key: kycKey, page });

  const [loanPanel, setLoanPanel] = useState(null);
  const [checks, setChecks] = useState(EMPTY_CHECKS);
  const [kycPanel, setKycPanel] = useState(null);

  const [dialog, setDialog] = useState(null);
  const [loanDialog, setLoanDialog] = useState(null);
  const [deciding, setDeciding] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");

  const loanSeq = useRef(0);
  const kycSeq = useRef(0);

  const kpis = usePanel(
    async (signal) => {
      const [pending, verified, rejected, mine, submittedLoans, reviewLoans] = await Promise.all([
        http.get("/officer/kyc", { signal, params: { page: 0, size: 1, status: "PENDING" } }),
        http.get("/officer/kyc", { signal, params: { page: 0, size: 1, status: "VERIFIED" } }),
        http.get("/officer/kyc", { signal, params: { page: 0, size: 1, status: "REJECTED" } }),
        http.get("/officer/decisions", { signal, params: { page: 0, size: 1 } }),
        http.get("/loan-applications", { signal, params: { page: 0, size: 1, status: "SUBMITTED" } }),
        http.get("/loan-applications", { signal, params: { page: 0, size: 1, status: "UNDER_REVIEW" } }),
      ]);
      return {
        pending: pending.data?.totalElements ?? 0,
        verified: verified.data?.totalElements ?? 0,
        rejected: rejected.data?.totalElements ?? 0,
        decisions: mine.data?.totalElements ?? 0,
        loansPending: (submittedLoans.data?.totalElements ?? 0) + (reviewLoans.data?.totalElements ?? 0),
      };
    },
    "kpis",
    "Workload metrics could not be loaded.",
    friendlyError,
  );

  const kyc = usePanel(
    (signal) =>
      http.get("/officer/kyc", {
        signal,
        params: {
          page: kycPage,
          size: PAGE_SIZE,
          ...(applied.status ? { status: applied.status } : {}),
          ...(applied.q ? { q: applied.q } : {}),
        },
      }).then((r) => r.data),
    JSON.stringify([kycPage, applied]),
    "The KYC queue could not be loaded.",
    friendlyError,
  );

  const loanApps = usePanel(
    () => listLoanApplications({ page: loanPage, size: PAGE_SIZE, ...(loanStatus ? { status: loanStatus } : {}) }),
    JSON.stringify([loanPage, loanStatus]),
    "The loan verification queue could not be loaded.",
    friendlyError,
  );

  const decisions = usePanel(
    (signal) => http.get("/officer/decisions", { signal, params: { page: 0, size: 12 } }).then((r) => r.data),
    "decisions",
    "Your decision history could not be loaded.",
    friendlyError,
  );

  const kycInfo = pageInfo(kyc.data, PAGE_SIZE);
  const loanInfo = pageInfo(loanApps.data, PAGE_SIZE);
  const anyLoading = kyc.status === "loading" || kpis.status === "loading" || loanApps.status === "loading";

  const reviewed = (kpis.data?.verified ?? 0) + (kpis.data?.rejected ?? 0);
  const pool = reviewed + (kpis.data?.pending ?? 0);
  const completion = pool > 0 ? Math.round((reviewed / pool) * 100) : 100;

  const openLoan = useCallback(async (app) => {
    const seq = ++loanSeq.current;
    setChecks(EMPTY_CHECKS);
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
      setLoanPanel({ app: fresh, data: buildAssessment(fresh, product, quote, history, kycResult), loading: false, error: "" });
    } catch (error) {
      if (seq !== loanSeq.current) return;
      setLoanPanel({ app, data: null, loading: false, error: friendlyError(error, "Verification details could not be loaded.") });
    }
  }, []);

  const closeLoan = useCallback(() => {
    loanSeq.current += 1;
    setLoanPanel(null);
  }, []);

  const openKyc = useCallback(async (item, returnTo = null) => {
    const seq = ++kycSeq.current;
    setKycPanel({ item, loading: true, error: "", returnTo });
    try {
      const { data } = await http.get(`/officer/kyc/${item.id}`);
      if (seq === kycSeq.current) setKycPanel({ item: data, loading: false, error: "", returnTo });
    } catch (error) {
      if (seq === kycSeq.current) setKycPanel({ item, loading: false, error: friendlyError(error, "KYC details could not be loaded."), returnTo });
    }
  }, []);

  const closeKyc = useCallback(() => {
    kycSeq.current += 1;
    setKycPanel(null);
  }, []);

  function updateParams(changes) {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace: true });
  }

  function applySearch(event) {
    event.preventDefault();
    setQuery(queryDraft.trim());
  }

  function setKycStatus(status) {
    updateParams({ view: "kyc", kyc: status === "" ? "ALL" : status === "PENDING" ? null : status });
  }

  function filterLoans(status) {
    updateParams({ view: "loans", loans: status || null });
  }

  function refreshSidebar() {
    window.dispatchEvent(new Event(OFFICER_REFRESH_EVENT));
  }

  /* Sidebar links carry state.officerScroll: bring the requested section into view. */
  const firstRender = useRef(true);
  useEffect(() => {
    const fromSidebar = Boolean(location.state?.officerScroll);
    const initial = firstRender.current;
    firstRender.current = false;
    if (!fromSidebar && !(initial && view)) return undefined;
    const target = { loans: "officer-loans-heading", kyc: "kyc-heading", history: "decisions-heading" }[view];
    const id = window.setTimeout(() => {
      const el = target ? document.getElementById(target) : null;
      if (el) {
        el.scrollIntoView({ block: "start" });
        el.focus({ preventScroll: true });
      } else {
        document.getElementById("main-content")?.scrollTo?.({ top: 0 });
        window.scrollTo?.({ top: 0 });
      }
    }, 60);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  function openKycDecision(item, decision) {
    if (deciding) return;
    setDialogError("");
    setNotice("");
    setDialog({ item, decision });
  }

  function openLoanAction(app, action) {
    if (deciding) return;
    setDialogError("");
    setNotice("");
    setLoanDialog({ app, action });
  }

  async function submitKycDecision(reason) {
    if (!dialog || deciding) return;
    setDeciding(true);
    setDialogError("");
    try {
      const { data } = await http.post(`/officer/kyc/${dialog.item.id}/decision`, { decision: dialog.decision, reason });
      setNotice(`KYC for ${dialog.item.fullName || `record #${dialog.item.id}`} was ${dialog.decision === "VERIFIED" ? "verified" : "rejected"}.`);
      setDialog(null);
      if (kycPanel && data && Number(kycPanel.item?.id) === Number(data.id)) {
        setKycPanel((current) => (current ? { ...current, item: data } : current));
      }
      kyc.reload();
      kpis.reload();
      decisions.reload();
      refreshSidebar();
    } catch (error) {
      setDialogError(friendlyError(error, "The KYC decision could not be recorded."));
      kyc.reload();
    } finally {
      setDeciding(false);
    }
  }

  async function submitLoanAction(reason) {
    if (!loanDialog || deciding) return;
    const { app, action } = loanDialog;
    setDeciding(true);
    setDialogError("");
    try {
      const updated = await staffLoanApplicationAction(app.id, action, reason);
      setNotice((LOAN_NOTICE[action] || ((id) => `Application #${id} updated.`))(updated?.id ?? app.id));
      setLoanDialog(null);
      loanApps.reload();
      kpis.reload();
      decisions.reload();
      refreshSidebar();
      if (loanPanel && Number(loanPanel.app?.id) === Number(app.id)) openLoan(updated ?? app);
    } catch (error) {
      setDialogError(friendlyError(error, "The loan action could not be completed."));
      loanApps.reload();
    } finally {
      setDeciding(false);
    }
  }

  function jumpTo(id) {
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }

  const kycCopy = dialog ? KYC_COPY[dialog.decision] : null;
  const loanCopy = loanDialog ? LOAN_COPY[loanDialog.action] : null;
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dialogOpen = Boolean(dialog || loanDialog);

  const chipCount = (status) => {
    if (!kpis.data) return null;
    if (status === "PENDING") return kpis.data.pending;
    if (status === "VERIFIED") return kpis.data.verified;
    if (status === "REJECTED") return kpis.data.rejected;
    return null;
  };

  /* ---------- Loan review panel content ---------- */
  const panelApp = loanPanel?.app;
  const panelStatus = String(panelApp?.status || "").toUpperCase();
  const assessment = loanPanel?.data;
  const allChecked = Object.values(checks).every(Boolean);
  const kycVerified = assessment?.kycStatus === "VERIFIED";
  const forwardBlocked = !assessment || !kycVerified || !allChecked;

  let loanFooter = null;
  if (panelApp) {
    if (panelStatus === "SUBMITTED") {
      loanFooter = (
        <>
          <button type="button" className="btn btn-accent d-inline-flex align-items-center gap-2" disabled={deciding}
            onClick={() => openLoanAction(panelApp, "review")}>
            <ShieldCheck size={16} aria-hidden="true" /> Start review
          </button>
          <span className="ofc-hint">Start the review to unlock verification decisions.</span>
        </>
      );
    } else if (panelStatus === "UNDER_REVIEW") {
      loanFooter = (
        <>
          <button type="button" className="btn btn-accent d-inline-flex align-items-center gap-2"
            disabled={deciding || forwardBlocked} aria-describedby="ofc-forward-hint"
            onClick={() => openLoanAction(panelApp, "approve")}>
            <ShieldCheck size={16} aria-hidden="true" /> Forward to Admin
          </button>
          <button type="button" className="btn btn-outline-secondary" disabled={deciding}
            onClick={() => openLoanAction(panelApp, "request-info")}>
            Request info
          </button>
          <button type="button" className="btn btn-outline-danger" disabled={deciding}
            onClick={() => openLoanAction(panelApp, "reject")}>
            Reject
          </button>
          <span id="ofc-forward-hint" className="ofc-hint w-100">
            {!assessment ? "Loading verification data..."
              : !kycVerified ? "Forwarding needs VERIFIED KYC. Review the customer's KYC record first."
                : !allChecked ? "Confirm all four checklist items to forward."
                  : "Ready to forward. The backend re-checks policy, KYC and your approval limit."}
          </span>
        </>
      );
    } else if (panelStatus === "ADDITIONAL_INFO_REQUIRED") {
      loanFooter = <span className="ofc-hint">Waiting for the customer to respond to your information request.</span>;
    } else if (panelStatus === "APPROVED") {
      loanFooter = <span className="ofc-hint">Forwarded. Waiting in Admin Center for final approval and account credit.</span>;
    } else {
      loanFooter = <span className="ofc-hint">No officer action is available in the current status.</span>;
    }
  }

  return (
    <section className="vstack gap-4 dashboard-page">
      <div className="ofc-banner d-flex flex-wrap justify-content-between align-items-end gap-3">
        <div>
          <p className="eyebrow mb-1">FINNOVA BANK / OFFICER VERIFICATION WORKSPACE</p>
          <h1 className="mb-1">Welcome back, Officer</h1>
          <p className="sub mb-0">Verify KYC and loan applications, then forward eligible loans to Admin for final approval.</p>
        </div>
        <div className="d-flex flex-column align-items-end gap-2">
          <span className="small fw-semibold">{today}</span>
          <button
            type="button"
            className="btn btn-dark d-inline-flex align-items-center gap-2"
            onClick={() => { kyc.reload(); loanApps.reload(); kpis.reload(); decisions.reload(); refreshSidebar(); }}
            disabled={anyLoading}
          >
            <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
            {anyLoading ? "Refreshing..." : "Refresh data"}
          </button>
        </div>
      </div>

      {notice && (
        <div className="alert alert-success d-flex justify-content-between align-items-start gap-3 mb-0" role="status">
          <span>{notice}</span>
          <button type="button" className="btn-close" aria-label="Dismiss notification" onClick={() => setNotice("")} />
        </div>
      )}

      {kpis.status === "error" && !kpis.data ? (
        <ErrorBlock message={kpis.message} onRetry={kpis.reload} />
      ) : (
        <div className="row g-3" aria-busy={kpis.status === "loading"}>
          {[
            { label: "Pending KYC", value: kpis.data?.pending, sub: "Identity reviews waiting", Icon: FileClock, tone: "green" },
            { label: "Loans to verify", value: kpis.data?.loansPending, sub: "New and under review", Icon: HandCoins, tone: "purple" },
            { label: "Verified KYC", value: kpis.data?.verified, sub: "Accepted customer profiles", Icon: UserCheck, tone: "blue" },
            { label: "My decisions", value: kpis.data?.decisions, sub: "KYC and loan actions recorded", Icon: History, tone: "green" },
          ].map(({ label, value, sub, Icon, tone }) => (
            <div key={label} className="col-12 col-sm-6 col-xl-3">
              <article className={`card h-100 dashboard-stat dashboard-stat-${tone}`}>
                <div className="card-body d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <p className="dashboard-stat-label mb-1">{label}</p>
                    <div className="dashboard-stat-value">{kpis.data ? value : "-"}</div>
                    <p className="small text-body-secondary mb-0 mt-1">{sub}</p>
                  </div>
                  <span className="dashboard-stat-icon" aria-hidden="true"><Icon size={20} /></span>
                </div>
              </article>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Loan verification queue ---------- */}
      <section className="card border-0 shadow-sm" aria-labelledby="officer-loans-heading">
        <div className="card-body">
          <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
            <div>
              <h2 id="officer-loans-heading" tabIndex={-1} className="h5 mb-1 d-inline-flex align-items-center gap-2 ofc-anchor">
                <HandCoins size={18} className="text-lav" aria-hidden="true" /> Loan verification queue
              </h2>
              <p className="small text-body-secondary mb-0">
                Review each application, check KYC and affordability, then forward to Admin or decline.
              </p>
            </div>
            <div className="d-flex flex-wrap gap-2" role="group" aria-label="Filter loan applications by status">
              {LOAN_TABS.map((tab) => (
                <button
                  key={tab.value || "all"}
                  type="button"
                  className={`fn-chip ${loanStatus === tab.value ? "active" : ""}`}
                  aria-pressed={loanStatus === tab.value}
                  onClick={() => filterLoans(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loanApps.status === "error" && !loanApps.data ? (
            <ErrorBlock message={loanApps.message} onRetry={loanApps.reload} />
          ) : !loanApps.data ? (
            <Loading label="Loading loan applications..." />
          ) : (
            <>
              <div className="table-responsive ofc-table-wrap" aria-busy={loanApps.status === "loading"}>
                <table className="table table-hover align-middle mb-0 ofc-table ofc-table-loans">
                  <caption className="visually-hidden">Loan applications awaiting or past officer verification</caption>
                  <thead>
                    <tr>
                      <th scope="col">App</th>
                      <th scope="col">Applicant</th>
                      <th scope="col">Product</th>
                      <th scope="col" className="text-end">Amount</th>
                      <th scope="col">Tenure</th>
                      <th scope="col" className="text-end">Income / mo</th>
                      <th scope="col" className="ofc-col-status">Status</th>
                      <th scope="col" className="ofc-col-actions text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loanInfo.items.map((app) => {
                      const st = String(app.status || "").toUpperCase();
                      const active = Number(panelApp?.id) === Number(app.id);
                      return (
                        <tr key={app.id} className={active ? "table-active" : ""}>
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
                          <td className="text-end text-nowrap ofc-num" title={money(app.declaredMonthlyIncome)}>{moneyShort(app.declaredMonthlyIncome)}</td>
                          <td className="text-nowrap ofc-col-status"><span className={statusChipClass(st)}>{loanLabel(st)}</span></td>
                          <td className="ofc-col-actions">
                            <div className="ofc-row-actions">
                              <button type="button"
                                className={`btn btn-sm btn-outline-primary${st === "SUBMITTED" ? " ofc-btn-icon" : ""}`}
                                aria-label={`Review application ${app.id}`} title="Open review panel" onClick={() => openLoan(app)}>
                                <Eye size={14} aria-hidden="true" />{st === "SUBMITTED" ? null : " Review"}
                              </button>
                              {st === "SUBMITTED" && (
                                <button type="button" className="btn btn-sm btn-accent" disabled={deciding}
                                  aria-label={`Start review of application ${app.id}`} onClick={() => openLoanAction(app, "review")}>
                                  Start review
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {loanInfo.items.length === 0 && (
                      <tr>
                        <td colSpan="8" className="text-center text-body-secondary py-4">No loan applications match this filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pager info={loanInfo} onPage={setLoanPage} label="Loan queue pages" />
            </>
          )}
        </div>
      </section>

      <div className="row g-4">
        {/* ---------- KYC queue ---------- */}
        <div className="col-12">
          <section className="card border-0 shadow-sm" aria-labelledby="kyc-heading">
            <div className="card-body">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <h2 id="kyc-heading" tabIndex={-1} className="h5 mb-0 d-inline-flex align-items-center gap-2 ofc-anchor">
                  <ShieldQuestion size={18} className="text-lav" aria-hidden="true" /> KYC review queue
                </h2>
                <div className="d-flex flex-wrap gap-2" role="group" aria-label="Filter KYC by status">
                  {KYC_TABS.map((tab) => {
                    const count = chipCount(tab.value);
                    return (
                      <button
                        key={tab.value || "all"}
                        type="button"
                        className={`fn-chip ${applied.status === tab.value ? "active" : ""}`}
                        aria-pressed={applied.status === tab.value}
                        onClick={() => setKycStatus(tab.value)}
                      >
                        {tab.label}{count !== null && count !== undefined ? ` (${count})` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>

              <form className="d-flex flex-wrap gap-2 mb-3" onSubmit={applySearch} role="search">
                <label htmlFor="officer-kyc-search" className="visually-hidden">Search KYC requests by customer name or email</label>
                <input
                  id="officer-kyc-search"
                  className="form-control flex-grow-1"
                  style={{ minWidth: "12rem", flexBasis: "16rem" }}
                  value={queryDraft}
                  maxLength={100}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder="Search by customer name or email"
                />
                <button className="btn btn-primary" type="submit">Search</button>
              </form>

              {kyc.status === "error" && !kyc.data ? (
                <ErrorBlock message={kyc.message} onRetry={kyc.reload} />
              ) : !kyc.data ? (
                <Loading label="Loading KYC queue..." />
              ) : (
                <>
                  <div className="table-responsive ofc-table-wrap" aria-busy={kyc.status === "loading"}>
                    <table className="table table-hover align-middle mb-0 ofc-table ofc-table-kyc">
                      <caption className="visually-hidden">KYC submissions</caption>
                      <thead>
                        <tr>
                          <th scope="col">Customer</th>
                          <th scope="col">Document</th>
                          <th scope="col">Submitted</th>
                          <th scope="col">Status</th>
                          <th scope="col" className="ofc-col-actions text-end">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kycInfo.items.map((item) => (
                          <tr key={item.id}>
                            <td className="ofc-col-customer">
                              <div className="fw-semibold text-truncate" title={item.fullName}>{item.fullName}</div>
                              <div className="small text-body-secondary text-truncate" title={item.email}>{item.email}</div>
                              <div className="small text-body-secondary">Customer #{item.customerId}</div>
                            </td>
                            <td>
                              <div className="fw-semibold text-nowrap">{documentLabel(item.documentType)}</div>
                              <div className="small text-body-secondary font-monospace text-nowrap">{maskReference(item.documentReference)}</div>
                            </td>
                            <td className="text-nowrap small">
                              <div>{dateOnly(item.createdAt)}</div>
                              <div className="text-body-secondary">{timeOnly(item.createdAt)}</div>
                            </td>
                            <td className="text-nowrap"><span className={statusChipClass(item.status)}>{item.status || "UNKNOWN"}</span></td>
                            <td className="ofc-col-actions">
                              <div className="ofc-row-actions">
                                <button type="button" className="btn btn-sm btn-outline-primary"
                                  aria-label={`View KYC record for ${item.fullName}`} onClick={() => openKyc(item)}>
                                  <Eye size={14} aria-hidden="true" /> View
                                </button>
                                {item.status === "PENDING" && (
                                  <>
                                    <button type="button" className="btn btn-sm btn-accent" disabled={deciding}
                                      aria-label={`Verify KYC for ${item.fullName}`} onClick={() => openKycDecision(item, "VERIFIED")}>
                                      <FileCheck2 size={14} aria-hidden="true" /> Verify
                                    </button>
                                    <button type="button" className="btn btn-sm btn-outline-danger" disabled={deciding}
                                      aria-label={`Reject KYC for ${item.fullName}`} onClick={() => openKycDecision(item, "REJECTED")}>
                                      <FileX2 size={14} aria-hidden="true" /> Reject
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {kycInfo.items.length === 0 && (
                          <tr>
                            <td colSpan="5" className="text-center text-body-secondary py-4">
                              {applied.status === "PENDING" ? "The queue is clear - no pending submissions." : "No KYC requests match these filters."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Pager info={kycInfo} onPage={setKycPage} label="KYC queue pages" />
                </>
              )}
            </div>
          </section>
        </div>

        <div className="col-12">
          <div className="row g-4">
            <div className="col-12 col-lg-6">
            <section className="card border-0 shadow-sm h-100" aria-labelledby="qa-heading">
              <div className="card-body">
                <h2 id="qa-heading" className="h5 mb-3">Quick actions</h2>
                <div className="vstack gap-2">
                  <button type="button" className="qa-tile text-start" onClick={() => { filterLoans("SUBMITTED"); jumpTo("officer-loans-heading"); }}>
                    <span className="qa-ico pos"><HandCoins size={16} aria-hidden="true" /></span>
                    <span>New loan applications to review</span>
                  </button>
                  <button type="button" className="qa-tile text-start" onClick={() => { setKycStatus("PENDING"); jumpTo("kyc-heading"); }}>
                    <span className="qa-ico pos"><FileClock size={16} aria-hidden="true" /></span>
                    <span>Pending KYC reviews only</span>
                  </button>
                  <button
                    type="button"
                    className="qa-tile text-start"
                    onClick={() => { setQueryDraft(""); setQuery(""); updateParams({ view: null, loans: null, kyc: "ALL" }); }}
                  >
                    <span className="qa-ico lav"><ListChecks size={16} aria-hidden="true" /></span>
                    <span>Show entire queue</span>
                  </button>
                  <a className="qa-tile" href="#decisions-heading">
                    <span className="qa-ico sky"><History size={16} aria-hidden="true" /></span>
                    <span>Jump to decision history</span>
                  </a>
                </div>
              </div>
            </section>

            </div>
            <div className="col-12 col-lg-6">
            <section className="card border-0 shadow-sm h-100" aria-labelledby="tasks-heading">
              <div className="card-body">
                <h2 id="tasks-heading" className="h5 mb-3">Today&apos;s workload</h2>
                {kpis.data ? (
                  <>
                    <div className="task-meta mb-2">
                      <span className="text-body-secondary">KYC review completion</span>
                      <span className="pct">{completion}%</span>
                    </div>
                    <div className="task-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion} aria-label="KYC review completion">
                      <span style={{ width: `${completion}%` }} />
                    </div>
                    <p className="small text-body-secondary mt-3 mb-0">
                      {kpis.data.pending > 0 || kpis.data.loansPending > 0
                        ? `${kpis.data.pending} KYC submission${kpis.data.pending === 1 ? "" : "s"} and ${kpis.data.loansPending} loan application${kpis.data.loansPending === 1 ? "" : "s"} awaiting officer action.`
                        : "Nothing is waiting for officer action."}
                    </p>
                  </>
                ) : (
                  <Loading label="Computing workload..." />
                )}
              </div>
            </section>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Decision history ---------- */}
      <section aria-labelledby="decisions-heading">
        <h2 id="decisions-heading" tabIndex={-1} className="h5 ofc-anchor">My decision history (KYC and loans)</h2>
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            {decisions.status === "error" && !decisions.data ? (
              <ErrorBlock message={decisions.message} onRetry={decisions.reload} />
            ) : !decisions.data ? (
              <Loading label="Loading decision history..." />
            ) : (
              <div className="table-responsive ofc-table-wrap" aria-busy={decisions.status === "loading"}>
                <table className="table table-hover align-middle mb-0 ofc-table ofc-table-history">
                  <caption className="visually-hidden">Your recorded decisions</caption>
                  <thead>
                    <tr><th scope="col">Time</th><th scope="col">Type</th><th scope="col">Resource</th><th scope="col">Decision</th><th scope="col">Reason</th></tr>
                  </thead>
                  <tbody>
                    {(decisions.data?.items ?? []).map((item) => (
                      <tr key={item.id}>
                        <td className="small text-nowrap">{dateTime(item.occurredAt)}</td>
                        <td className="text-nowrap">{item.resourceType === "LOAN_APPLICATION" ? "Loan" : item.resourceType === "KYC_RECORD" ? "KYC" : item.resourceType}</td>
                        <td className="text-nowrap">#{item.resourceId}</td>
                        <td className="text-nowrap"><span className={statusChipClass(decisionLabel(item))}>{decisionLabel(item)}</span></td>
                        <td className="small ofc-col-reason">{item.reason || "-"}</td>
                      </tr>
                    ))}
                    {(decisions.data?.items ?? []).length === 0 && (
                      <tr><td colSpan="5" className="text-center text-body-secondary py-3">No decision history yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="small text-body-secondary d-inline-flex align-items-center gap-2">
        <ClipboardCheck size={14} aria-hidden="true" />
        All customer data here is synthetic. Decisions are recorded against your officer account and visible in Admin Center.
      </p>

      {/* ---------- Loan review drawer ---------- */}
      <Drawer open={Boolean(loanPanel)} titleId="ofc-loan-title" locked={deciding || dialogOpen} onClose={closeLoan} footer={loanFooter}>
        {panelApp && (
          <>
            <div className="ofc-drawer-head">
              <div className="min-w-0">
                <p className="eyebrow mb-1">LOAN APPLICATION REVIEW</p>
                <h2 id="ofc-loan-title" className="h5 mb-1">Application #{panelApp.id}</h2>
                <span className={statusChipClass(panelStatus)}>{loanLabel(panelStatus)}</span>
              </div>
              <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Close review panel" onClick={closeLoan} disabled={deciding}>
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
                <div><dt>Linked account</dt><dd>A/c #{panelApp.accountId}</dd></div>
                <div><dt>Loan product</dt><dd>{panelApp.productName}</dd></div>
                <div><dt>Requested amount</dt><dd className="ofc-num">{money(panelApp.principal)}</dd></div>
                <div><dt>Interest rate</dt><dd>{rate(panelApp.annualRate)} p.a.</dd></div>
                <div><dt>Tenure</dt><dd>{panelApp.months} months</dd></div>
                <div><dt>Declared monthly income</dt><dd className="ofc-num">{money(panelApp.declaredMonthlyIncome)}</dd></div>
                <div><dt>Submitted</dt><dd>{dateTime(panelApp.submittedAt)}</dd></div>
                <div className="wide"><dt>Purpose</dt><dd className="fw-normal">{panelApp.purpose || "-"}</dd></div>
                {panelApp.additionalInfoRequest && (
                  <div className="wide"><dt>Information requested</dt><dd className="fw-normal">{panelApp.additionalInfoRequest}</dd></div>
                )}
                {panelApp.customerNotes && (
                  <div className="wide"><dt>Customer response</dt><dd className="fw-normal">{panelApp.customerNotes}</dd></div>
                )}
                {panelApp.decisionReason && (
                  <div className="wide"><dt>Decision note</dt><dd className="fw-normal">{panelApp.decisionReason}</dd></div>
                )}
              </dl>
            </div>

            {loanPanel.error ? (
              <div className="ofc-drawer-section">
                <ErrorBlock message={loanPanel.error} onRetry={() => openLoan(panelApp)} />
              </div>
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
                    {assessment.emi === null
                      ? "The EMI quote is unavailable for this product right now."
                      : assessment.scheduleExact
                        ? "From the bank's EMI engine (cent-rounded amortization schedule)."
                        : "EMI from the bank's EMI engine; totals are EMI x tenure (approximate)."}
                  </p>
                </div>

                <div className="ofc-drawer-section">
                  <div className="ofc-section-title">Verification checks</div>
                  {assessment.checks.map((check) => (
                    <div key={check.key} className={`ofc-check ${check.state}`}>
                      <span className="ico"><CheckIcon state={check.state} /></span>
                      <div className="flex-grow-1 min-w-0">
                        <div className="d-flex justify-content-between gap-2">
                          <span className="fw-semibold">{check.label}</span>
                          <span className="ofc-check-state">{CHECK_STATE_TEXT[check.state]}</span>
                        </div>
                        <div className="small text-body-secondary">{check.detail}</div>
                        {check.key === "kyc" && assessment.kycRecord && (
                          <button type="button" className="btn btn-link btn-sm p-0 mt-1"
                            onClick={() => { const back = panelApp; closeLoan(); openKyc(assessment.kycRecord, back); }}>
                            Open KYC record
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="ofc-hint mt-2 mb-0">Indicative checks. The backend enforces eligibility, KYC and approval limits on every decision.</p>
                </div>

                {panelStatus === "UNDER_REVIEW" && (
                  <fieldset className="ofc-drawer-section">
                    <legend className="ofc-section-title">Officer checklist</legend>
                    {[
                      { key: "identity", label: "KYC record is VERIFIED and matches the applicant." },
                      { key: "affordability", label: `EMI of ${money(assessment.emi)} is affordable against declared income.` },
                      { key: "policy", label: "Amount and tenure meet product policy and my approval limit." },
                      { key: "purpose", label: "Loan purpose has been reviewed and is acceptable." },
                    ].map((item) => (
                      <div key={item.key} className="form-check mb-2">
                        <input className="form-check-input" type="checkbox" id={`ofc-chk-${item.key}`}
                          checked={checks[item.key]} disabled={deciding}
                          onChange={(event) => setChecks((current) => ({ ...current, [item.key]: event.target.checked }))} />
                        <label className="form-check-label small" htmlFor={`ofc-chk-${item.key}`}>{item.label}</label>
                      </div>
                    ))}
                  </fieldset>
                )}

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
                            {dateTime(h.occurredAt)} &middot; {h.actorRole ? h.actorRole.replaceAll("_", " ").toLowerCase() : String(h.actorType || "").toLowerCase()}
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

      {/* ---------- KYC review drawer ---------- */}
      <Drawer
        open={Boolean(kycPanel)}
        titleId="ofc-kyc-title"
        locked={deciding || dialogOpen}
        onClose={closeKyc}
        footer={kycPanel ? (
          <>
            {kycPanel.item?.status === "PENDING" && !kycPanel.loading && (
              <>
                <button type="button" className="btn btn-accent d-inline-flex align-items-center gap-2" disabled={deciding}
                  onClick={() => openKycDecision(kycPanel.item, "VERIFIED")}>
                  <FileCheck2 size={16} aria-hidden="true" /> Verify KYC
                </button>
                <button type="button" className="btn btn-outline-danger d-inline-flex align-items-center gap-2" disabled={deciding}
                  onClick={() => openKycDecision(kycPanel.item, "REJECTED")}>
                  <FileX2 size={16} aria-hidden="true" /> Reject
                </button>
              </>
            )}
            {kycPanel.returnTo && (
              <button type="button" className="btn btn-outline-secondary d-inline-flex align-items-center gap-2 ms-auto" disabled={deciding}
                onClick={() => { const back = kycPanel.returnTo; closeKyc(); openLoan(back); }}>
                <ArrowLeft size={15} aria-hidden="true" /> Back to application #{kycPanel.returnTo.id}
              </button>
            )}
            {kycPanel.item?.status !== "PENDING" && !kycPanel.returnTo && (
              <span className="ofc-hint">This record has been decided. Only PENDING KYC can be reviewed.</span>
            )}
          </>
        ) : null}
      >
        {kycPanel && (
          <>
            <div className="ofc-drawer-head">
              <div className="min-w-0">
                <p className="eyebrow mb-1">KYC REVIEW</p>
                <h2 id="ofc-kyc-title" className="h5 mb-1 text-truncate">{kycPanel.item?.fullName || `KYC record #${kycPanel.item?.id}`}</h2>
                <span className={statusChipClass(kycPanel.item?.status)}>{kycPanel.item?.status || "UNKNOWN"}</span>
              </div>
              <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Close KYC panel" onClick={closeKyc} disabled={deciding}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            {kycPanel.error && (
              <div className="ofc-drawer-section"><ErrorBlock message={kycPanel.error} onRetry={() => openKyc(kycPanel.item, kycPanel.returnTo)} /></div>
            )}
            {kycPanel.loading ? (
              <div className="ofc-drawer-section"><Loading label="Loading KYC record..." /></div>
            ) : (
              <>
                <div className="ofc-drawer-section">
                  <div className="ofc-section-title">Customer</div>
                  <dl className="ofc-facts">
                    <div><dt>Name</dt><dd>{kycPanel.item?.fullName || "-"}</dd></div>
                    <div><dt>Customer</dt><dd>#{kycPanel.item?.customerId}</dd></div>
                    <div className="wide"><dt>Email</dt><dd>{kycPanel.item?.email || "-"}</dd></div>
                    <div><dt>Login status</dt><dd>{kycPanel.item?.customerEnabled === false ? "Disabled" : "Active"}</dd></div>
                    <div><dt>Role</dt><dd>{kycPanel.item?.customerRole ? kycPanel.item.customerRole.replaceAll("_", " ").toLowerCase() : "-"}</dd></div>
                  </dl>
                </div>
                <div className="ofc-drawer-section">
                  <div className="ofc-section-title">Document</div>
                  <dl className="ofc-facts">
                    <div><dt>Document type</dt><dd>{documentLabel(kycPanel.item?.documentType)}</dd></div>
                    <div><dt>Reference</dt><dd className="font-monospace">{maskReference(kycPanel.item?.documentReference)}</dd></div>
                    <div><dt>Submitted</dt><dd>{dateTime(kycPanel.item?.createdAt)}</dd></div>
                    <div><dt>Reviewed</dt><dd>{kycPanel.item?.reviewedAt ? dateTime(kycPanel.item.reviewedAt) : "Not yet"}</dd></div>
                    {kycPanel.item?.reviewedBy && <div><dt>Reviewed by</dt><dd>Staff #{kycPanel.item.reviewedBy}</dd></div>}
                    {kycPanel.item?.reviewNotes && <div className="wide"><dt>Review notes</dt><dd className="fw-normal">{kycPanel.item.reviewNotes}</dd></div>}
                  </dl>
                  <div className="ofc-callout info mt-3">
                    Document preview is not available: this demo stores only a synthetic document type and reference, not an uploaded file.
                    The reference is partially masked.
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </Drawer>

      <ConfirmActionDialog
        open={Boolean(dialog)}
        title={kycCopy?.title}
        description={dialog && kycCopy ? `${dialog.item.fullName} - ${kycCopy.impact}` : ""}
        confirmLabel={kycCopy?.confirmLabel}
        tone={kycCopy?.tone}
        reasonPlaceholder={kycCopy?.placeholder || ""}
        busy={deciding}
        error={dialogError}
        onCancel={() => { if (!deciding) setDialog(null); }}
        onConfirm={submitKycDecision}
      />

      <ConfirmActionDialog
        open={Boolean(loanDialog)}
        title={loanCopy?.title}
        description={loanDialog && loanCopy ? `Application #${loanDialog.app.id} (${money(loanDialog.app.principal)}) - ${loanCopy.impact}` : ""}
        confirmLabel={loanCopy?.confirmLabel}
        tone={loanCopy?.tone}
        reasonPlaceholder={loanCopy?.placeholder || ""}
        busy={deciding}
        error={dialogError}
        onCancel={() => { if (!deciding) setLoanDialog(null); }}
        onConfirm={submitLoanAction}
      />
    </section>
  );
}
