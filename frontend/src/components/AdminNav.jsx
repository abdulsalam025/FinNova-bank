import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3, ChevronDown, ClipboardCheck, FileText, Gavel, LayoutDashboard,
  RefreshCw, ShieldCheck, UserCheck, Users, Hourglass,
} from "lucide-react";
import { http } from "../api/http.js";

/* Fired by the Admin Center after a decision so the badges update immediately. */
export const ADMIN_REFRESH_EVENT = "fn:admin-refresh";
const POLL_MS = 60000;
const BANKING_KEY = "fn-admin-banking-open";
/* Transfers are customer-only on the server, and the admin dashboard replaces the customer one. */
const HIDDEN_BANKING = new Set(["/dashboard", "/transfer"]);

const GROUPS = [
  {
    title: "Administration",
    items: [
      { label: "Overview", to: "/admin", match: {}, Icon: LayoutDashboard },
    ],
  },
  {
    title: "Approvals",
    items: [
      { label: "Final approvals", to: "/admin?view=loans", match: { view: "loans", loans: null }, Icon: Gavel,
        count: (c) => c.forwarded, tone: "action", hint: "forwarded by officers, awaiting your decision" },
      { label: "With officers", to: "/admin?view=loans&loans=UNDER_REVIEW", match: { view: "loans", loans: "UNDER_REVIEW" },
        Icon: Hourglass, count: (c) => c.review, tone: "muted", hint: "under officer review" },
    ],
  },
  {
    title: "Oversight",
    items: [
      { label: "Officer activity", to: "/admin?view=officers", match: { view: "officers" }, Icon: UserCheck },
      { label: "KYC overview", to: "/admin?view=kyc", match: { view: "kyc" }, Icon: ShieldCheck,
        count: (c) => c.kycPending, tone: "muted", hint: "pending identity checks" },
      { label: "Audit log", to: "/admin?view=audit", match: { view: "audit" }, Icon: FileText },
      { label: "Product performance", to: "/admin?view=products", match: { view: "products" }, Icon: BarChart3 },
      { label: "Officer workspace", to: "/officer", Icon: ClipboardCheck },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Users & officers", to: "/admin?view=users", match: { view: "users" }, Icon: Users },
    ],
  },
];

function isActive(item, location) {
  const [path] = item.to.split("?");
  if (location.pathname !== path) return false;
  if (!item.match) return true;
  const params = new URLSearchParams(location.search);
  const keys = Object.keys(item.match);
  if (keys.length === 0) return !params.get("view");
  return keys.every((key) => (item.match[key] === null ? !params.get(key) : params.get(key) === item.match[key]));
}

function useAdminCounts() {
  const [state, setState] = useState({ status: "loading", data: null, updatedAt: null });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    const total = (url, status) =>
      http.get(url, { params: { page: 0, size: 1, status } }).then((r) => Number(r.data?.totalElements ?? 0));
    try {
      const [forwarded, submitted, review, info, kycPending, dashboard] = await Promise.all([
        total("/loan-applications", "APPROVED"),
        total("/loan-applications", "SUBMITTED"),
        total("/loan-applications", "UNDER_REVIEW"),
        total("/loan-applications", "ADDITIONAL_INFO_REQUIRED"),
        total("/officer/kyc", "PENDING"),
        http.get("/dashboard").then((r) => r.data).catch(() => null),
      ]);
      if (id !== seq.current) return;
      const overdue = dashboard?.loans?.overdueInstallments;
      setState({
        status: "ready",
        updatedAt: new Date(),
        data: {
          forwarded, submitted, review, info, kycPending,
          withOfficers: submitted + review + info,
          overdue: overdue === null || overdue === undefined ? null : Number(overdue),
        },
      });
    } catch {
      if (id !== seq.current) return;
      setState((current) => ({ ...current, status: "error" }));
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(ADMIN_REFRESH_EVENT, load);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(ADMIN_REFRESH_EVENT, load);
    };
  }, [load]);

  return { ...state, reload: load };
}

