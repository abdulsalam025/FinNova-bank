import { useState } from "react";
import { Navigate, Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import {
  Activity, ArrowLeftRight, ClipboardCheck, CreditCard, HandCoins, Landmark,
  LayoutDashboard, LogOut, Menu, MessageSquare, PieChart, ReceiptText, Settings, ShieldCheck, UserRound, WalletCards,
} from "lucide-react";
import { useAuth } from "./context/AuthContext.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import LoanProductsPage from "./pages/LoanProductsPage.jsx";
import TransferPage from "./pages/TransferPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import AccountsPage from "./pages/AccountsPage.jsx";
import CardsPage from "./pages/CardsPage.jsx";
import InvestmentsPage from "./pages/InvestmentsPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import AuthShowcase from "./components/AuthShowcase.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import SystemStatusPage from "./pages/SystemStatusPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import AdminCenterPage from "./pages/AdminCenterPage.jsx";
import OfficerCenterPage from "./pages/OfficerCenterPage.jsx";
import OfficerNav from "./components/OfficerNav.jsx";
import AdminNav from "./components/AdminNav.jsx";

const CUSTOMER_NAV = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/accounts", label: "Accounts", Icon: WalletCards },
  { to: "/transfer", label: "Transfers", Icon: ArrowLeftRight },
  { to: "/transactions", label: "Transactions", Icon: ReceiptText },
  { to: "/loan-products", label: "Loans", Icon: HandCoins },
  { to: "/cards", label: "Cards", Icon: CreditCard },
  { to: "/investments", label: "Investments", Icon: PieChart },
  { to: "/messages", label: "Messages", Icon: MessageSquare },
  { to: "/settings", label: "Settings", Icon: Settings },
  { to: "/profile", label: "Profile", Icon: UserRound },
];

