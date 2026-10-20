import { useEffect, useState } from "react";
import { getHealth } from "../api/health.js";
import { formatDateTime } from "../utils/format.js";

export default function SystemStatusPage() {
  const [attempt, setAttempt] = useState(0);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setHealth(null);

    getHealth(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data?.scope !== "APPLICATION_ONLY" || !data?.timestamp || !data?.status) {
          throw new Error("Unexpected health response");
        }
        setHealth(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("Unable to verify the API. Check the backend window, then retry.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [attempt]);

  return (
    <section className="status-panel mx-auto" aria-labelledby="status-heading">
      <p className="eyebrow">DEVELOPMENT CHECK</p>
      <h1 id="status-heading" className="h2">System status</h1>
      <p className="text-body-secondary">
        This page makes a real request through Axios to the Spring Boot backend.
        It is not a banking dashboard or a database-health check.
      </p>

      <div className="card border-0 shadow-sm my-4">
        <div className="card-body p-4" aria-live="polite" aria-busy={loading}>
          {loading && (
            <div role="status">
              <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
              Checking the backend...
            </div>
          )}

          {!loading && error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}

          {!loading && health && (
            <>
              <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
                <h2 className="h5 mb-0">{health.application}</h2>
                <span className={`badge ${health.status === "UP" ? "text-bg-success" : "text-bg-warning"}`}>
                  {health.status}
                </span>
              </div>
              <dl className="row mb-0">
                <dt className="col-sm-4">Check scope</dt>
                <dd className="col-sm-8 text-break">{health.scope}</dd>
                <dt className="col-sm-4">Server timestamp</dt>
                <dd className="col-sm-8 mb-0">{formatDateTime(health.timestamp)}</dd>
              </dl>
            </>
          )}
        </div>
      </div>

      <button className="btn btn-primary" type="button" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>
        {error ? "Retry connection" : "Check again"}
      </button>
      <p className="small text-body-secondary mt-3">
        Only application liveness is checked. Database-backed workflows arrive in later stages.
      </p>
    </section>
  );
}
