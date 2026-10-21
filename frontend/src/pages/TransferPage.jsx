import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, IndianRupee, RefreshCw, Search, Send } from "lucide-react";
import { listAccounts } from "../api/accounts.js";
import { createTransfer, lookupTransferRecipient } from "../api/transfers.js";

function errorText(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.detail ||
    error?.response?.data?.error ||
    error?.message ||
    "The request failed. Please try again."
  );
}

function money(value, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export default function TransferPage() {
  const [accounts, setAccounts] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [recipientAccountNumber, setRecipientAccountNumber] = useState("");
  const [recipient, setRecipient] = useState(null);
  const [lookingUpRecipient, setLookingUpRecipient] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const idempotencyKey = useRef(null);
  const [receipt, setReceipt] = useState(null);

  function downloadReceipt() {
    if (!receipt) return;
    const rows = [
      ["Reference", receipt.reference],
      ["Date", new Date(receipt.occurredAt).toLocaleString()],
      ["From", (receipt.from?.nickname ?? "") + " (****" + String(receipt.from?.accountNumber ?? "").slice(-4) + ")"],
      ["To", (receipt.to?.recipientName ?? "") + " - " + (receipt.to?.maskedAccountNumber ?? "")],
    ];
    if (receipt.note) rows.push(["Note", receipt.note]);
    const W = 640, pad = 28, rowH = 32;
    const H = 96 + 66 + rows.length * rowH + 60 + pad;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    let y = pad;
    ctx.fillStyle = "#16132a";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText("FINNOVA BANK", pad, y + 16);
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#6b6685";
    ctx.fillText("Simulated transfer receipt - no real money moved", pad, y + 34);
    y += 92;
    ctx.textAlign = "center";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#6b6685";
    ctx.fillText("Amount sent", W / 2, y);
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.fillStyle = "#14162b";
    ctx.fillText(money(receipt.amount), W / 2, y + 38);
    ctx.textAlign = "left";
    y += 60;
    ctx.strokeStyle = "#e4e2ef";
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();
    y += 26;
    rows.forEach(([label, value]) => {
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = "#6b6685";
      ctx.fillText(label, pad, y);
      ctx.font = "13px Consolas, monospace";
      ctx.fillStyle = "#14162b";
      let text = String(value ?? "-");
      while (ctx.measureText(text).width > W - pad - 150 && text.length > 4) text = text.slice(0, -2);
      ctx.fillText(text, 150, y);
      y += rowH;
    });
    y += 10;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "#9a93b8";
    ctx.fillText("Generated " + new Date().toLocaleString() + " - FinNova Bank simulation", pad, y);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "finnova-receipt-" + (receipt.reference || "transfer") + ".png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const data = await listAccounts({ page: 0, size: 100, sortBy: "createdAt", sortDirection: "DESC" });
      const items = Array.isArray(data) ? data : data?.items ?? [];
      setAccounts(items);
      setSourceId((current) => {
        if (items.some((a) => String(a.id) === current && a.status === "ACTIVE")) return current;
        return String(items.find((a) => a.status === "ACTIVE")?.id ?? "");
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const sourceAccount = accounts.find((account) => String(account.id) === sourceId);
  const parsedAmount = Number(amount);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0.01;
  const validTarget = Boolean(recipient && recipient.currency === "INR" && String(recipient.targetAccountId) !== sourceId);

  async function handleRecipientLookup() {
    setError("");
    setNotice("");
    setRecipient(null);
    const accountNumber = recipientAccountNumber.trim().toUpperCase();
    if (!/^[A-Z0-9]{8,24}$/.test(accountNumber)) {
      setError("Enter a valid recipient account number (8–24 letters or digits).");
      return;
    }
    setLookingUpRecipient(true);
    try {
      const result = await lookupTransferRecipient(accountNumber);
      if (!result || result.currency !== "INR" || String(result.targetAccountId) === sourceId) {
        setError("Choose an eligible INR recipient account different from your source account.");
        return;
      }
      setRecipient(result);
      idempotencyKey.current = null;
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLookingUpRecipient(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setReceipt(null);
    if (!sourceAccount || sourceAccount.status !== "ACTIVE") {
      setError("Choose an active source account.");
      return;
    }
    if (!validTarget) {
      setError("Find and confirm an eligible recipient account before transferring.");
      return;
    }
    if (!validAmount || !/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
      setError("Enter an amount of at least ₹0.01, with no more than two decimal places.");
      return;
    }
    if (parsedAmount > Number(sourceAccount.balance)) {
      setError("The amount exceeds the displayed source balance. The backend will perform the final balance check.");
      return;
    }
    if (note.length > 120) {
      setError("The note must be 120 characters or fewer.");
      return;
    }

    setSubmitting(true);
    if (!idempotencyKey.current) {
      idempotencyKey.current = globalThis.crypto?.randomUUID?.();
    }
    if (!idempotencyKey.current) {
      setError("This browser cannot generate a secure request ID. Please use an up-to-date browser.");
      setSubmitting(false);
      return;
    }

    try {
      const view = await createTransfer(
        {
          sourceAccountId: Number(sourceId),
          targetAccountId: Number(recipient.targetAccountId),
          amount: amount.trim(),
          note: note.trim() || null,
        },
        idempotencyKey.current
      );
      idempotencyKey.current = null;
      setReceipt({
        reference: view?.reference || "unavailable",
        occurredAt: view?.occurredAt || new Date().toISOString(),
        amount: amount.trim(),
        note: note.trim(),
        from: sourceAccount,
        to: recipient,
        balanceAfter: view?.sourceBalanceAfter ?? null,
      });
      setNotice("Transfer completed. Your receipt is shown above.");
      setAmount("");
      setNote("");
      setRecipientAccountNumber("");
      setRecipient(null);
      await loadAccounts();
    } catch (err) {
      // Retain the same idempotency key when retrying this request.
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="transfer-heading">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <p className="eyebrow mb-1">BANKING OPERATIONS</p>
          <h1 id="transfer-heading" className="h2 mb-1">Transfer Money</h1>
          <p className="text-body-secondary mb-0">Simulated transfers between eligible FinNova accounts.</p>
        </div>
        <button type="button" className="btn btn-outline-primary d-inline-flex align-items-center gap-2" onClick={loadAccounts} disabled={loadingAccounts}>
          <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
          {loadingAccounts ? "Refreshing…" : "Refresh accounts"}
        </button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {receipt && (
        <section className="card border-0 shadow-sm mb-4" aria-labelledby="receipt-heading">
          <div className="card-body p-4">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <h2 id="receipt-heading" className="h5 mb-0 d-inline-flex align-items-center gap-2">
                <CircleCheck size={17} className="text-success" aria-hidden="true" /> Transfer receipt
              </h2>
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={downloadReceipt}>Download PNG</button>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setReceipt(null)}>Send another</button>
              </div>
            </div>
            <div className="border rounded-3 p-3 bg-light-subtle">
              <div className="d-flex justify-content-between align-items-start gap-3 border-bottom pb-2 mb-2">
                <div>
                  <div className="fw-bold small">FINNOVA BANK</div>
                  <div className="small text-body-secondary">Simulated transfer receipt for record purposes only</div>
                </div>
                <span className="badge text-bg-warning">Simulation</span>
              </div>
              <div className="text-center py-2">
                <div className="small text-body-secondary">Amount sent</div>
                <div className="display-6 fw-bold txn-amount">{money(receipt.amount)}</div>
              </div>
              <dl className="row small mb-0">
                <dt className="col-4 text-body-secondary">Reference</dt>
                <dd className="col-8 font-monospace text-break">{receipt.reference}</dd>
                <dt className="col-4 text-body-secondary">Date</dt>
                <dd className="col-8">{new Date(receipt.occurredAt).toLocaleString()}</dd>
                <dt className="col-4 text-body-secondary">From</dt>
                <dd className="col-8">{receipt.from?.nickname} (****{String(receipt.from?.accountNumber ?? "").slice(-4)})</dd>
                <dt className="col-4 text-body-secondary">To</dt>
                <dd className="col-8">{receipt.to?.recipientName} - {receipt.to?.maskedAccountNumber}</dd>
                {receipt.note && (<><dt className="col-4 text-body-secondary">Note</dt><dd className="col-8">{receipt.note}</dd></>)}

              </dl>
            </div>
          </div>
        </section>
      )}

      <div className="row g-4">
        <div className="col-lg-7">
          <section className="card border-0 shadow-sm" aria-labelledby="transfer-details-heading">
            <div className="card-body p-4">
              <h2 id="transfer-details-heading" className="h5 mb-4">Transfer details</h2>
              {loadingAccounts ? (
                <>
                  <span className="fn-skeleton row-skeleton" aria-hidden="true" />
                  <span className="fn-skeleton row-skeleton" aria-hidden="true" />
                </>
              ) : accounts.filter((a) => a.status === "ACTIVE").length === 0 ? (
                <div className="alert alert-warning mb-0">You need an active account before you can make a transfer.</div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label htmlFor="sourceAccount" className="form-label">From account</label>
                    <select id="sourceAccount" className="form-select" value={sourceId} required
                      onChange={(event) => {
                        setSourceId(event.target.value);
                        setRecipient(null);
                        setRecipientAccountNumber("");
                        idempotencyKey.current = null;
                      }}>
                      {accounts.filter((a) => a.status === "ACTIVE").map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.nickname} · ID {account.id} · {money(account.balance, account.currency)}
                        </option>
                      ))}
                    </select>
                    {sourceAccount && (
                      <div className="form-text">
                        {sourceAccount.accountType} · Account ending {String(sourceAccount.accountNumber ?? "").slice(-4)}
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label htmlFor="recipientAccountNumber" className="form-label">Recipient account number</label>
                    <div className="input-group">
                      <input id="recipientAccountNumber" className="form-control font-monospace" type="text"
                        autoComplete="off" maxLength={24} value={recipientAccountNumber} required
                        onChange={(event) => {
                          setRecipientAccountNumber(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                          setRecipient(null);
                          setError("");
                          setNotice("");
                          idempotencyKey.current = null;
                        }}
                        placeholder="Enter recipient account number" />
                      <button className="btn btn-outline-primary d-inline-flex align-items-center gap-2" type="button"
                        onClick={handleRecipientLookup} disabled={lookingUpRecipient || submitting}>
                        <Search size={15} aria-hidden="true" />
                        {lookingUpRecipient ? "Searching…" : "Find recipient"}
                      </button>
                    </div>
                    <div className="form-text">Enter the other customer's account number and verify the recipient before sending.</div>

                    {recipient && (
                      <div className="recipient-card mt-3" role="status">
                        <CircleCheck size={18} aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="recipient-title">Recipient confirmed</div>
                          <div className="fw-semibold text-dark">{recipient.recipientName}</div>
                          <div className="small font-monospace">{recipient.maskedAccountNumber}</div>
                          <div className="small">Currency: {recipient.currency}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label htmlFor="transferAmount" className="form-label">Amount (INR)</label>
                    <div className="input-group">
                      <span className="input-group-text" aria-hidden="true"><IndianRupee size={15} /></span>
                      <input id="transferAmount" className="form-control fn-num" type="number" min="0.01" step="0.01"
                        value={amount} required placeholder="0.00"
                        onChange={(event) => { setAmount(event.target.value); idempotencyKey.current = null; }} />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="transferNote" className="form-label">Note <span className="text-body-secondary fw-normal">(optional)</span></label>
                    <input id="transferNote" className="form-control" type="text" maxLength={120} value={note}
                      onChange={(event) => { setNote(event.target.value); idempotencyKey.current = null; }}
                      placeholder="e.g. Shared expenses" />
                    <div className="form-text">{note.length}/120 characters</div>
                  </div>

                  <button className="btn btn-accent w-100 py-2 d-inline-flex align-items-center justify-content-center gap-2" type="submit"
                    disabled={submitting || loadingAccounts || lookingUpRecipient || !sourceId || !validTarget}>
                    <Send size={16} strokeWidth={2.2} aria-hidden="true" />
                    {submitting ? "Processing transfer…" : "Submit transfer"}
                  </button>
                  <p className="small text-body-secondary mt-3 mb-0">
                    Review the destination carefully. The server performs final authorization and balance validation.
                  </p>
                </form>
              )}
            </div>
          </section>
        </div>

        <div className="col-lg-5">
          <section className="card border-0 shadow-sm mb-4" aria-labelledby="source-balance-heading">
            <div className="card-body p-4">
              <h2 id="source-balance-heading" className="small text-body-secondary mb-1">Source account balance</h2>
              <p className="display-6 fw-bold mb-1 txn-amount">
                {sourceAccount ? money(sourceAccount.balance, sourceAccount.currency) : "—"}
              </p>
              <p className="text-body-secondary small mb-0">
                Displayed balance may change; the backend rechecks funds when processing the transfer.
              </p>
            </div>
          </section>
          <section className="glass-soft rounded-4" aria-labelledby="transfer-checklist-heading">
            <div className="card-body p-4">
              <h2 id="transfer-checklist-heading" className="h6 fw-bold">Transfer checklist</h2>
              <ul className="small text-body-secondary mb-0 ps-3">
                <li className="mb-2">Choose an active source account.</li>
                <li className="mb-2">Find and verify the recipient name and masked account number.</li>
                <li className="mb-2">Enter an amount with up to two decimal places.</li>
                <li>Check the Transactions page after submitting.</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}