function readBankingOpen() {
  try { return window.sessionStorage.getItem(BANKING_KEY) === "1"; } catch { return false; }
}

function RailItem({ item, active, n, onNavigate }) {
  const { Icon } = item;
  return (
    <Link
      to={item.to}
      state={item.match ? { adminScroll: Date.now() } : undefined}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={item.hint ? `${item.label}: ${item.hint}` : undefined}
      className={"fn-rail-link d-flex align-items-center justify-content-between" + (active ? " active" : "")}
    >
      <span className="d-flex align-items-center gap-2 min-w-0">
        <Icon size={17} strokeWidth={2.1} aria-hidden="true" />
        <span className="text-truncate">{item.label}</span>
      </span>
      {n !== null && n !== undefined && n > 0 && (
        <>
          <span className={`ofc-rail-badge ${item.tone || "muted"}`} aria-hidden="true">{n > 99 ? "99+" : n}</span>
          <span className="visually-hidden">, {n} {item.hint || "items"}</span>
        </>
      )}
    </Link>
  );
}

export default function AdminNav({ onNavigate, bankingItems = [] }) {
  const location = useLocation();
  const counts = useAdminCounts();
  const c = counts.data;
  const banking = bankingItems.filter((item) => !HIDDEN_BANKING.has(item.to));
  const onBankingPage = banking.some((item) => location.pathname === item.to);
  const [bankingOpen, setBankingOpen] = useState(() => readBankingOpen());
  const showBanking = bankingOpen || onBankingPage;

  function toggleBanking() {
    const next = !showBanking;
    setBankingOpen(next);
    try { window.sessionStorage.setItem(BANKING_KEY, next ? "1" : "0"); } catch { /* storage unavailable */ }
  }

  const updated = counts.updatedAt
    ? counts.updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="ofc-nav">
      <section className="ofc-rail-card" aria-label="Decisions waiting for you">
        <div className="ofc-rail-card-top">
          <span className="ofc-rail-role">Administrator</span>
        </div>
        <div className="ofc-rail-metric">
          <span className="num">{c ? c.forwarded : "-"}</span>
          <span className="lbl">{c && c.forwarded === 1 ? "loan awaits final approval" : "loans await final approval"}</span>
        </div>
        <div className="ofc-rail-meta">
          <span title="Submitted, under review or waiting for customer information">With officers {c ? c.withOfficers : "-"}</span>
          <span>KYC pending {c ? c.kycPending : "-"}</span>
        </div>
        {c && c.overdue !== null && (
          <div className="ofc-rail-meta">
            <span className={c.overdue > 0 ? "stale" : ""}>Overdue installments {c.overdue}</span>
          </div>
        )}
        {counts.status === "error" ? (
          <button type="button" className="ofc-rail-retry" onClick={counts.reload}>
            <RefreshCw size={12} aria-hidden="true" /> Counts unavailable - retry
          </button>
        ) : (
          <div className="ofc-rail-live" aria-live="polite">
            <span className="dot" aria-hidden="true" />
            {updated ? `Live - updated ${updated}` : "Loading live counts..."}
          </div>
        )}
      </section>

      {GROUPS.map((group, index) => (
        <div key={group.title}>
          <p className={`fn-rail-group${index > 0 ? " mt-2" : ""}`}>{group.title}</p>
          {group.items.map((item) => (
            <RailItem key={item.label} item={item} active={isActive(item, location)}
              n={c && item.count ? item.count(c) : null} onNavigate={onNavigate} />
          ))}
        </div>
      ))}

      {banking.length > 0 && (
        <div className="mt-2">
          <button type="button" className="adm-rail-toggle" aria-expanded={showBanking} aria-controls="adm-banking-links"
            onClick={toggleBanking}>
            <span>My banking</span>
            <ChevronDown size={14} aria-hidden="true" className={showBanking ? "open" : ""} />
          </button>
          {showBanking && (
            <div id="adm-banking-links">
              {banking.map((item) => (
                <RailItem key={item.label} item={{ ...item, badge: undefined }}
                  active={location.pathname === item.to} n={null} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
