import { PieChart, TrendingUp, Wallet } from "lucide-react";

export default function InvestmentsPage() {
  return (
    <section className="vstack gap-4" aria-labelledby="inv-heading">
      <div>
        <p className="eyebrow mb-1">WEALTH & ASSETS</p>
        <h1 id="inv-heading" className="h2 mb-1">Investment Portfolio</h1>
        <p className="text-body-secondary mb-0">Track your simulated asset allocations, mutual funds, and equity holdings.</p>
      </div>

      <div className="row g-3">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm p-4">
            <div className="small text-secondary mb-1">Total Portfolio Value</div>
            <div className="fs-3 fw-bold fn-num">₹2,45,800.00</div>
            <div className="text-pos small mt-1">↑ +8.4% all-time return</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm p-4">
            <div className="small text-secondary mb-1">Active SIPs</div>
            <div className="fs-3 fw-bold fn-num">₹12,500 / mo</div>
            <div className="small text-secondary mt-1">3 recurring orders active</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm p-4">
            <div className="small text-secondary mb-1">Risk Profile</div>
            <div className="fs-3 fw-bold">Growth (Moderately Aggressive)</div>
            <div className="small text-secondary mt-1">Balanced equities &amp; debt</div>
          </div>
        </div>
      </div>
    </section>
  );
}