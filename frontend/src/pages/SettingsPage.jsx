import { useState } from "react";
import { Settings, Shield, Bell, Moon, Lock, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export default function SettingsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState(true);
  const [biometric, setBiometric] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [saved, setSaved] = useState(false);

  function handleSave(e) {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section className="vstack gap-4" aria-labelledby="settings-heading">
      <div>
        <p className="eyebrow mb-1">PREFERENCES & SECURITY</p>
        <h1 id="settings-heading" className="h2 mb-1">Account Settings</h1>
        <p className="text-body-secondary mb-0">Manage your notification channels, security authentication, and display preferences.</p>
      </div>

      {saved && <div className="alert alert-success" role="status">Settings updated successfully.</div>}

      <form onSubmit={handleSave} className="row g-4">
        <div className="col-lg-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-4">
              <h2 className="h5 mb-3 d-flex align-items-center gap-2"><Bell size={18} /> Notifications &amp; Alerts</h2>
              <div className="form-check form-switch mb-3">
                <input className="form-check-input" type="checkbox" id="notif-push" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />
                <label className="form-check-label fw-semibold" htmlFor="notif-push">Push &amp; SMS Transaction Alerts</label>
                <div className="small text-secondary">Receive real-time notifications for transfers, deposits, and bill payments.</div>
              </div>
              <div className="form-check form-switch mb-3">
                <input className="form-check-input" type="checkbox" id="notif-email" defaultChecked />
                <label className="form-check-label fw-semibold" htmlFor="notif-email">Monthly Statement Email</label>
                <div className="small text-secondary">Get a PDF summary of your monthly account statements.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-4">
              <h2 className="h5 mb-3 d-flex align-items-center gap-2"><Shield size={18} /> Security &amp; Access</h2>
              <div className="form-check form-switch mb-3">
                <input className="form-check-input" type="checkbox" id="sec-bio" checked={biometric} onChange={(e) => setBiometric(e.target.checked)} />
                <label className="form-check-label fw-semibold" htmlFor="sec-bio">Biometric Sign-In</label>
                <div className="small text-secondary">Allow fingerprint or facial recognition for quick mobile access.</div>
              </div>
              <div className="form-check form-switch mb-3">
                <input className="form-check-input" type="checkbox" id="sec-dark" checked={darkMode} onChange={(e) => setDarkMode(e.target.checked)} />
                <label className="form-check-label fw-semibold" htmlFor="sec-dark">Night Liquid Glass Theme</label>
                <div className="small text-secondary">Keep the sleek dark high-impact theme enabled.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12">
          <button type="submit" className="btn btn-primary px-4">Save Preferences</button>
        </div>
      </form>
    </section>
  );
}