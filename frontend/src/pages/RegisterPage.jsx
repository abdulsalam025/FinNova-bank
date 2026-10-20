import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { register } from "../api/auth.js";
import FormField from "../components/FormField.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { describeError } from "../utils/errors.js";
import {
  todayIso, validateDateOfBirth, validateEmail, validateFullName, validateMoney, validateNewPassword,
} from "../utils/validators.js";

export default function RegisterPage() {
  const { user, initializing } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "", email: "", password: "", confirm: "", dateOfBirth: "", declaredMonthlyIncome: "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!initializing && user) return <Navigate to="/dashboard" replace />;

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const next = {};
    const checks = {
      fullName: validateFullName(form.fullName),
      email: validateEmail(form.email),
      password: validateNewPassword(form.password),
      dateOfBirth: validateDateOfBirth(form.dateOfBirth),
      declaredMonthlyIncome: validateMoney(form.declaredMonthlyIncome),
    };
    Object.entries(checks).forEach(([key, text]) => { if (text) next[key] = text; });
    if (!next.password && form.password !== form.confirm) next.confirm = "Passwords do not match.";
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        dateOfBirth: form.dateOfBirth,
        declaredMonthlyIncome: Number(form.declaredMonthlyIncome),
      });
      navigate("/login", { replace: true, state: { notice: "Account created. Sign in to continue." } });
    } catch (error) {
      const details = describeError(error, "Registration failed. Review the form and try again.");
      setFormError(details.message);
      setErrors(details.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto" style={{ maxWidth: 540 }} aria-labelledby="register-heading">
      <h1 id="register-heading" className="h2 mb-3">Create account</h1>
      <p className="text-body-secondary">Use synthetic details only. This is a college simulation.</p>
      {formError ? <div className="alert alert-danger" role="alert">{formError}</div> : null}
      <form onSubmit={handleSubmit} noValidate className="card border-0 shadow-sm">
        <div className="card-body p-4">
          <FormField id="fullName" label="Full name" value={form.fullName} onChange={set("fullName")}
            error={errors.fullName} autoComplete="name" maxLength={100} />
          <FormField id="email" label="Email" type="email" value={form.email} onChange={set("email")}
            error={errors.email} autoComplete="email" maxLength={254} />
          <FormField id="password" label="Password" type="password" value={form.password} onChange={set("password")}
            error={errors.password} autoComplete="new-password" maxLength={72}
            hint="At least 8 characters. The server applies the final strength rules." />
          <FormField id="confirm" label="Confirm password" type="password" value={form.confirm} onChange={set("confirm")}
            error={errors.confirm} autoComplete="new-password" maxLength={72} />
          <FormField id="dateOfBirth" label="Date of birth" type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")}
            error={errors.dateOfBirth} max={todayIso()} />
          <FormField id="declaredMonthlyIncome" label="Declared monthly income (INR)" type="text" inputMode="decimal"
            value={form.declaredMonthlyIncome} onChange={set("declaredMonthlyIncome")} error={errors.declaredMonthlyIncome}
            hint="Used only for loan eligibility rules in this demo." />
          <button className="btn btn-primary w-100" type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </div>
      </form>
      <p className="small text-body-secondary mt-3">Already registered? <Link to="/login">Sign in</Link></p>
    </section>
  );
}
