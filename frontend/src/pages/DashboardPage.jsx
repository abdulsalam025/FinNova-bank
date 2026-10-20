import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { listAccounts } from "../api/accounts.js";
import { listTransactions } from "../api/transactions.js";
import { formatDateTime } from "../utils/format.js";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function roleLabel(role) {
  return String(role || "Customer")
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function errorMessage(error) {
  return error?.response?.data?.message ||
    error?.response?.data?.detail ||
    error?.message ||
    "Unable to load this information. Please try again.";
}

function StatCard({ title, value, caption, icon, tone = "green" }) {
  return (
    <div className="col-12 col-sm-6 col-xl-4">
      <article className={`card h-100 dashboard-stat dashboard-stat-${tone}`}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start gap-3">
            <div>
              <p className="dashboard-stat-label mb-2">{title}</p>
              <div className="dashboard-stat-value">{value}</div>
              <p className="small text-body-secondary mb-0 mt-2">{caption}</p>
            </div>
            <span className="dashboard-stat-icon" aria-hidden="true">{icon}</span>
          </div>
        </div>
      </article>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [accountsError, setAccountsError] = useState("");
  const [transactionsError, setTransactionsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setAccountsError("");
      setTransactionsError("");

      const [accountResult, transactionResult] = await Promise.allSettled([
        listAccounts({ page: 0, size: 100, sortBy: "createdAt", sortDirection: "DESC" }),
        listTransactions({ page: 0, size: 5, sortBy: "createdAt", sortDirection: "DESC" }),
      ]);

      if (cancelled) return;

      if (accountResult.status === "fulfilled") {
        const data = accountResult.value;
        setAccounts(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
      } else {
        setAccounts([]);
        setAccountsError(errorMessage(accountResult.reason));
      }

      if (transactionResult.status === "fulfilled") {
        const data = transactionResult.value;
        setTransactions(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
      } else {
        setTransactions([]);
        setTransactionsError(errorMessage(transactionResult.reason));
      }

      setLoading(false);
    }

    loadDashboard();
    return () => { cancelled = true; };
  }, [refresh]);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => String(account.status).toUpperCase() === "ACTIVE"),
    [accounts]
  );

  const totalBalance = useMemo(
    () => activeAccounts.reduce((total, account) => total + Number(account.balance || 0), 0),
    [activeAccounts]
  );

  if (!user) return null;

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-heading">
      <div className="dashboard-welcome d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <p className="eyebrow mb-1">FINNOVA BANK / OVERVIEW</p>
          <h1 id="dashboard-heading" className="h2 mb-1">
            Welcome back, {user.fullName || "Customer"}
          </h1>
          <p className="text-body-secondary mb-0">
            Here is an overview of your banking activity.
          </p>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="badge rounded-pill text-bg-light border px-3 py-2">
            {roleLabel(user.role)}
          </span>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setRefresh((value) => value + 1)}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <StatCard
          title="Total account balance"
          value={loading ? "Loading…" : accountsError ? "Unavailable" : inr.format(totalBalance)}
          caption={accountsError ? "Account data could not be loaded" : "Combined balance of active accounts"}
          icon="₹"
          tone="green"
        />
        <StatCard
          title="Active accounts"
          value={loading ? "…" : accountsError ? "—" : String(activeAccounts.length)}
          caption="Accounts currently marked active"
          icon="▤"
          tone="blue"
        />
        <StatCard
          title="Recent transactions"
          value={loading ? "…" : transactionsError ? "—" : String(transactions.length)}
          caption="Transactions returned by the latest request"
          icon="↔"
          tone="purple"
        />
      </div>

      <div className="row g-4">
        <div className="col-12 col-xl-7">
          <section className="card h-100" aria-labelledby="accounts-heading">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div>
                <h2 id="accounts-heading" className="h5 mb-1">Your accounts</h2>
                <p className="small text-body-secondary mb-0">Balances from your banking profile</p>
              </div>
              <Link to="/accounts" className="btn btn-sm btn-outline-primary">Manage accounts</Link>
            </div>
            <div className="card-body">
              {loading ? (
                <p className="text-body-secondary mb-0">Loading accounts…</p>
              ) : accountsError ? (
                <div className="alert alert-warning mb-0" role="alert">
                  <p className="mb-2">Your account summary could not be loaded.</p>
                  <p className="small mb-0">{accountsError}</p>
                </div>
              ) : accounts.length === 0 ? (
                <div className="dashboard-empty text-center py-4">
                  <div className="dashboard-empty-icon" aria-hidden="true">＋</div>
                  <h3 className="h6 mt-3">No accounts to display</h3>
                  <p className="small text-body-secondary">Open an account to start using your banking dashboard.</p>
                  <Link to="/accounts" className="btn btn-primary btn-sm">Manage accounts</Link>
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {accounts.slice(0, 4).map((account) => (
                    <div className="dashboard-account-row" key={account.id}>
                      <div className="dashboard-account-symbol" aria-hidden="true">₹</div>
                      <div className="flex-grow-1 min-w-0">
                        <div className="fw-semibold text-break">
                          {account.nickname || account.accountType || "Bank account"}
                        </div>
                        <div className="small text-body-secondary">
                          {account.accountNumber || `Account #${account.id}`}
                        </div>
                        <span className={`badge mt-1 ${String(account.status).toUpperCase() === "ACTIVE" ? "text-bg-success" : "text-bg-secondary"}`}>
                          {account.status || "Unknown"}
                        </span>
                      </div>
                      <div className="text-end">
                        <div className="fw-bold">{inr.format(Number(account.balance || 0))}</div>
                        <div className="small text-body-secondary">{account.currency || "INR"}</div>
                      </div>
                    </div>
                  ))}
                  {accounts.length > 4 && (
                    <Link to="/accounts" className="small text-decoration-none">
                      View all {accounts.length} accounts →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="col-12 col-xl-5">
          <section className="card h-100" aria-labelledby="actions-heading">
            <div className="card-header">
              <h2 id="actions-heading" className="h5 mb-1">Quick actions</h2>
              <p className="small text-body-secondary mb-0">Shortcuts to your banking tools</p>
            </div>
            <div className="card-body">
              <div className="dashboard-actions">
                <Link to="/transfer" className="dashboard-action">
                  <span className="dashboard-action-icon" aria-hidden="true">↗</span>
                  <span><strong>Transfer money</strong><small>Send money between accounts</small></span>
                  <span className="ms-auto" aria-hidden="true">→</span>
                </Link>
                <Link to="/transactions" className="dashboard-action">
                  <span className="dashboard-action-icon" aria-hidden="true">≡</span>
                  <span><strong>Transactions</strong><small>Review your activity history</small></span>
                  <span className="ms-auto" aria-hidden="true">→</span>
                </Link>
                <Link to="/loan-products" className="dashboard-action">
                  <span className="dashboard-action-icon" aria-hidden="true">◇</span>
                  <span><strong>Explore loans</strong><small>Compare available loan products</small></span>
                  <span className="ms-auto" aria-hidden="true">→</span>
                </Link>
                <Link to="/profile" className="dashboard-action">
                  <span className="dashboard-action-icon" aria-hidden="true">○</span>
                  <span><strong>Your profile</strong><small>Review personal information</small></span>
                  <span className="ms-auto" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </section>
        </div>

        <div className="col-12">
          <section className="card" aria-labelledby="transactions-heading">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div>
                <h2 id="transactions-heading" className="h5 mb-1">Recent transactions</h2>
                <p className="small text-body-secondary mb-0">Latest activity returned by your transaction service</p>
              </div>
              <Link to="/transactions" className="btn btn-sm btn-outline-primary">View transactions</Link>
            </div>
            <div className="card-body p-0">
              {loading ? (
                <p className="text-body-secondary p-4 mb-0">Loading transactions…</p>
              ) : transactionsError ? (
                <div className="alert alert-warning m-3" role="alert">
                  <p className="mb-1">Recent transactions could not be loaded.</p>
                  <p className="small mb-0">{transactionsError}</p>
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-body-secondary p-4 mb-0">No transactions were returned for this view.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th scope="col">Description</th>
                        <th scope="col">Date</th>
                        <th scope="col">Type</th>
                        <th scope="col" className="text-end">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.slice(0, 5).map((transaction) => {
                        const direction = String(transaction.direction || "").toUpperCase();
                        const outgoing = direction === "OUTGOING" || direction === "DEBIT";
                        const amount = Number(transaction.amount || 0);
                        return (
                          <tr key={transaction.id}>
                            <td>
                              <div className="fw-semibold">{transaction.description || transaction.transactionType || "Transaction"}</div>
                              <div className="small text-body-secondary">
                                {transaction.reference || (transaction.accountNumber ? `Account ${transaction.accountNumber}` : `Transaction #${transaction.id}`)}
                              </div>
                            </td>
                            <td className="text-nowrap small">
                              {transaction.createdAt ? formatDateTime(transaction.createdAt) : "—"}
                            </td>
                            <td><span className="badge text-bg-light border">{transaction.transactionType || direction || "Activity"}</span></td>
                            <td className={`text-end text-nowrap fw-semibold ${outgoing ? "text-danger" : "text-success"}`}>
                              {outgoing ? "−" : "+"}{inr.format(amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="dashboard-footnote mt-4">
        <span aria-hidden="true">ⓘ</span>
        <span>FinNova Bank is a simulated college project. Values are displayed from the connected application API and do not represent real bank funds.</span>
      </div>

      <section className="card mt-4" aria-labelledby="profile-summary-heading">
        <div className="card-body">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
            <div>
              <p className="eyebrow mb-1">ACCOUNT PROFILE</p>
              <h2 id="profile-summary-heading" className="h5 mb-3">Your information</h2>
              <p className="mb-1"><span className="text-body-secondary">Email: </span><span className="text-break">{user.email}</span></p>
              <p className="mb-1"><span className="text-body-secondary">Role: </span>{roleLabel(user.role)}</p>
              <p className="mb-0"><span className="text-body-secondary">Member since: </span>{user.createdAt ? formatDateTime(user.createdAt) : "Not available"}</p>
            </div>
            <Link to="/profile" className="btn btn-outline-primary btn-sm">Edit profile and password</Link>
          </div>
        </div>
      </section>
    </section>
  );
}
