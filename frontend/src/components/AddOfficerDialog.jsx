import { useEffect, useRef, useState } from "react";
import { UserPlus, X } from "lucide-react";

const PASSWORD_RULES = [
  { label: "At least 12 characters", ok: (p) => p.length >= 12 },
  { label: "An uppercase letter (A-Z)", ok: (p) => /[A-Z]/.test(p) },
  { label: "A lowercase letter (a-z)", ok: (p) => /[a-z]/.test(p) },
  { label: "A digit (0-9)", ok: (p) => /[0-9]/.test(p) },
  { label: "A symbol (e.g. #, @, !)", ok: (p) => /[^A-Za-z0-9]/.test(p) },
  { label: "No spaces", ok: (p) => !/\s/.test(p) },
];

export function AddOfficerDialog({ open, busy, error, onCancel, onSubmit }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [limit, setLimit] = useState("500000");
  const [clientError, setClientError] = useState("");
  const nameRef = useRef(null);

  useEffect(() => {
    if (open) {
      setFullName("");
      setEmail("");
      setPassword("");
      setConfirm("");
      setLimit("500000");
      setClientError("");
      const id = window.setTimeout(() => nameRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const rulesMet = PASSWORD_RULES.every((rule) => rule.ok(password));

  function submit(event) {
    event.preventDefault();
    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    if (name.length < 2 || name.length > 100) { setClientError("Enter the officer's full name (2-100 characters)."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { setClientError("Enter a valid email address."); return; }
    if (!rulesMet) { setClientError("The password does not meet every requirement below."); return; }
    if (password !== confirm) { setClientError("Passwords do not match."); return; }
    const limitValue = Number(limit.trim());
    if (!Number.isFinite(limitValue) || limitValue <= 0 || limitValue > 9999999999999.99) {
      setClientError("Enter a positive approval limit (in rupees).");
      return;
    }
    setClientError("");
    onSubmit({ email: mail, fullName: name, password, approvalLimit: limitValue });
  }

  const shownError = clientError || error;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-officer-title"
      style={{ position: "fixed", inset: 0, zIndex: 1080, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(9, 8, 16, 0.55)", backdropFilter: "blur(6px)" }}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}
    >
      <div className="card border-0 shadow-lg" style={{ width: "100%", maxWidth: "30rem" }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
            <div>
              <h2 id="add-officer-title" className="h5 mb-1 d-inline-flex align-items-center gap-2">
                <UserPlus size={17} className="text-lav" aria-hidden="true" /> Add a new officer
              </h2>
              <p className="small text-body-secondary mb-0">
                Creates a bank officer account that can sign in immediately at the normal login page. Share the credentials with the officer securely.
              </p>
            </div>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Close dialog" onClick={onCancel} disabled={busy}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          <form className="vstack gap-3" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="officer-name" className="form-label">Full name</label>
              <input id="officer-name" ref={nameRef} className="form-control" value={fullName} maxLength={100}
                onChange={(event) => setFullName(event.target.value)} disabled={busy} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="officer-email" className="form-label">Email</label>
              <input id="officer-email" type="email" className="form-control" value={email} maxLength={254}
                onChange={(event) => setEmail(event.target.value)} disabled={busy} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="officer-password" className="form-label">Password</label>
              <input id="officer-password" type="password" className="form-control" value={password} maxLength={72}
                onChange={(event) => setPassword(event.target.value)} disabled={busy} autoComplete="new-password" />
              <ul className="list-unstyled small mt-2 mb-0" aria-label="Password requirements">
                {PASSWORD_RULES.map((rule) => {
                  const pass = password !== "" && rule.ok(password);
                  return (
                    <li key={rule.label} style={{ color: pass ? "#2F7D32" : "#6B6880" }}>
                      <span aria-hidden="true">{pass ? "● " : "○ "}</span>
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <label htmlFor="officer-confirm" className="form-label">Confirm password</label>
              <input id="officer-confirm" type="password" className="form-control" value={confirm} maxLength={72}
                onChange={(event) => setConfirm(event.target.value)} disabled={busy} autoComplete="new-password" />
              {password !== "" && confirm !== "" && password !== confirm && (
                <div className="small text-danger mt-1">Passwords do not match.</div>
              )}
            </div>
            <div>
              <label htmlFor="officer-limit" className="form-label">Approval limit (rupees)</label>
              <input id="officer-limit" inputMode="decimal" className="form-control" value={limit}
                onChange={(event) => setLimit(event.target.value)} disabled={busy} placeholder="e.g. 500000" />
              <div className="form-text">Maximum amount this officer may approve. The bank requires every staff member to carry an explicit limit.</div>
            </div>
            {shownError && <div className="alert alert-danger mb-0" role="alert">{shownError}</div>}
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create officer"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}