function HomePage() {
  const { user } = useAuth();
  return (
    <section className="row align-items-center g-4 py-lg-4" aria-labelledby="home-heading">
      <div className="col-lg-7">
        <p className="eyebrow">FINNOVA BANK / COLLEGE LAB</p>
        <h1 id="home-heading" className="display-5 fw-bold">A solid foundation for intelligent banking.</h1>
        <p className="lead text-body-secondary my-4">
          Intelligent banking and loan management on a real stack:
          Spring Boot, MySQL and React — with synthetic data end to end.
        </p>
        <div className="d-flex flex-wrap gap-2">
          {user ? (
            <Link to="/dashboard" className="btn btn-primary btn-lg">Open dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-primary btn-lg">Sign in</Link>
              <Link to="/register" className="btn btn-outline-primary btn-lg">Create account</Link>
              <Link to="/login?next=admin" className="btn btn-dark btn-lg">Admin Login</Link>
            </>
          )}
          <Link to="/system-status" className="btn btn-link btn-lg">Check backend connection</Link>
        </div>
        <p className="small text-body-secondary mt-3">Synthetic data only. No real money or banking connections.</p>
      </div>
      <div className="col-lg-5">
        <aside className="glass-soft p-2 rounded-4" aria-labelledby="scope-heading">
          <div className="card-body">
            <h2 id="scope-heading" className="h5 mb-3">What you can explore</h2>
            <ul className="list-group list-group-flush">
              <li className="list-group-item px-0 d-flex justify-content-between gap-3">
                <span>Sign in, register, profile</span><span className="scope-label text-pos">Available</span>
              </li>
              <li className="list-group-item px-0 d-flex justify-content-between gap-3">
                <span>Accounts, transfers, transactions</span><span className="scope-label text-pos">Available</span>
              </li>
              <li className="list-group-item px-0 d-flex justify-content-between gap-3">
                <span>Loan products and applications</span><span className="scope-label text-pos">Available</span>
              </li>
              <li className="list-group-item px-0 d-flex justify-content-between gap-3">
                <span>Officer KYC and admin oversight</span><span className="scope-label text-pos">Available</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

function NotFoundPage() {
  return (
    <section>
      <h1 className="h2">Page not found</h1>
      <p>This route is not available.</p>
      <Link to="/" className="btn btn-primary">Return home</Link>
    </section>
  );
}

function DashboardHome() {
  const { user } = useAuth();
  if (user && user.role === "LOAN_OFFICER") return <Navigate to="/officer" replace />;
  if (user && user.role === "ADMIN") return <Navigate to="/admin" replace />;
  return <DashboardPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthShowcase><LoginPage /></AuthShowcase>} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/system-status" element={<SystemStatusPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardHome />} />
        <Route element={<ProtectedRoute roles={["CUSTOMER", "ADMIN"]} />}>
          <Route path="/transfer" element={<TransferPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/investments" element={<InvestmentsPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/loan-products" element={<LoanProductsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
          <Route path="/admin" element={<AdminCenterPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={["LOAN_OFFICER", "ADMIN"]} />}>
          <Route path="/officer" element={<OfficerCenterPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function PublicShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header>
        <nav className="navbar container py-3 gap-3" aria-label="Main navigation">
          <Link className="navbar-brand fw-bold m-0" to="/">
            <span className="brand-mark me-2" aria-hidden="true"><Landmark size={17} strokeWidth={2.4} /></span>
            FinNova Bank
          </Link>
          <div className="d-flex align-items-center flex-wrap gap-2 gap-md-3">
            <NavLink to="/" end className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>Home</NavLink>
            <NavLink to="/login" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>Sign in</NavLink>
            <NavLink to="/register" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>Register</NavLink>
            <NavLink to="/system-status" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>System status</NavLink>
            <span className="badge simulation-badge">SIMULATION ONLY</span>
          </div>
        </nav>
      </header>
      <main id="main-content" className="container flex-grow-1 py-5" tabIndex={-1}>
        <AppRoutes />
      </main>
      <footer className="container py-4 small text-body-secondary border-top">
        FinNova Bank — educational banking demo. Synthetic data, INR, Asia/Kolkata display timezone. Not a production banking service.
      </footer>
    </div>
  );
}

function RailLink({ to, label, Icon, badge, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) => "fn-rail-link d-flex align-items-center justify-content-between" + (isActive ? " active" : "")}
    >
      <span className="d-flex align-items-center gap-2">
        <Icon size={17} strokeWidth={2.1} aria-hidden="true" />
        <span>{label}</span>
      </span>
      {badge && <span className="badge text-bg-danger rounded-pill" style={{ fontSize: "0.65rem" }}>{badge}</span>}
    </NavLink>
  );
}

function WorkspaceShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  const closeDrawer = () => setDrawerOpen(false);
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const isAdmin = user.role === "ADMIN";

  return (
    <div className={"fn-shell" + (drawerOpen ? " fn-shell-open" : "")}>
      <a className="skip-link" href="#main-content">Skip to content</a>

      <div className="fn-rail-backdrop d-lg-none" aria-hidden="true" onClick={closeDrawer} />
      <aside className="fn-rail" aria-label="Workspace navigation">
        <Link className="fn-rail-brand" to="/" onClick={closeDrawer}>
          <span className="brand-mark" aria-hidden="true"><Landmark size={17} strokeWidth={2.4} /></span>
          <span>FinNova Bank</span>
        </Link>

        <nav className="fn-rail-nav">
          {user.role === "LOAN_OFFICER" ? (
            <OfficerNav user={user} onNavigate={closeDrawer} />
          ) : isAdmin ? (
            <AdminNav user={user} onNavigate={closeDrawer} bankingItems={CUSTOMER_NAV} />
          ) : (
            <>
              <p className="fn-rail-group">Banking</p>
              {CUSTOMER_NAV.map((item) => (
                <RailLink key={item.label} to={item.to} label={item.label} Icon={item.Icon} badge={item.badge} onNavigate={closeDrawer} />
              ))}
            </>
          )}
          <p className="fn-rail-group mt-3">System</p>
          <RailLink to="/system-status" label="System status" Icon={Activity} onNavigate={closeDrawer} />
        </nav>

        <div className="fn-rail-footer">
          <div className="fn-rail-user">
            <span className="fn-rail-avatar" aria-hidden="true">
              {(user.fullName || "U").split(" ").filter(Boolean).map((w) => w.charAt(0)).slice(0, 2).join("").toUpperCase()}
            </span>
            <span className="fn-rail-user-text">
              <strong>{user.fullName || "Account"}</strong>
              <small>{user.role === "LOAN_OFFICER" ? "Bank Officer" : user.role === "ADMIN" ? "Administrator" : "Customer"}</small>
            </span>
          </div>
          <button type="button" className="fn-rail-logout" onClick={handleLogout} aria-label="Sign out" title="Sign out">
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="fn-workspace">
        <header className="fn-topbar">
          <button type="button" className="btn btn-outline-secondary btn-sm d-lg-none d-inline-flex align-items-center gap-2"
            onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu">
            <Menu size={16} aria-hidden="true" /> Menu
          </button>
          <span className="small text-body-secondary d-none d-md-inline">{today}</span>
          <span className="ms-auto" />
          <Link to="/system-status" className="btn btn-outline-secondary btn-sm d-none d-sm-inline-flex align-items-center gap-2">
            <Activity size={14} aria-hidden="true" /> API
          </Link>
          <span className="badge simulation-badge">SIMULATION ONLY</span>
        </header>
        <main id="main-content" className="fn-content" tabIndex={-1}>
          <AppRoutes />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  return user ? <WorkspaceShell /> : <PublicShell />;
}