import { useCallback, useEffect, useState } from "react";
import { http } from "../api/http.js";

function errorMessage(error) {
  return error?.response?.data?.message ||
    error?.response?.data?.detail ||
    error?.message ||
    "The request failed.";
}

function money(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function Metric({ label, value }) {
  return (
    <div className="col-12 col-sm-6 col-xl-3">
      <div className="card h-100 shadow-sm border-0">
        <div className="card-body">
          <p className="text-body-secondary mb-2">{label}</p>
          <div className="h3 mb-0">{value ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}

export default function AdminCenterPage() {
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [query, setQuery] = useState("");
  const [enabledFilter, setEnabledFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashResult, userResult, auditResult, performanceResult] =
        await Promise.all([
          http.get("/dashboard"),
          http.get("/admin/users", {
            params: {
              page: 0,
              size: 10,
              sortBy: "createdAt",
              sortDirection: "DESC",
              ...(query.trim() ? { q: query.trim() } : {}),
              ...(enabledFilter !== ""
                ? { enabled: enabledFilter === "true" }
                : {}),
            },
          }),
          http.get("/audit-logs", { params: { page: 0, size: 10 } }),
          http.get("/reports/product-performance", {
            params: { page: 0, size: 10 },
          }),
        ]);

      setDashboard(dashResult.data);
      setUsers(userResult.data?.items ?? []);
      setAudit(auditResult.data?.items ?? []);
      setPerformance(performanceResult.data?.items ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [query, enabledFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function changeActivation(user) {
    const nextActive = !user.enabled;
    const reason = window.prompt(
      `Reason for ${nextActive ? "activating" : "deactivating"} ${user.email}:`
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }

    setBusyId(user.id);
    setError("");
    setNotice("");
    try {
      await http.put(`/admin/users/${user.id}/activation`, {
        active: nextActive,
        reason: reason.trim(),
      });
      setNotice(`User ${user.email} was ${nextActive ? "activated" : "deactivated"}.`);
      await loadData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="vstack gap-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div>
          <p className="eyebrow mb-1">FINNOVA BANK / ADMINISTRATION</p>
          <h1 className="h2 mb-1">Admin Center</h1>
          <p className="text-body-secondary mb-0">
            User oversight, system activity and portfolio reporting.
          </p>
        </div>
        <button className="btn btn-outline-primary" onClick={loadData} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh data"}
        </button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="h4 mb-3">Bank overview</h2>
        {loading && !dashboard ? <p>Loading dashboard…</p> : (
          <div className="row g-3">
            <Metric label="Accounts" value={dashboard?.accounts?.accountCount} />
            <Metric label="Active accounts" value={dashboard?.accounts?.activeAccounts} />
            <Metric label="Active customers" value={dashboard?.accounts?.activeCustomers} />
            <Metric label="Operations volume" value={money(dashboard?.accounts?.operationVolume)} />
            <Metric label="Pending loan applications" value={dashboard?.loans?.pendingApplications} />
            <Metric label="Approved loans" value={dashboard?.loans?.approved} />
            <Metric label="Outstanding principal" value={money(dashboard?.loans?.outstandingPrincipal)} />
            <Metric label="Overdue installments" value={dashboard?.loans?.overdueInstallments} />
          </div>
        )}
        {dashboard?.dateFilterMeaning && (
          <p className="small text-body-secondary mt-2">{dashboard.dateFilterMeaning}</p>
        )}
      </section>

      <section aria-labelledby="users-heading">
        <h2 id="users-heading" className="h4">User management</h2>
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <form
              className="row g-2 mb-3"
              onSubmit={(event) => { event.preventDefault(); loadData(); }}
            >
              <div className="col-md-7">
                <label htmlFor="admin-user-search" className="form-label">Search users</label>
                <input
                  id="admin-user-search"
                  className="form-control"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name or email"
                />
              </div>
              <div className="col-md-3">
                <label htmlFor="admin-user-status" className="form-label">Account status</label>
                <select
                  id="admin-user-status"
                  className="form-select"
                  value={enabledFilter}
                  onChange={(event) => setEnabledFilter(event.target.value)}
                >
                  <option value="">All users</option>
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
              <div className="col-md-2 d-flex align-items-end">
                <button className="btn btn-primary w-100" type="submit">Search</button>
              </div>
            </form>

            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead>
                  <tr>
                    <th>User</th><th>Role</th><th>Status</th><th>Created</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="fw-semibold">{user.fullName}</div>
                        <div className="small text-body-secondary">{user.email}</div>
                        <div className="small text-body-secondary">ID: {user.id}</div>
                      </td>
                      <td>{user.role}</td>
                      <td>
                        <span className={`badge ${user.enabled ? "text-bg-success" : "text-bg-secondary"}`}>
                          {user.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</td>
                      <td>
                        <button
                          className={`btn btn-sm ${user.enabled ? "btn-outline-danger" : "btn-outline-success"}`}
                          disabled={busyId === user.id}
                          onClick={() => changeActivation(user)}
                        >
                          {busyId === user.id ? "Saving…" : user.enabled ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loading && users.length === 0 && (
                    <tr><td colSpan="5" className="text-center text-body-secondary py-4">No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="performance-heading">
        <h2 id="performance-heading" className="h4">Loan product performance</h2>
        <div className="table-responsive card border-0 shadow-sm">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Product</th><th>Applications</th><th>Requested</th>
                <th>Disbursed</th><th>Repaid</th><th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((item) => (
                <tr key={item.productId}>
                  <td>{item.productName}</td>
                  <td>{item.submittedApplications}</td>
                  <td>{money(item.requestedPrincipal)}</td>
                  <td>{money(item.disbursedPrincipal)}</td>
                  <td>{money(item.repayments)}</td>
                  <td>{money(item.currentOutstanding)}</td>
                </tr>
              ))}
              {!loading && performance.length === 0 && (
                <tr><td colSpan="6" className="text-center text-body-secondary py-3">No performance data available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="audit-heading">
        <h2 id="audit-heading" className="h4">Recent audit activity</h2>
        <div className="table-responsive card border-0 shadow-sm">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr><th>Time</th><th>Actor</th><th>Event</th><th>Resource</th><th>Outcome</th></tr>
            </thead>
            <tbody>
              {audit.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : "—"}</td>
                  <td>{entry.actorRole ?? entry.actorType}{entry.actorUserId ? ` #${entry.actorUserId}` : ""}</td>
                  <td>{entry.eventType}</td>
                  <td>{entry.resourceType}{entry.resourceId ? ` / ${entry.resourceId}` : ""}</td>
                  <td>{entry.outcome}</td>
                </tr>
              ))}
              {!loading && audit.length === 0 && (
                <tr><td colSpan="5" className="text-center text-body-secondary py-3">No audit entries available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="small text-body-secondary">
        Simulation environment only. Dashboard stock figures represent current values;
        date-filtered event metrics are not historical balance snapshots.
      </p>
    </section>
  );
}
