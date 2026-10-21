import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft, ClipboardCheck, HandCoins, KeyRound, Landmark, LockKeyhole, ShieldCheck, AlertTriangle,
  UserRound, WalletCards,
} from "lucide-react";
import { getHealth } from "../api/health.js";

/*
 * FinNova Bank - branded layout around the existing sign-in form.
 * The form itself (fields, validation, submit, redirects) is still rendered by LoginPage,
 * passed in as children, so authentication behaviour is unchanged. This component only
 * adds the surrounding design, a live backend status pill and a Caps Lock hint.
 */

const CUSTOMER_POINTS = [
  { Icon: WalletCards, title: "Accounts and transfers", text: "Balances, transfers and downloadable receipts in one place." },
  { Icon: HandCoins, title: "Loans with a live EMI", text: "Compare products, apply and follow every review step." },
  { Icon: ShieldCheck, title: "Protected session", text: "You stay signed in through an HttpOnly cookie that page scripts cannot read." },
];

const STAFF_POINTS = [
  { Icon: ClipboardCheck, title: "Loan officers", text: "Work the review queue, verify KYC and forward applications." },
  { Icon: ShieldCheck, title: "Administrators", text: "Give the final approval, release funds and oversee officers." },
  { Icon: LockKeyhole, title: "Role-checked on the server", text: "Every staff action is authorised by the backend, not just the screen." },
];

function useBackendStatus() {
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then((data) => setStatus(data?.status === "UP" ? "up" : "degraded"))
      .catch(() => { if (!controller.signal.aborted) setStatus("down"); });
    return () => controller.abort();
  }, []);
  return status;
}

export default function AuthShowcase({ children }) {
  const location = useLocation();
  const staff = new URLSearchParams(location.search).get("next") === "admin";
  const status = useBackendStatus();
  const [capsOn, setCapsOn] = useState(false);

  // Caps Lock hint: read from key events that bubble up from the password field.
  function onKey(event) {
    if (event.target?.type === "password" && typeof event.getModifierState === "function") {
      setCapsOn(event.getModifierState("CapsLock"));
    }
  }
  function onBlur(event) {
    if (event.target?.type === "password") setCapsOn(false);
  }

  const statusText = {
    loading: "Checking connection\u2026",
    up: "Secure connection to FinNova",
    degraded: "Backend reachable, reporting issues",
    down: "Backend offline - sign-in will fail",
  }[status];

  const points = staff ? STAFF_POINTS : CUSTOMER_POINTS;

  return (
    <div className={"fna" + (staff ? " is-staff" : "")}>
      <div className="fna-bg" aria-hidden="true" />
      <div className="fna-frame">
        {/* ---------------- brand panel */}
        <aside className="fna-brand" aria-label="About FinNova Bank">
          <div className="fna-brand-top">
            <Link to="/" className="fna-logo">
              <span className="fna-logo-mark" aria-hidden="true"><Landmark size={18} strokeWidth={2.4} /></span>
              FinNova Bank
            </Link>
            <span className="fna-chip">{staff ? "Staff access" : "Customer access"}</span>
          </div>

          <div className="fna-brand-copy">
            <h2 className="fna-brand-title">
              {staff ? (
                <>Run the lending desk with <span>full oversight.</span></>
              ) : (
                <>Your money and loans, <span>one secure sign-in away.</span></>
              )}
            </h2>
            <p className="fna-brand-lead">
              {staff
                ? "Officers and administrators sign in here. The workspace you see depends on the role on your account."
                : "Sign in to see your accounts, move money and follow your loan from application to payout."}
            </p>
          </div>

          <ul className="fna-points">
            {points.map(({ Icon, title, text }) => (
              <li key={title}>
                <span className="fna-point-icon" aria-hidden="true"><Icon size={17} /></span>
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="fna-card-art" aria-hidden="true">
            <div className="fna-card-art-top">
              <span className="fna-card-chip" />
              <Landmark size={18} />
            </div>
            <div className="fna-card-art-dots">
              <span /><span /><span /><span />
            </div>
            <div className="fna-card-art-foot">
              <span>FINNOVA</span>
              <span>DEMO</span>
            </div>
          </div>
        </aside>

        {/* ---------------- form panel */}
        <section className="fna-panel">
          <div className="fna-panel-top">
            <Link to="/" className="fna-back"><ArrowLeft size={15} aria-hidden="true" /> Back to home</Link>
            <Link to="/system-status" className={`fna-status is-${status}`}>
              <span className="fna-status-dot" aria-hidden="true" />{statusText}
            </Link>
          </div>

          <div className="fna-form" onKeyDown={onKey} onKeyUp={onKey} onBlur={onBlur}>
            {children}
          </div>

          {capsOn && (
            <p className="fna-caps" role="status">
              <AlertTriangle size={15} aria-hidden="true" /> Caps Lock is on
            </p>
          )}

          <div className="fna-switch">
            {staff ? (
              <>Not staff? <Link to="/login">Customer sign-in</Link></>
            ) : (
              <>Bank staff? <Link to="/login?next=admin">Admin &amp; officer sign-in</Link></>
            )}
          </div>

          <ul className="fna-assurance" aria-label="Security notes">
            <li><KeyRound size={14} aria-hidden="true" /> CSRF-protected sign-in</li>
            <li><LockKeyhole size={14} aria-hidden="true" /> HttpOnly session cookie</li>
            <li><UserRound size={14} aria-hidden="true" /> Never share your password</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
