import { useCallback, useEffect, useState } from "react";
import * as accountsApi from "../api/accounts.js";

const PAGE_SIZE = 10;

function money(value, currency = "INR") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value ?? "0.00"}`;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function readable(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error) {
  const data = error?.response?.data;
  if (typeof data === "string" && data.trim()) return data;
  if (data?.message) return data.message;
  if (data?.detail) return data.detail;
  if (error?.code === "ECONNABORTED") {
    return "The request timed out. Please try again.";
  }
  if (!error?.response) {
    return "Could not connect to the backend. Check that the backend is running.";
  }
  return `Request failed (${error.response.status}). Please try again.`;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nickname, setNickname] = useState("");
  const [accountType, setAccountType] = useState("SAVINGS");
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editNickname, setEditNickname] = useState("");

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await accountsApi.listAccounts({
        page,
        size: PAGE_SIZE,
        sortBy: "createdAt",
        sortDirection: "DESC",
        ...(search.trim() ? { q: search.trim() } : {}),
        ...(status ? { status } : {}),
      });

      setAccounts(Array.isArray(data.items) ? data.items : []);
      setTotalPages(Number(data.totalPages) || 0);
      setTotalElements(Number(data.totalElements) || 0);
    } catch (err) {
      setError(errorMessage(err));
      setAccounts([]);
      setTotalPages(0);
      setTotalElements(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  async function handleOpen(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    const cleanNickname = nickname.trim();
    if (cleanNickname.length < 2 || cleanNickname.length > 60) {
      setError("Nickname must contain between 2 and 60 characters.");
      return;
    }

    setSaving(true);
    try {
      await accountsApi.openAccount({
        nickname: cleanNickname,
        accountType,
      });
      setNickname("");
      setAccountType("SAVINGS");
      setShowOpenForm(false);
      setPage(0);
      setNotice("Account opened successfully with an initial balance of ₹0.00.");
      await loadAccounts();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRename(event, id) {
    event.preventDefault();
    setError("");
    setNotice("");

    const cleanNickname = editNickname.trim();
    if (cleanNickname.length < 2 || cleanNickname.length > 60) {
      setError("Nickname must contain between 2 and 60 characters.");
      return;
    }

    setSaving(true);
    try {
      await accountsApi.renameAccount(id, { nickname: cleanNickname });
      setEditingId(null);
      setEditNickname("");
      setNotice("Account nickname updated.");
      await loadAccounts();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleClose(account) {
    const confirmed = window.confirm(
      `Close "${account.nickname}" (${account.accountNumber})?\n\nThe backend only allows closure when the balance is zero and no active loan applications or loans reference this account.`
    );
    if (!confirmed) return;

    setError("");
    setNotice("");
    setSaving(true);

    try {
      await accountsApi.closeAccount(account.id);
      setNotice(`Account ${account.accountNumber} is now closed.`);
      await loadAccounts();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function updateSearch(value) {
    setSearch(value);
    setPage(0);
  }

  function updateStatus(value) {
    setStatus(value);
    setPage(0);
  }

  return (
    <section aria-labelledby="accounts-heading">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <p className="eyebrow mb-1">CUSTOMER BANKING</p>
          <h1 id="accounts-heading" className="h2 mb-1">My Accounts</h1>
          <p className="text-body-secondary mb-0">
            Manage your simulated FinNova accounts.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setShowOpenForm((value) => !value);
            setError("");
            setNotice("");
          }}
        >
          {showOpenForm ? "Cancel" : "+ Open account"}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}

      {showOpenForm && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body">
            <h2 className="h5 mb-3">Open a new account</h2>
            <form onSubmit={handleOpen}>
              <div className="row g-3">
                <div className="col-md-5">
                  <label htmlFor="new-account-nickname" className="form-label">
                    Account nickname
                  </label>
                  <input
                    id="new-account-nickname"
                    className="form-control"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    minLength={2}
                    maxLength={60}
                    required
                    placeholder="e.g. Everyday Savings"
                  />
                </div>
                <div className="col-md-4">
                  <label htmlFor="new-account-type" className="form-label">
                    Account type
                  </label>
                  <select
                    id="new-account-type"
                    className="form-select"
                    value={accountType}
                    onChange={(event) => setAccountType(event.target.value)}
                  >
                    <option value="SAVINGS">Savings</option>
                    <option value="CURRENT">Current</option>
                  </select>
                </div>
                <div className="col-md-3 d-flex align-items-end">
                  <button className="btn btn-primary w-100" disabled={saving}>
                    {saving ? "Opening..." : "Create account"}
                  </button>
                </div>
              </div>
              <p className="small text-body-secondary mt-3 mb-0">
                New accounts start with a simulated balance of ₹0.00.
              </p>
            </form>
          </div>
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-md-7">
          <label htmlFor="account-search" className="form-label">
            Search accounts
          </label>
          <input
            id="account-search"
            className="form-control"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search by nickname or account number"
          />
        </div>
        <div className="col-md-5">
          <label htmlFor="account-status" className="form-label">
            Filter by status
          </label>
          <select
            id="account-status"
            className="form-select"
            value={status}
            onChange={(event) => updateStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="FROZEN">Frozen</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
        <h2 className="h5 mb-0">Account list</h2>
        <span className="small text-body-secondary">
          {totalElements} account{totalElements === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body py-5 text-center" role="status">
            <div className="spinner-border text-primary mb-3" aria-hidden="true" />
            <p className="mb-0">Loading accounts...</p>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center py-5">
            <h3 className="h5">No accounts found</h3>
            <p className="text-body-secondary mb-3">
              Open an account or change your search and status filters.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowOpenForm(true)}
            >
              Open your first account
            </button>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {accounts.map((account) => (
            <div className="col-12 col-xl-6" key={account.id}>
              <article className="card border-0 shadow-sm h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="small text-body-secondary mb-1">
                        {readable(account.accountType)} account
                      </p>
                      {editingId === account.id ? (
                        <form
                          onSubmit={(event) => handleRename(event, account.id)}
                          className="d-flex flex-wrap gap-2"
                        >
                          <input
                            className="form-control form-control-sm"
                            aria-label="New account nickname"
                            value={editNickname}
                            onChange={(event) => setEditNickname(event.target.value)}
                            minLength={2}
                            maxLength={60}
                            required
                            autoFocus
                          />
                          <button className="btn btn-primary btn-sm" disabled={saving}>
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <h3 className="h5 text-break mb-1">{account.nickname}</h3>
                      )}
                      <div className="small text-body-secondary text-break">
                        {account.accountNumber}
                      </div>
                    </div>
                    <span className={`badge ${account.status === "ACTIVE" ? "text-bg-success" : account.status === "FROZEN" ? "text-bg-warning" : "text-bg-secondary"}`}>
                      {readable(account.status)}
                    </span>
                  </div>

                  <div className="rounded-3 bg-body-tertiary p-3 mb-3">
                    <div className="small text-body-secondary mb-1">Available simulated balance</div>
                    <div className="fs-3 fw-semibold">
                      {money(account.balance, account.currency)}
                    </div>
                  </div>

                  <div className="small text-body-secondary mb-3">
                    Account ID: {account.id}
                  </div>

                  <div className="d-flex flex-wrap gap-2">
                    {account.status !== "CLOSED" && (
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        disabled={saving}
                        onClick={() => {
                          setEditingId(account.id);
                          setEditNickname(account.nickname);
                          setError("");
                          setNotice("");
                        }}
                      >
                        Rename
                      </button>
                    )}
                    {account.status === "ACTIVE" && (
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        disabled={saving}
                        onClick={() => handleClose(account)}
                      >
                        Close account
                      </button>
                    )}
                  </div>
                </div>
              </article>
            </div>
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <nav className="d-flex justify-content-between align-items-center mt-4" aria-label="Account pages">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={page <= 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            Previous
          </button>
          <span className="small text-body-secondary">
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
