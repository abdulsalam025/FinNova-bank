import { MessageSquare, CheckCircle, ShieldAlert, Bell } from "lucide-react";

export default function MessagesPage() {
  return (
    <section className="vstack gap-4" aria-labelledby="msg-heading">
      <div>
        <p className="eyebrow mb-1">INBOX & ALERTS</p>
        <h1 id="msg-heading" className="h2 mb-1">Message Center</h1>
        <p className="text-body-secondary mb-0">Important bank notices, security alerts, and loan application updates.</p>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          <div className="list-group list-group-flush">
            <div className="list-group-item p-3 d-flex gap-3 align-items-start">
              <span className="rounded-circle bg-success bg-opacity-25 p-2 text-success"><CheckCircle size={18} /></span>
              <div className="flex-grow-1">
                <div className="d-flex justify-content-between">
                  <strong>Loan Application Approved</strong>
                  <small className="text-muted">2 hours ago</small>
                </div>
                <p className="small text-secondary mb-0">Your personal loan application has been approved by Admin and credited to your primary account.</p>
              </div>
            </div>
            <div className="list-group-item p-3 d-flex gap-3 align-items-start">
              <span className="rounded-circle bg-warning bg-opacity-25 p-2 text-warning"><ShieldAlert size={18} /></span>
              <div className="flex-grow-1">
                <div className="d-flex justify-content-between">
                  <strong>New Security Login Detected</strong>
                  <small className="text-muted">5 hours ago</small>
                </div>
                <p className="small text-secondary mb-0">A new sign-in was recorded from Windows 11 / Chrome browser in Bengaluru.</p>
              </div>
            </div>
            <div className="list-group-item p-3 d-flex gap-3 align-items-start">
              <span className="rounded-circle bg-primary bg-opacity-25 p-2 text-primary"><Bell size={18} /></span>
              <div className="flex-grow-1">
                <div className="d-flex justify-content-between">
                  <strong>Welcome to FinNova Bank</strong>
                  <small className="text-muted">Yesterday</small>
                </div>
                <p className="small text-secondary mb-0">Thank you for registering. Explore our loan products or open additional savings accounts anytime.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}