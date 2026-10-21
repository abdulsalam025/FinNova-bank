import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const ROLE_HOME = {
  LOAN_OFFICER: { to: "/officer", label: "Go to Officer Center", name: "Loan officer" },
  ADMIN: { to: "/admin", label: "Go to Admin Center", name: "Administrator" },
  CUSTOMER: { to: "/dashboard", label: "Go to dashboard", name: "Customer" },
};

// Frontend gate for convenience only. Every API call is still authorized by the backend.
// Pass roles={["ADMIN"]} to also require one of the listed roles.
export default function ProtectedRoute({ roles }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="text-center py-5" role="status">
        <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
        Checking your session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    const home = ROLE_HOME[user.role] || ROLE_HOME.CUSTOMER;
    return (
      <section className="py-4" aria-labelledby="not-permitted-heading">
        <div className="card border-0 shadow-sm" style={{ maxWidth: "40rem" }}>
          <div className="card-body p-4 d-flex align-items-start gap-3">
            <span className="dashboard-stat-icon flex-shrink-0" aria-hidden="true"><ShieldAlert size={20} /></span>
            <div>
              <h1 id="not-permitted-heading" className="h4 mb-1">Not permitted</h1>
              <p className="text-body-secondary mb-3">
                Your role ({home.name}) does not have access to this page. The bank&apos;s servers enforce the same rule.
              </p>
              <Link to={home.to} className="btn btn-primary">{home.label}</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return <Outlet />;
}
