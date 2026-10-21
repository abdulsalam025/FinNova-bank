import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ReceiptText, RefreshCw } from "lucide-react";
import { listTransactions } from "../api/transactions.js";

function errorText(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.detail ||
    error?.response?.data?.error ||
    error?.message ||
    "Unable to load transactions."
  );
}

function money(value, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function TransactionsPage() {
  const [result, setResult] = useState({ items: [], page: 0, totalPages: 0, totalElements: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listTransactions({ page, size: 10 });
      setResult({
        items: Array.isArray(data) ? data : data?.items ?? [],
        page: data?.page ?? page,
        totalPages: data?.totalPages ?? 1,
        totalElements: data?.totalElements ?? data?.items?.length ?? 0,
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <section aria-labelledby="transactions-heading">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <p className="eyebrow mb-1">ACCOUNT ACTIVITY</p>
          <h1 id="transactions-heading" className="h2 mb-1">Transaction History</h1>
          <p className="text-body-secondary mb-0">Recorded transfers and account activity.</p>
        </div>
        <button type="button" className="btn btn-outline-primary d-inline-flex align-items-center gap-2" onClick={load} disabled={loading}>
          <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
          <span>{error}</span>
          <button className="btn btn-sm btn-outline-dark" onClick={load}>Try again</button>
        </div>
      )}

      <section className="card border-0 shadow-sm" aria-labelledby="all-transactions-heading">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 p-3 border-bottom">
          <h2 id="all-transactions-heading" className="h6 fw-bold mb-0">All transactions</h2>
          <span className="small text-body-secondary">{result.totalElements} record{result.totalElements === 1 ? "" : "s"}</span>
        </div>

        {loading ? (
          <div className="p-3">
            <span className="fn-skeleton row-skeleton" aria-hidden="true" />
            <span className="fn-skeleton row-skeleton" aria-hidden="true" />
            <span className="fn-skeleton row-skeleton" aria-hidden="true" />
            <span className="fn-skeleton row-skeleton" aria-hidden="true" />
          </div>
        ) : !error && result.items.length === 0 ? (
          <div className="p-5 text-center">
            <div className="dashboard-empty-icon" aria-hidden="true"><ReceiptText size={20} /></div>
            <h3 className="h6 fw-bold mt-3">No transactions yet</h3>
            <p className="text-body-secondary mb-0">Recorded activity will appear here after your first transfer.</p>
          </div>
        ) : result.items.length > 0 ? (
          <>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th scope="col" className="ps-3">Date</th>
                    <th scope="col">Reference / Description</th>
                    <th scope="col">Account</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="text-end">Amount</th>
                    <th scope="col" className="text-end pe-3">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((transaction) => {
                    const direction = String(transaction.direction ?? "").toUpperCase();
                const outgoing = direction === "OUTGOING" || direction === "DEBIT";
                    return (
                      <tr key={transaction.id}>
                        <td className="ps-3 small text-body-secondary text-nowrap">{dateText(transaction.createdAt)}</td>
                        <td>
                          <div className="fw-semibold d-flex align-items-center gap-2">
                            <span className={`txn-icon ${outgoing ? "out" : "in"}`} style={{ width: "1.9rem", height: "1.9rem" }} aria-hidden="true">
                              {outgoing ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                            </span>
                            <span>{transaction.reference || `Transaction #${transaction.id}`}</span>
                          </div>
                          <div className="small text-body-secondary">{transaction.description || "No description"}</div>
                        </td>
                        <td>
                          <div className="small font-monospace">{transaction.accountNumber || `Account #${transaction.accountId}`}</div>
                          <div className="small text-body-secondary">ID {transaction.accountId}</div>
                        </td>
                        <td>
                          <span className="status-chip neutral">{transaction.transactionType || transaction.direction || "Transaction"}</span>
                        </td>
                        <td className={`text-end txn-amount ${outgoing ? "out" : "in"}`}>
                          {outgoing ? "−" : "+"}{money(transaction.amount)}
                        </td>
                        <td className="text-end pe-3 fn-num">{money(transaction.balanceAfter)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 p-3 border-top">
              <span className="small text-body-secondary">Page {result.page + 1} of {Math.max(result.totalPages, 1)}</span>
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-outline-secondary btn-sm"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={loading || page <= 0}>Previous</button>
                <button type="button" className="btn btn-outline-primary btn-sm"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={loading || page + 1 >= result.totalPages}>Next</button>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </section>
  );
}