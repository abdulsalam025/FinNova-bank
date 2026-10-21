import { useEffect, useRef, useState } from "react";
import { CircleCheck, HandCoins, Search, X } from "lucide-react";
import { http } from "../api/http.js";
import { friendlyError } from "./panels.jsx";

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

function last4(accountNumber) {
  const text = String(accountNumber || "");
  return text.length <= 4 ? text : text.slice(-4);
}

function newKey() {
  return window.crypto?.randomUUID ? window.crypto.randomUUID() : `KEY-${Date.now()}-${Math.random()}`;
}

export function CreditAccountDialog({ open, onCancel, onCreated }) {
  const [accounts, setAccounts] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const queryRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setAccounts(null); setLoadError(""); setQuery(""); setSelected(null);
    setAmount(""); setReason(""); setBusy(false); setError(""); setResult(null);
    window.setTimeout(() => queryRef.current?.focus(), 40);
    http.get("/accounts", { params: { page: 0, size: 100, sortBy: "createdAt", sortDirection: "DESC" } })
      .then((response) => {
        if (cancelled) return;
        const items = response.data?.items ?? [];
        setAccounts(items.filter((a) => String(a.status).toUpperCase() === "ACTIVE"));
      })
      .catch((err) => { if (!cancelled) setLoadError(friendlyError(err, "Accounts could not be loaded.")); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) { if (event.key === "Escape" && !busy) onCancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const visible = (accounts ?? []).filter((a) => {
    const text = `${a.accountNumber ?? ""} ${a.nickname ?? ""}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  }).slice(0, 6);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!selected) { setError("Choose an account first."); return; }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > 9999999999999.99) { setError("Enter a positive amount (in rupees)."); return; }
    if (reason.trim().length < 6) { setError("Give a clear reason (at least 6 characters) — it is stored in the audit log."); return; }
    setBusy(true);
    try {
      const response = await http.post(`/admin/accounts/${selected.id}/credit`,
        { amount: value, reason: reason.trim() },
        { headers: { "Idempotency-Key": newKey() } });
      setResult({ ...response.data, replayed: response.headers?.["idempotency-replayed"] === "true", account: selected });
      onCreated?.();
    } catch (err) {
      setError(friendlyError(err, "The credit could not be applied."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="credit-title"
      style={{ position: "fixed", inset: 0, zIndex: 1080, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(9, 8, 16, 0.55)", backdropFilter: "blur(6px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="card border-0 shadow-lg" style={{ width: "100%", maxWidth: "32rem" }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
            <div>
              <h2 id="credit-title" className="h5 mb-1 d-inline-flex align-items-center gap-2">
                <HandCoins size={17} className="text-lav" aria-hidden="true" /> Credit money to an account
              </h2>
              <p className="small text-body-secondary mb-0">Creates simulated funds in one active account. The entry is written to the real ledger, idempotency-protected, and audited with your reason.</p>
            </div>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Close dialog" onClick={onCancel} disabled={busy}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          {result ? (
            <div className="text-center py-2">
              <CircleCheck size={42} className="text-pos mb-2" aria-hidden="true" />
              <h3 className="h6">{result.replayed ? "This top-up was already applied" : "Account credited"}</h3>
              <p className="small mb-2">₹{Number(result.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} → <strong>****{last4(result.account?.accountNumber)}</strong> ({result.account?.nickname})</p>
              <p className="small text-body-secondary mb-1">New balance: <strong className="text-pos">{money(result.newBalance)}</strong></p>
              <p className="small text-body-secondary font-monospace" style={{ fontSize: "0.7rem" }}>ref {result.reference}</p>
              <button type="button" className="btn btn-primary mt-3" onClick={onCancel}>Done</button>
            </div>
          ) : (
            <form className="vstack gap-3" onSubmit={submit} noValidate>
              <div>
                <label htmlFor="credit-search" className="form-label">1 · Pick the account</label>
                <div className="input-group mb-2">
                  <span className="input-group-text"><Search size={14} aria-hidden="true" /></span>
                  <input id="credit-search" ref={queryRef} className="form-control" value={query}
                    onChange={(e) => setQuery(e.target.value)} placeholder="Search by number or nickname" autoComplete="off" />
                </div>
                {loadError && <div className="alert alert-danger mb-0">{loadError}</div>}
                {accounts === null && !loadError && <div className="small text-body-secondary">Loading active accounts…</div>}
                <div className="vstack gap-2" role="listbox" aria-label="Accounts">
                  {visible.map((a) => {
                    const isSel = selected?.id === a.id;
                    return (
                      <button key={a.id} type="button" role="option" aria-selected={isSel}
                        className="qa-tile text-start" style={isSel ? { borderColor: "var(--fn-lavender-deep)", boxShadow: "0 0 0 3px rgba(142,121,246,0.25)" } : undefined}
                        onClick={() => setSelected(a)}>
                        <span className="qa-ico lav"><HandCoins size={15} aria-hidden="true" /></span>
                        <span className="flex-fill">
                          <span className="d-block fw-semibold">{a.nickname} · ****{last4(a.accountNumber)}</span>
                          <span className="small text-body-secondary">{a.accountType} · {a.currency} · balance {money(a.balance)}</span>
                        </span>
                        {isSel && <CircleCheck size={16} className="text-lav" aria-hidden="true" />}
                      </button>
                    );
                  })}
                  {accounts !== null && visible.length === 0 && (
                    <div className="small text-body-secondary">No active accounts match this search.</div>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="credit-amount" className="form-label">2 · Amount (₹)</label>
                <input id="credit-amount" inputMode="decimal" className="form-control" value={amount}
                  onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 25000.00" disabled={busy} />
              </div>
              <div>
                <label htmlFor="credit-reason" className="form-label">3 · Reason (recorded in the audit log)</label>
                <textarea id="credit-reason" className="form-control" rows={2} maxLength={200} value={reason}
                  onChange={(e) => setReason(e.target.value)} placeholder="e.g. Seed synthetic balance for customer demo" disabled={busy} />
              </div>
              {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
              <div className="d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
                <button type="submit" className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={busy}>
                  {busy ? "Applying…" : "Apply credit"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}