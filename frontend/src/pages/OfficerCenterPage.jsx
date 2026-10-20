import { useCallback, useEffect, useState } from "react";
import { http } from "../api/http.js";

function errorMessage(error) {
  return error?.response?.data?.message ||
    error?.response?.data?.detail ||
    error?.message ||
    "The request failed.";
}

export default function OfficerCenterPage() {
  const [kycItems, setKycItems] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [kycResult, decisionResult] = await Promise.all([
        http.get("/officer/kyc", {
          params: {
            page: 0,
            size: 20,
            ...(status ? { status } : {}),
            ...(query.trim() ? { q: query.trim() } : {}),
          },
        }),
        http.get("/officer/decisions", { params: { page: 0, size: 10 } }),
      ]);
      setKycItems(kycResult.data?.items ?? []);
      setDecisions(decisionResult.data?.items ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, query]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function reviewKyc(item, decision) {
    const reason = window.prompt(
      `${decision === "VERIFIED" ? "Verification" : "Rejection"} reason for ${item.fullName}:`
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }

    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      await http.post(`/officer/kyc/${item.id}/decision`, {
        decision,
        reason: reason.trim(),
      });
      setNotice(`KYC request #${item.id} was ${decision.toLowerCase()}.`);
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
          <p className="eyebrow mb-1">FINNOVA BANK / OPERATIONS</p>
          <h1 className="h2 mb-1">Officer Center</h1>
          <p className="text-body-secondary mb-0">Review KYC submissions and inspect your decision history.</p>
        </div>
        <button className="btn btn-outline-primary" onClick={loadData} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh data"}
        </button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <section aria-labelledby="kyc-heading">
        <h2 id="kyc-heading" className="h4">KYC review queue</h2>
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <form className="row g-2 mb-3" onSubmit={(event) => { event.preventDefault(); loadData(); }}>
              <div className="col-md-7">
                <label htmlFor="officer-kyc-search" className="form-label">Search requests</label>
                <input
                  id="officer-kyc-search"
                  className="form-control"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by customer name or email"
                />
              </div>
              <div className="col-md-3">
                <label htmlFor="officer-kyc-status" className="form-label">Status</label>
                <select
                  id="officer-kyc-status"
                  className="form-select"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="REJECTED">Rejected</option>
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
                    <th>Customer</th><th>Document</th><th>Status</th><th>Submitted</th><th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {kycItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="fw-semibold">{item.fullName}</div>
                        <div className="small text-body-secondary">{item.email}</div>
                        <div className="small text-body-secondary">Customer #{item.customerId}</div>
                      </td>
                      <td>
                        <div>{item.documentType || "—"}</div>
                        <div className="small text-body-secondary">{item.documentReference || "Reference unavailable"}</div>
                      </td>
                      <td>{item.status}</td>
                      <td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td>
                      <td>
                        <div className="d-flex flex-wrap gap-2">
                          <button
                            className="btn btn-sm btn-success"
                            disabled={busyId === item.id || item.status === "VERIFIED"}
                            onClick={() => reviewKyc(item, "VERIFIED")}
                          >Verify</button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            disabled={busyId === item.id || item.status === "REJECTED"}
                            onClick={() => reviewKyc(item, "REJECTED")}
                          >Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && kycItems.length === 0 && (
                    <tr><td colSpan="5" className="text-center text-body-secondary py-4">No KYC requests found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="decisions-heading">
        <h2 id="decisions-heading" className="h4">My decision history</h2>
        <div className="table-responsive card border-0 shadow-sm">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr><th>Time</th><th>Type</th><th>Resource</th><th>Decision</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {decisions.map((item) => (
                <tr key={item.id}>
                  <td>{item.occurredAt ? new Date(item.occurredAt).toLocaleString() : "—"}</td>
                  <td>{item.resourceType}</td>
                  <td>{item.resourceId}</td>
                  <td>{item.decision}</td>
                  <td>{item.reason || "—"}</td>
                </tr>
              ))}
              {!loading && decisions.length === 0 && (
                <tr><td colSpan="5" className="text-center text-body-secondary py-3">No decision history available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
