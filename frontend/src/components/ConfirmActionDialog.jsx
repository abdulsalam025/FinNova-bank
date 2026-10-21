import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const TONES = { primary: "btn-primary", success: "btn-accent", danger: "btn-danger" };

export function ConfirmActionDialog({
  open, title, description, confirmLabel = "Confirm", tone = "primary",
  requireReason = true, reasonLabel = "Reason (required)", reasonPlaceholder = "",
  busy = false, error = "", onCancel, onConfirm,
}) {
  const reduce = useReducedMotion();
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState("");

  // Reset form + lock scroll while open; restore focus to the invoking control on close.
  useEffect(() => {
    if (!open) return undefined;
    setReason("");
    setLocalError("");
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape" && !busy) onCancel?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  function handleConfirm(event) {
    event.preventDefault();
    const clean = reason.trim();
    if (requireReason && !clean) {
      setLocalError("A short reason is required.");
      return;
    }
    onConfirm?.(clean);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fn-dialog-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) onCancel?.();
          }}
        >
          <motion.div
            className="fn-dialog"
            role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <h2 id="confirm-dialog-title" className="h5 mb-2">{title}</h2>
            <p className="text-body-secondary small mb-3">{description}</p>
            <form onSubmit={handleConfirm} noValidate>
              {requireReason && (
                <>
                  <label htmlFor="confirm-dialog-reason" className="form-label">{reasonLabel}</label>
                  <textarea
                    id="confirm-dialog-reason"
                    className="form-control"
                    rows={3}
                    maxLength={400}
                    autoFocus
                    value={reason}
                    onChange={(event) => { setReason(event.target.value); setLocalError(""); }}
                    placeholder={reasonPlaceholder}
                    disabled={busy}
                  />
                  <div className="form-text">{reason.length}/400</div>
                </>
              )}
              {(localError || error) && (
                <p className="text-danger small mt-1 mb-0" role="alert">{localError || error}</p>
              )}
              <div className="d-flex justify-content-end gap-2 mt-3">
                <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
                <button type="submit" className={`btn ${TONES[tone] || TONES.primary}`} disabled={busy}>
                  {busy ? "Working…" : confirmLabel}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}