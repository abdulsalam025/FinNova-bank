import { useState } from "react";
import { CreditCard, Plus, Check, Copy } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export default function CardsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  function copyCard() {
    navigator.clipboard?.writeText("4582 7719 6621 8890");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="vstack gap-4" aria-labelledby="cards-heading">
      <div>
        <p className="eyebrow mb-1">PAYMENT INSTRUMENTS</p>
        <h1 id="cards-heading" className="h2 mb-1">My Cards</h1>
        <p className="text-body-secondary mb-0">Manage virtual and physical debit/credit cards linked to your active accounts.</p>
      </div>

      <div className="row g-4">
        <div className="col-md-6 col-xl-4">
          <div className="p-4 rounded-4 text-white position-relative overflow-hidden shadow-sm" style={{ background: "linear-gradient(135deg, #5c45e6, #1f1d2e 85%)", border: "1px solid rgba(255,255,255,0.2)" }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <span className="fw-bold">FinNova Bank Debit</span>
              <span className="font-monospace fw-bold fs-5" style={{ fontStyle: "italic" }}>VISA</span>
            </div>
            <div className="font-monospace mb-4 fs-5" style={{ letterSpacing: "0.15em" }}>4582 7719 6621 8890</div>
            <div className="d-flex justify-content-between align-items-end">
              <div>
                <small className="d-block text-secondary" style={{ fontSize: "0.65rem" }}>CARDHOLDER</small>
                <span className="fw-semibold text-uppercase">{user?.fullName || "Customer"}</span>
              </div>
              <div>
                <small className="d-block text-secondary" style={{ fontSize: "0.65rem" }}>EXPIRES</small>
                <span className="font-monospace">12/29</span>
              </div>
            </div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button type="button" className="btn btn-outline-primary btn-sm flex-grow-1" onClick={copyCard}>
              {copied ? "Copied Number" : "Copy Card Number"}
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm">Freeze Card</button>
          </div>
        </div>

        <div className="col-md-6 col-xl-4">
          <div className="card border-0 shadow-sm h-100 d-flex align-items-center justify-content-center p-4 text-center border-dashed">
            <div className="dashboard-empty-icon mb-2"><Plus size={22} /></div>
            <h3 className="h6 fw-bold">Request New Card</h3>
            <p className="small text-secondary mb-3">Order a physical contactless debit card or create an instant virtual card.</p>
            <button type="button" className="btn btn-primary btn-sm">Order Card</button>
          </div>
        </div>
      </div>
    </section>
  );
}