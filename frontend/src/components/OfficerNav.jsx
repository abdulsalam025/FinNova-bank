import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Clock, FilePlus2, FileSearch, History, Inbox, LayoutDashboard, MessageCircleQuestion,
  RefreshCw, Send, ShieldQuestion, UserRound,
} from "lucide-react";
import { http } from "../api/http.js";

/* Fired by the Officer Center after a decision so the badges update immediately. */
export const OFFICER_REFRESH_EVENT = "fn:officer-refresh";
const POLL_MS = 60000;

const GROUPS = [
  {
    title: "Verification",
    items: [
      { label: "Overview", to: "/officer", match: {}, Icon: LayoutDashboard },
      { label: "Loan queue", to: "/officer?view=loans", match: { view: "loans", loans: null }, Icon: Inbox,
        count: (c) => c.submitted + c.review, tone: "action", hint: "new + under review" },
      { label: "New applications", to: "/officer?view=loans&loans=SUBMITTED", match: { view: "loans", loans: "SUBMITTED" },
        Icon: FilePlus2, count: (c) => c.submitted, tone: "action", hint: "waiting to be picked up" },
      { label: "Under review", to: "/officer?view=loans&loans=UNDER_REVIEW", match: { view: "loans", loans: "UNDER_REVIEW" },
        Icon: FileSearch, count: (c) => c.review, tone: "action", hint: "in verification" },
      { label: "Info requested", to: "/officer?view=loans&loans=ADDITIONAL_INFO_REQUIRED", match: { view: "loans", loans: "ADDITIONAL_INFO_REQUIRED" },
        Icon: MessageCircleQuestion, count: (c) => c.info, tone: "muted", hint: "waiting on customer" },
      { label: "Forwarded to admin", to: "/officer?view=loans&loans=APPROVED", match: { view: "loans", loans: "APPROVED" },
        Icon: Send, count: (c) => c.forwarded, tone: "muted", hint: "awaiting final approval" },
      { label: "KYC reviews", to: "/officer?view=kyc&kyc=PENDING", match: { view: "kyc" },
        Icon: ShieldQuestion, count: (c) => c.kycPending, tone: "action", hint: "pending identity checks" },
    ],
  },
  {
    title: "Records",
    items: [
      { label: "My decision history", to: "/officer?view=history", match: { view: "history" }, Icon: History },
      { label: "Profile", to: "/profile", Icon: UserRound },
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

function ageText(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return { text: `${minutes} min`, stale: false };
  const hours = Math.round(minutes / 60);
  if (hours < 48) return { text: `${hours} h`, stale: hours >= 24 };
  return { text: `${Math.round(hours / 24)} days`, stale: true };
}

function money(value) {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return null;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function useOfficerCounts() {
  const [state, setState] = useState({ status: "loading", data: null, updatedAt: null });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    const page = (url, status) => http.get(url, { params: { page: 0, size: 1, status } }).then((r) => r.data);
    try {
      const [submitted, review, info, forwarded, kycPending, kycVerified, kycRejected] = await Promise.all([
        page("/loan-applications", "SUBMITTED"),
        page("/loan-applications", "UNDER_REVIEW"),
        page("/loan-applications", "ADDITIONAL_INFO_REQUIRED"),
        page("/loan-applications", "APPROVED"),
        page("/officer/kyc", "PENDING"),
        page("/officer/kyc", "VERIFIED"),
        page("/officer/kyc", "REJECTED"),
      ]);
      if (id !== seq.current) return;
      const total = (d) => Number(d?.totalElements ?? 0);
      setState({
        status: "ready",
        updatedAt: new Date(),
        data: {
          submitted: total(submitted),
          review: total(review),
          info: total(info),
          forwarded: total(forwarded),
          kycPending: total(kycPending),
          kycVerified: total(kycVerified),
          kycRejected: total(kycRejected),
          /* The KYC queue is ordered oldest first, so the first pending item is the oldest. */
          oldestPendingKyc: kycPending?.items?.[0]?.createdAt ?? null,
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
    window.addEventListener(OFFICER_REFRESH_EVENT, load);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(OFFICER_REFRESH_EVENT, load);
    };
  }, [load]);

  return { ...state, reload: load };
}

export default function OfficerNav({ user, onNavigate }) {
  const location = useLocation();
  const counts = useOfficerCounts();
  const c = counts.data;

  const awaiting = c ? c.submitted + c.review + c.kycPending : null;
  const reviewed = c ? c.kycVerified + c.kycRejected : 0;
  const pool = c ? reviewed + c.kycPending : 0;
  const completion = c ? (pool > 0 ? Math.round((reviewed / pool) * 100) : 100) : 0;
  const oldest = c ? ageText(c.oldestPendingKyc) : null;
  const limit = money(user?.approvalLimit);
  const updated = counts.updatedAt
    ? counts.updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="ofc-nav">
      <section className="ofc-rail-card" aria-label="Your workload">
        <div className="ofc-rail-card-top">
          <span className="ofc-rail-role">Loan officer</span>
          {limit && <span className="ofc-rail-limit" title="Your approval limit">Limit {limit}</span>}
        </div>
        <div className="ofc-rail-metric">
          <span className="num">{awaiting === null ? "-" : awaiting}</span>
          <span className="lbl">{awaiting === 1 ? "item awaits you" : "items await you"}</span>
        </div>
        <div className="ofc-rail-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={completion} aria-label="KYC reviews completed">
          <span style={{ width: `${completion}%` }} />
        </div>
        <div className="ofc-rail-meta">
          <span>KYC done {c ? `${completion}%` : "-"}</span>
          {oldest && (
            <span className={oldest.stale ? "stale" : ""} title="Age of the oldest pending KYC submission">
              <Clock size={11} aria-hidden="true" /> oldest {oldest.text}
            </span>
          )}
        </div>
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
          {group.items.map((item) => {
            const active = isActive(item, location);
            const n = c && item.count ? item.count(c) : null;
            const { Icon } = item;
            return (
              <Link
                key={item.label}
                to={item.to}
                state={item.match ? { officerScroll: Date.now() } : undefined}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={item.hint ? `${item.label}: ${item.hint}` : undefined}
                className={"fn-rail-link d-flex align-items-center justify-content-between" + (active ? " active" : "")}
              >
                <span className="d-flex align-items-center gap-2 min-w-0">
                  <Icon size={17} strokeWidth={2.1} aria-hidden="true" />
                  <span className="text-truncate">{item.label}</span>
                </span>
                {n !== null && n > 0 && (
                  <>
                    <span className={`ofc-rail-badge ${item.tone || "muted"}`} aria-hidden="true">{n > 99 ? "99+" : n}</span>
                    <span className="visually-hidden">, {n} {item.hint || "items"}</span>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
