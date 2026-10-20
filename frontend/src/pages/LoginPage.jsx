import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import FormField from "../components/FormField.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { describeError } from "../utils/errors.js";
import { validateEmail } from "../utils/validators.js";

export default function LoginPage() {
  const { user, initializing, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const notice = location.state && location.state.notice;
  const destination = (location.state && location.state.from && location.state.from.pathname) || "/dashboard";

  if (!initializing && user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    const next = {};
    const emailError = validateEmail(email);
    if (emailError) next.email = emailError;
    if (!password) next.password = "Password is required.";
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      navigate(destination, { replace: true });
    } catch (error) {
      const details = describeError(error, "Sign in failed. Check your email and password.");
      setFormError(details.message);
      setErrors(details.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto" style={{ maxWidth: 460 }} aria-labelledby="login-heading">
      <h1 id="login-heading" className="h2 mb-3">Sign in</h1>
      {notice ? <div className="alert alert-success" role="status">{notice}</div> : null}
      {formError ? <div className="alert alert-danger" role="alert">{formError}</div> : null}
      <form onSubmit={handleSubmit} noValidate className="card border-0 shadow-sm">
        <div className="card-body p-4">
          <FormField id="email" label="Email" type="email" value={email} onChange={setEmail}
            error={errors.email} autoComplete="username" maxLength={254} />
          <FormField id="password" label="Password" type="password" value={password} onChange={setPassword}
            error={errors.password} autoComplete="current-password" maxLength={72} />
          <button className="btn btn-primary w-100" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </form>
      <p className="small text-body-secondary mt-3">
        New here? <Link to="/register">Create an account</Link>. Synthetic demo only.
      </p>
    </section>
  );
}
