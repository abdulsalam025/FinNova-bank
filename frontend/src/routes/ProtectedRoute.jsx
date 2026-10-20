import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

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
    return (
      <section className="py-4">
        <h1 className="h3">Not permitted</h1>
        <p>Your role does not have access to this page.</p>
      </section>
    );
  }

  return <Outlet />;
}
