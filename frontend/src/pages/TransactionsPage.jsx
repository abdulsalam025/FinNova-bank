import { useCallback, useEffect, useState } from "react";
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
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function TransactionsPage() {
  const [result, setResult] = useState({
    items: [],
    page: 0,
    totalPages: 0,
    totalElements: 0,
  });
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

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="container py-4 py-lg-5">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <p className="text-primary fw-semibold mb-1">ACCOUNT ACTIVITY</p>
          <h1 className="h2 fw-bold mb-1">Transaction History</h1>
          <p className="text-secondary mb-0">Review recorded transfers and account activity.</p>
        </div>
        <button className="btn btn-outline-primary" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <div>{error}</div>
          <button className="btn btn-sm btn-outline-danger mt-2" onClick={load}>
            Try again
          </button>
        </div>
      )}

      <section className="card border-0 shadow-sm">
        <div className="card-body p-0">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 p-3 border-bottom">
            <h2 className="h6 fw-bold mb-0">All transactions</h2>
            <span className="small text-secondary">
              {result.totalElements} record{result.totalElements === 1 ? "" : "s"}
            </span>
          </div>

          {loading ? (
            <div className="p-4 text-secondary">Loading transaction history…</div>
          ) : !error && result.items.length === 0 ? (
            <div className="p-5 text-center">
              <h3 className="h6 fw-bold">No transactions yet</h3>
              <p className="text-secondary mb-0">Recorded activity will appear here.</p>
            </div>
          ) : result.items.length > 0 ? (
            <>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
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
                      const outgoing = String(transaction.direction ?? "").toUpperCase() === "OUTGOING";
                      return (
                        <tr key={transaction.id}>
                          <td className="ps-3 small text-secondary">
                            {dateText(transaction.createdAt)}
                          </td>
                          <td>
                            <div className="fw-semibold">{transaction.reference || `Transaction #${transaction.id}`}</div>
                            <div className="small text-secondary">{transaction.description || "No description"}</div>
                          </td>
                          <td>
                            <div>{transaction.accountNumber || `Account #${transaction.accountId}`}</div>
                            <div className="small text-secondary">ID {transaction.accountId}</div>
                          </td>
                          <td>
                            <span className="badge text-bg-light border">
                              {transaction.transactionType || transaction.direction || "Transaction"}
                            </span>
                          </td>
                          <td className={`text-end fw-semibold ${outgoing ? "text-danger" : "text-success"}`}>
                            {outgoing ? "−" : "+"}{money(transaction.amount)}
                          </td>
                          <td className="text-end pe-3">
                            {money(transaction.balanceAfter)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 p-3 border-top">
                <span className="small text-secondary">
                  Page {result.page + 1} of {Math.max(result.totalPages, 1)}
                </span>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                    disabled={loading || page <= 0}
                  >
                    Previous
                  </button>
                  <button
                    className="btn btn-outline-primary btn-sm"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={loading || page + 1 >= result.totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
