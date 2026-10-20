import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword, updateProfile } from "../api/auth.js";
import FormField from "../components/FormField.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { describeError } from "../utils/errors.js";
import { validateFullName, validateNewPassword } from "../utils/validators.js";

export default function ProfilePage() {
  const { user, setUser, endSession } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user ? user.fullName : "");
  const [nameErrors, setNameErrors] = useState({});
  const [nameMessage, setNameMessage] = useState({ type: "", text: "" });
  const [savingName, setSavingName] = useState(false);

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [pwErrors, setPwErrors] = useState({});
  const [pwError, setPwError] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  if (!user) return null;

  async function saveName(event) {
    event.preventDefault();
    const problem = validateFullName(fullName);
    setNameErrors(problem ? { fullName: problem } : {});
    setNameMessage({ type: "", text: "" });
    if (problem) return;

    setSavingName(true);
    try {
      const updated = await updateProfile({ fullName: fullName.trim() });
      setUser(updated);
      setNameMessage({ type: "success", text: "Profile updated." });
    } catch (error) {
      const details = describeError(error, "Could not update the profile.");
      setNameMessage({ type: "danger", text: details.message });
      setNameErrors(details.fieldErrors);
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    const next = {};
    if (!pw.currentPassword) next.currentPassword = "Current password is required.";
    const strength = validateNewPassword(pw.newPassword);
    if (strength) next.newPassword = strength;
    else if (pw.newPassword !== pw.confirm) next.confirm = "Passwords do not match.";
    setPwErrors(next);
    setPwError("");
    if (Object.keys(next).length > 0) return;

    const proceed = window.confirm("Changing your password signs you out on this device. Continue?");
    if (!proceed) return;

    setSavingPw(true);
    try {
      await changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      endSession();
      navigate("/login", { replace: true, state: { notice: "Password changed. Sign in with your new password." } });
    } catch (error) {
      const details = describeError(error, "Could not change the password.");
      setPwError(details.message);
      setPwErrors(details.fieldErrors);
    } finally {
      setSavingPw(false);
    }
  }

  const setPwField = (key) => (value) => setPw((current) => ({ ...current, [key]: value }));

  return (
    <section aria-labelledby="profile-heading">
      <h1 id="profile-heading" className="h2 mb-4">Profile settings</h1>
      <div className="row g-4">
        <div className="col-lg-6">
          <form onSubmit={saveName} noValidate className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <h2 className="h5 mb-3">Personal details</h2>
              {nameMessage.text ? (
                <div className={"alert alert-" + nameMessage.type} role={nameMessage.type === "danger" ? "alert" : "status"}>
                  {nameMessage.text}
                </div>
              ) : null}
              <FormField id="fullName" label="Full name" value={fullName} onChange={setFullName}
                error={nameErrors.fullName} autoComplete="name" maxLength={100} />
              <p className="small text-body-secondary">Email ({user.email}) and role cannot be changed here.</p>
              <button className="btn btn-primary" type="submit" disabled={savingName}>
                {savingName ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </div>

        <div className="col-lg-6">
          <form onSubmit={savePassword} noValidate className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <h2 className="h5 mb-3">Change password</h2>
              {pwError ? <div className="alert alert-danger" role="alert">{pwError}</div> : null}
              <FormField id="currentPassword" label="Current password" type="password" value={pw.currentPassword}
                onChange={setPwField("currentPassword")} error={pwErrors.currentPassword}
                autoComplete="current-password" maxLength={72} />
              <FormField id="newPassword" label="New password" type="password" value={pw.newPassword}
                onChange={setPwField("newPassword")} error={pwErrors.newPassword}
                autoComplete="new-password" maxLength={72} hint="At least 8 characters. The server applies the final rules." />
              <FormField id="confirmPassword" label="Confirm new password" type="password" value={pw.confirm}
                onChange={setPwField("confirm")} error={pwErrors.confirm} autoComplete="new-password" maxLength={72} />
              <button className="btn btn-outline-danger" type="submit" disabled={savingPw}>
                {savingPw ? "Changing..." : "Change password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
