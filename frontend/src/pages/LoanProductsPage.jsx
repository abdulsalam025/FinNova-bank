import { useCallback, useEffect, useState } from "react";
import {
  getLoanQuote,
  listLoanProducts,
  createLoanApplication,
  submitLoanApplication,
  resubmitLoanApplication,
  deleteLoanApplicationDraft,
  listLoanApplications,
  getLoanApplicationHistory,
  listMyLoans,
  getLoanInstallments,
  payLoanInstallment,
} from "../api/loans.js";
import { listAccounts } from "../api/accounts.js";

function money(value) {
  if (value == null || value === "") return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function rate(value) {
  return value == null ? "-" : `${Number(value).toFixed(2)}%`;
}

function errorText(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.detail ||
    error?.response?.data?.error ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

const WORKFLOW_STEPS = [
  { key: "SUBMITTED", label: "1. Applied", desc: "Sent to Loan Officer queue" },
  { key: "UNDER_REVIEW", label: "2. Officer Verification", desc: "KYC, FOIR & policy verification" },
  { key: "APPROVED", label: "3. Forwarded to Admin", desc: "Officer verified; awaiting Admin final approval" },
  { key: "DISBURSED", label: "4. Admin Approved & Credited", desc: "Loan amount credited to bank account" },
  { key: "REPAYMENT", label: "5. Active / Repayment", desc: "Amortization schedule active" },
];

function stageIndexForStatus(status) {
  const s = String(status || "").toUpperCase();
  if (s === "DRAFT") return 0;
  if (s === "SUBMITTED") return 1;
  if (s === "UNDER_REVIEW" || s === "ADDITIONAL_INFO_REQUIRED") return 2;
  if (s === "APPROVED") return 3;
  if (s === "DISBURSED") return 4;
  if (s === "REPAYMENT" || s === "CLOSED") return 5;
  if (s === "REJECTED") return -1;
  return 0;
}

function statusDescription(status) {
  const s = String(status || "").toUpperCase();
  if (s === "DRAFT") return "Draft saved - submit to send to a Loan Officer.";
  if (s === "SUBMITTED") return "In Loan Officer queue awaiting initial review.";
  if (s === "UNDER_REVIEW") return "Loan Officer is performing advanced verification (KYC, income & EMI affordability).";
  if (s === "ADDITIONAL_INFO_REQUIRED") return "Loan Officer requested additional details - reply below to resume verification.";
  if (s === "APPROVED") return "Verified by Loan Officer and forwarded to Admin for final approval & account credit.";
  if (s === "DISBURSED" || s === "REPAYMENT") return "Approved by Admin - loan principal has been credited to your disbursement account.";
  if (s === "CLOSED") return "Loan fully repaid and closed.";
  if (s === "REJECTED") return "Application was declined during review.";
  return s;
}

export default function LoanProductsPage() {
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [principal, setPrincipal] = useState("100000");
  const [months, setMonths] = useState("12");
  const [annualRate, setAnnualRate] = useState("");
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState("");

  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountError, setAccountError] = useState("");
  const [applicationAccountId, setApplicationAccountId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [application, setApplication] = useState(null);
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [applicationError, setApplicationError] = useState("");
  const [applicationNotice, setApplicationNotice] = useState("");

  const [applicationHistory, setApplicationHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);

  const [resubmitTarget, setResubmitTarget] = useState(null);
  const [resubmitNotes, setResubmitNotes] = useState("");
  const [auditTrailAppId, setAuditTrailAppId] = useState(null);
  const [auditTrail, setAuditTrail] = useState([]);
  const [auditTrailLoading, setAuditTrailLoading] = useState(false);

  const [myLoans, setMyLoans] = useState([]);
  const [loansLoading, setLoansLoading] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [installments, setInstallments] = useState([]);
  const [installmentsLoading, setInstallmentsLoading] = useState(false);
  const [payingInstallmentId, setPayingInstallmentId] = useState(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listLoanProducts({ page: 0, size: 100 });
      const items = Array.isArray(data) ? data : data?.items ?? [];
      setProducts(items);
      setSelectedId((current) =>
        items.some((product) => String(product.id) === current)
          ? current
          : String(items[0]?.id ?? "")
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomerAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountError("");
    try {
      const data = await listAccounts({ page: 0, size: 100, status: "ACTIVE" });
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const eligible = items.filter(
        (account) => account.status === "ACTIVE" && String(account.currency).toUpperCase() === "INR"
      );
      setAccounts(eligible);
      setApplicationAccountId((current) =>
        eligible.some((account) => String(account.id) === current)
          ? current
          : String(eligible[0]?.id ?? "")
      );
    } catch (err) {
      setAccountError(errorText(err));
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const loadApplicationHistory = useCallback(async (page = 0) => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const result = await listLoanApplications({ page, size: 8 });
      const items = Array.isArray(result) ? result : result?.items ?? result?.content ?? [];
      setApplicationHistory(items);
      setHistoryTotalPages(Number(result?.totalPages ?? result?.page?.totalPages ?? 0));
      setHistoryPage(page);
    } catch (err) {
      setHistoryError(errorText(err));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadDisbursedLoans = useCallback(async () => {
    setLoansLoading(true);
    try {
      const result = await listMyLoans({ page: 0, size: 20 });
      const items = Array.isArray(result) ? result : result?.items ?? [];
      setMyLoans(items);
    } catch {
      // ignore if none
    } finally {
      setLoansLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { loadCustomerAccounts(); }, [loadCustomerAccounts]);
  useEffect(() => { loadApplicationHistory(0); }, [loadApplicationHistory]);
  useEffect(() => { loadDisbursedLoans(); }, [loadDisbursedLoans]);

  const selectedProduct = products.find((product) => String(product.id) === selectedId);

  async function calculateQuote(event) {
    if (event) event.preventDefault();
    setQuote(null);
    setQuoteError("");

    const amount = Number(principal);
    const term = Number(months);
    const product = selectedProduct;

    if (!product) {
      setQuoteError("Choose a loan product.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setQuoteError("Enter a valid loan amount.");
      return;
    }
    if (!Number.isInteger(term) || term <= 0) {
      setQuoteError("Enter a valid loan tenure in months.");
      return;
    }
    if (amount < Number(product.minPrincipal) || amount > Number(product.maxPrincipal)) {
      setQuoteError(`This product allows a principal between ${money(product.minPrincipal)} and ${money(product.maxPrincipal)}.`);
      return;
    }
    if (
      term < product.minTenureMonths ||
      term > product.maxTenureMonths ||
      (term - product.minTenureMonths) % product.tenureStepMonths !== 0
    ) {
      setQuoteError(`Choose a tenure from ${product.minTenureMonths} to ${product.maxTenureMonths} months in steps of ${product.tenureStepMonths}.`);
      return;
    }
    if (annualRate !== "") {
      const requestedRate = Number(annualRate);
      if (
        !Number.isFinite(requestedRate) ||
        requestedRate < Number(product.minAnnualRate) ||
        requestedRate > Number(product.maxAnnualRate)
      ) {
        setQuoteError(`The optional rate must be between ${rate(product.minAnnualRate)} and ${rate(product.maxAnnualRate)}.`);
        return;
      }
    }

    setQuoting(true);
    try {
      const result = await getLoanQuote(product.id, amount, term, annualRate);
      setQuote(result);
    } catch (err) {
      setQuoteError(errorText(err));
    } finally {
      setQuoting(false);
    }
  }

  async function createDraftApplication(event) {
    event.preventDefault();
    setApplicationError("");
    setApplicationNotice("");
    setApplication(null);

    if (!selectedProduct) {
      setApplicationError("Choose a loan product first.");
      return;
    }
    if (!applicationAccountId) {
      setApplicationError("Select an eligible active INR account.");
      return;
    }
    if (!purpose.trim()) {
      setApplicationError("Enter the purpose of this loan.");
      return;
    }

    const amount = Number(principal);
    const term = Number(months);

    if (
      !Number.isFinite(amount) ||
      amount < Number(selectedProduct.minPrincipal) ||
      amount > Number(selectedProduct.maxPrincipal)
    ) {
      setApplicationError(`Enter an amount between ${money(selectedProduct.minPrincipal)} and ${money(selectedProduct.maxPrincipal)}.`);
      return;
    }

    if (
      !Number.isInteger(term) ||
      term < Number(selectedProduct.minTenureMonths) ||
      term > Number(selectedProduct.maxTenureMonths) ||
      (term - Number(selectedProduct.minTenureMonths)) % Number(selectedProduct.tenureStepMonths || 1) !== 0
    ) {
      setApplicationError("Enter a valid tenure for the selected product.");
      return;
    }

    setApplicationBusy(true);
    try {
      const created = await createLoanApplication({
        productId: Number(selectedId),
        accountId: Number(applicationAccountId),
        principal: amount,
        months: term,
        purpose: purpose.trim(),
      });
      setApplication(created);
      await loadApplicationHistory(0);
      setApplicationNotice("Draft created. Review the details below, then submit it to send it to the Loan Officer queue.");
    } catch (err) {
      setApplicationError(errorText(err));
    } finally {
      setApplicationBusy(false);
    }
  }

  async function submitDraftApplication(targetId) {
    const idToSubmit = targetId || application?.id;
    if (!idToSubmit || applicationBusy) return;

    setApplicationBusy(true);
    setApplicationError("");
    setApplicationNotice("");

    try {
      const submitted = await submitLoanApplication(idToSubmit);
      setApplication(submitted);
      await loadApplicationHistory(historyPage);
      setApplicationNotice(
        `Application #${submitted.id} submitted! Stage 1 complete: it is now in the Loan Officer queue for advanced verification.`
      );
    } catch (err) {
      setApplicationError(errorText(err));
    } finally {
      setApplicationBusy(false);
    }
  }

  async function handleDeleteDraft(id) {
    if (applicationBusy) return;
    setApplicationBusy(true);
    setApplicationError("");
    try {
      await deleteLoanApplicationDraft(id);
      if (application?.id === id) setApplication(null);
      await loadApplicationHistory(historyPage);
      setApplicationNotice(`Draft application #${id} deleted.`);
    } catch (err) {
      setApplicationError(errorText(err));
    } finally {
      setApplicationBusy(false);
    }
  }

  async function handleResubmitInfo(event) {
    event.preventDefault();
    if (!resubmitTarget || !resubmitNotes.trim() || applicationBusy) return;
    setApplicationBusy(true);
    setApplicationError("");
    try {
      const updated = await resubmitLoanApplication(resubmitTarget.id, resubmitNotes.trim());
      setApplication(updated);
      setResubmitTarget(null);
      setResubmitNotes("");
      await loadApplicationHistory(historyPage);
      setApplicationNotice(`Additional information sent to Loan Officer for application #${updated.id}.`);
    } catch (err) {
      setApplicationError(errorText(err));
    } finally {
      setApplicationBusy(false);
    }
  }

  async function handleInspectHistory(appId) {
    if (auditTrailAppId === appId) {
      setAuditTrailAppId(null);
      return;
    }
    setAuditTrailAppId(appId);
    setAuditTrailLoading(true);
    try {
      const data = await getLoanApplicationHistory(appId);
      setAuditTrail(data?.items ?? []);
    } catch {
      setAuditTrail([]);
    } finally {
      setAuditTrailLoading(false);
    }
  }

  async function handleViewSchedule(loanId) {
    if (selectedLoanId === loanId) {
      setSelectedLoanId(null);
      return;
    }
    setSelectedLoanId(loanId);
    setInstallmentsLoading(true);
    try {
      const data = await getLoanInstallments(loanId);
      setInstallments(data?.items ?? []);
    } catch {
      setInstallments([]);
    } finally {
      setInstallmentsLoading(false);
    }
  }

  async function handlePayInstallment(loan, inst) {
    const payAccount = loan.accountId || Number(applicationAccountId) || accounts[0]?.id;
    if (!payAccount) {
      setApplicationError("No active INR account available to pay this installment.");
      return;
    }
    setPayingInstallmentId(inst.id);
    setApplicationError("");
    try {
      const key = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${inst.id}`;
      await payLoanInstallment(loan.id, inst.id, Number(payAccount), key);
      const updatedSchedule = await getLoanInstallments(loan.id);
      setInstallments(updatedSchedule?.items ?? []);
      await loadDisbursedLoans();
      await loadCustomerAccounts();
      await loadApplicationHistory(historyPage);
      setApplicationNotice(`Installment #${inst.number} (${money(inst.total)}) paid!`);
    } catch (err) {
      setApplicationError(errorText(err));
    } finally {
      setPayingInstallmentId(null);
    }
  }

  return (
    <main className="container py-4 py-lg-5">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <p className="text-primary fw-semibold mb-1">FINNOVA LENDING · MULTI-STAGE APPROVAL WORKFLOW</p>
          <h1 className="h2 fw-bold mb-1">Loan Products &amp; Applications</h1>
          <p className="text-secondary mb-0">
            Apply online → Loan Officer performs advanced KYC &amp; affordability verification → Admin gives final approval &amp; credits your account.
          </p>
        </div>
        <button
          className="btn btn-outline-primary"
          onClick={() => {
            loadProducts();
            loadApplicationHistory(historyPage);
            loadDisbursedLoans();
            loadCustomerAccounts();
          }}
          disabled={loading}
        >
          Refresh all
        </button>
      </div>

      {/* Multi-step workflow banner */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3 p-lg-4">
          <div className="small fw-semibold text-uppercase text-secondary mb-2">How FinNova Loan Approval &amp; Disbursement Works</div>
          <div className="row g-2">
            {WORKFLOW_STEPS.map((step) => (
              <div className="col-12 col-md" key={step.key}>
                <div className="border rounded-3 p-2 h-100 bg-light-subtle">
                  <div className="fw-bold small">{step.label}</div>
                  <div className="small text-secondary">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {loading ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4 text-secondary">Loading loan products...</div>
        </div>
      ) : products.length === 0 ? (
        <div className="alert alert-info">No loan products were returned by the backend.</div>
      ) : (
        <>
          <div className="row g-3 mb-4">
            {products.map((product) => (
              <div className="col-md-6 col-xl-4" key={product.id}>
                <button
                  type="button"
                  className={`card h-100 w-100 text-start shadow-sm ${
                    String(product.id) === selectedId ? "border-primary border-2" : "border-0"
                  }`}
                  onClick={() => {
                    setSelectedId(String(product.id));
                    setQuote(null);
                    setQuoteError("");
                  }}
                >
                  <div className="card-body p-4">
                    <div className="d-flex justify-content-between align-items-start gap-2 mb-3">
                      <span className="badge text-bg-primary">{product.code}</span>
                      {String(product.id) === selectedId && (
                        <span className="badge text-bg-success">Selected</span>
                      )}
                    </div>
                    <h2 className="h5 fw-bold">{product.name}</h2>
                    <p className="text-secondary small">
                      {product.description || "Loan product details provided by the bank."}
                    </p>
                    <div className="mb-2">
                      <span className="text-secondary small">Annual interest rate</span>
                      <div className="fw-bold">
                        {rate(product.minAnnualRate)} - {rate(product.maxAnnualRate)} (Default {rate(product.annualRate)})
                      </div>
                    </div>
                    <div className="mb-2">
                      <span className="text-secondary small">Principal range</span>
                      <div className="fw-semibold">
                        {money(product.minPrincipal)} - {money(product.maxPrincipal)}
                      </div>
                    </div>
                    <div className="d-flex justify-content-between">
                      <div>
                        <span className="text-secondary small">Tenure</span>
                        <div className="fw-semibold">
                          {product.minTenureMonths}-{product.maxTenureMonths} months
                        </div>
                      </div>
                      <div>
                        <span className="text-secondary small">Income cap</span>
                        <div className="fw-semibold">{product.maxIncomeMultiplier}x monthly</div>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>

          <div className="row g-4">
            <div className="col-lg-5">
              <section className="card border-0 shadow-sm h-100">
                <div className="card-body p-4">
                  <h2 className="h5 fw-bold mb-1">EMI &amp; Eligibility Calculator</h2>
                  <p className="text-secondary small mb-4">
                    Preview your monthly EMI, total interest, and repayment split before applying.
                  </p>

                  <form onSubmit={calculateQuote}>
                    <div className="mb-3">
                      <label htmlFor="loanProduct" className="form-label">Product</label>
                      <select
                        id="loanProduct"
                        className="form-select"
                        value={selectedId}
                        onChange={(event) => {
                          setSelectedId(event.target.value);
                          setQuote(null);
                          setQuoteError("");
                        }}
                        required
                      >
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>{product.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-3">
                      <label htmlFor="loanPrincipal" className="form-label">Loan amount (INR)</label>
                      <input
                        id="loanPrincipal"
                        className="form-control"
                        type="number"
                        min={selectedProduct?.minPrincipal ?? "0.01"}
                        max={selectedProduct?.maxPrincipal}
                        step="0.01"
                        value={principal}
                        onChange={(event) => {
                          setPrincipal(event.target.value);
                          setQuote(null);
                        }}
                        required
                      />
                      {selectedProduct && (
                        <div className="form-text">
                          Min {money(selectedProduct.minPrincipal)} · Max {money(selectedProduct.maxPrincipal)}
                        </div>
                      )}
                    </div>

                    <div className="mb-3">
                      <label htmlFor="loanMonths" className="form-label">Tenure (months)</label>
                      <input
                        id="loanMonths"
                        className="form-control"
                        type="number"
                        min={selectedProduct?.minTenureMonths ?? 1}
                        max={selectedProduct?.maxTenureMonths ?? 600}
                        step={selectedProduct?.tenureStepMonths ?? 1}
                        value={months}
                        onChange={(event) => {
                          setMonths(event.target.value);
                          setQuote(null);
                        }}
                        required
                      />
                    </div>

                    <div className="mb-4">
                      <label htmlFor="annualRate" className="form-label">Annual interest rate override (optional)</label>
                      <input
                        id="annualRate"
                        className="form-control"
                        type="number"
                        min={selectedProduct?.minAnnualRate ?? 0}
                        max={selectedProduct?.maxAnnualRate}
                        step="0.01"
                        value={annualRate}
                        onChange={(event) => {
                          setAnnualRate(event.target.value);
                          setQuote(null);
                        }}
                        placeholder="Use product's default rate"
                      />
                    </div>

                    {quoteError && <div className="alert alert-danger" role="alert">{quoteError}</div>}

                    <button className="btn btn-primary w-100" type="submit" disabled={quoting || !selectedId}>
                      {quoting ? "Calculating..." : "Calculate EMI"}
                    </button>
                  </form>
                </div>
              </section>
            </div>

            <div className="col-lg-7">
              <section className="card border-0 shadow-sm h-100">
                <div className="card-body p-4">
                  <h2 className="h5 fw-bold mb-1">Repayment estimate</h2>
                  <p className="text-secondary small mb-4">
                    Figures below appear after a successful quote from the server.
                  </p>

                  {!quote ? (
                    <div className="rounded bg-light p-4 text-center">
                      <div className="display-6 mb-2">INR</div>
                      <p className="text-secondary mb-0">
                        Choose a product and calculate your estimated EMI.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded bg-primary text-white p-4 mb-3">
                        <div className="small opacity-75">Estimated monthly EMI</div>
                        <div className="display-5 fw-bold">{money(quote.calculation?.emi)}</div>
                        <div className="small opacity-75 mt-2">
                          {quote.months} months · {rate(quote.annualRate)} annual interest
                        </div>
                      </div>

                      <div className="row g-3">
                        <div className="col-sm-6">
                          <div className="border rounded p-3 h-100">
                            <div className="small text-secondary">Principal</div>
                            <div className="h5 fw-bold mb-0">{money(quote.principal)}</div>
                          </div>
                        </div>
                        <div className="col-sm-6">
                          <div className="border rounded p-3 h-100">
                            <div className="small text-secondary">Total interest</div>
                            <div className="h5 fw-bold mb-0">{money(quote.calculation?.totalInterest)}</div>
                          </div>
                        </div>
                        <div className="col-sm-6">
                          <div className="border rounded p-3 h-100">
                            <div className="small text-secondary">Total repayment</div>
                            <div className="h5 fw-bold mb-0">{money(quote.calculation?.totalPayment)}</div>
                          </div>
                        </div>
                        <div className="col-sm-6">
                          <div className="border rounded p-3 h-100">
                            <div className="small text-secondary">Loan tenure</div>
                            <div className="h5 fw-bold mb-0">{quote.months} months</div>
                          </div>
                        </div>
                      </div>

                      <section className="mt-4 border rounded-3 p-3">
                        <h3 className="h6 fw-bold mb-3">Repayment breakdown</h3>
                        {(() => {
                          const principalValue = Number(quote.principal) || 0;
                          const interestValue = Number(quote.calculation?.totalInterest) || 0;
                          const totalValue = principalValue + interestValue;
                          const principalPercent = totalValue > 0 ? (principalValue / totalValue) * 100 : 0;
                          const interestPercent = totalValue > 0 ? (interestValue / totalValue) * 100 : 0;

                          return (
                            <>
                              <div className="d-flex justify-content-between gap-3 mb-2">
                                <span><span className="badge text-bg-primary me-2">&nbsp;</span>Principal</span>
                                <strong>{principalPercent.toFixed(1)}%</strong>
                              </div>
                              <div className="progress mb-3" style={{ height: "12px" }}>
                                <div
                                  className="progress-bar"
                                  role="progressbar"
                                  style={{ width: `${principalPercent}%` }}
                                  aria-label="Principal share"
                                  aria-valuenow={principalPercent}
                                  aria-valuemin="0"
                                  aria-valuemax="100"
                                />
                              </div>
                              <div className="d-flex justify-content-between gap-3 mb-2">
                                <span><span className="badge text-bg-warning me-2">&nbsp;</span>Interest</span>
                                <strong>{interestPercent.toFixed(1)}%</strong>
                              </div>
                              <div className="progress mb-3" style={{ height: "12px" }}>
                                <div
                                  className="progress-bar bg-warning"
                                  role="progressbar"
                                  style={{ width: `${interestPercent}%` }}
                                  aria-label="Interest share"
                                  aria-valuenow={interestPercent}
                                  aria-valuemin="0"
                                  aria-valuemax="100"
                                />
                              </div>
                              <div className="d-flex justify-content-between border-top pt-3">
                                <span className="text-secondary">Total repayment</span>
                                <strong>{money(quote.calculation?.totalPayment)}</strong>
                              </div>
                            </>
                          );
                        })()}
                      </section>
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>

          {/* Apply for a Loan section */}
          <section className="card border-0 shadow-sm mt-4" aria-labelledby="loan-application-heading">
            <div className="card-body p-4 p-lg-5">
              <p className="text-primary fw-semibold mb-1">STEP 1 · CUSTOMER APPLICATION</p>
              <h2 id="loan-application-heading" className="h4 fw-bold">Apply for a Loan</h2>
              <p className="text-secondary">
                Choose the target INR bank account where funds should be credited once verified by an Officer and approved by an Admin.
              </p>

              {accountError && <div className="alert alert-danger" role="alert">{accountError}</div>}
              {applicationError && <div className="alert alert-danger" role="alert">{applicationError}</div>}
              {applicationNotice && <div className="alert alert-success" role="status">{applicationNotice}</div>}

              <form onSubmit={createDraftApplication}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label htmlFor="applicationProduct" className="form-label">Loan product</label>
                    <select
                      id="applicationProduct"
                      className="form-select"
                      value={selectedId}
                      onChange={(event) => {
                        setSelectedId(event.target.value);
                        setQuote(null);
                        setApplication(null);
                        setApplicationNotice("");
                        setApplicationError("");
                      }}
                      required
                      disabled={applicationBusy}
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label htmlFor="applicationAccount" className="form-label">Disbursement account (credited upon Admin approval)</label>
                    <select
                      id="applicationAccount"
                      className="form-select"
                      value={applicationAccountId}
                      onChange={(event) => setApplicationAccountId(event.target.value)}
                      required
                      disabled={accountsLoading || accounts.length === 0 || applicationBusy}
                    >
                      <option value="">
                        {accountsLoading ? "Loading accounts..." : "Select an active INR account"}
                      </option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {(account.nickname || "Bank account")} · {account.accountNumber} · Balance {money(account.balance)}
                        </option>
                      ))}
                    </select>
                    {!accountsLoading && accounts.length === 0 && (
                      <div className="form-text text-danger">No active INR account found. Open or activate an eligible account first.</div>
                    )}
                  </div>

                  <div className="col-md-6">
                    <label htmlFor="applicationAmount" className="form-label">Requested amount (INR)</label>
                    <input
                      id="applicationAmount"
                      className="form-control"
                      type="number"
                      min={selectedProduct?.minPrincipal ?? "0.01"}
                      max={selectedProduct?.maxPrincipal}
                      step="0.01"
                      value={principal}
                      onChange={(event) => {
                        setPrincipal(event.target.value);
                        setQuote(null);
                        setApplication(null);
                        setApplicationNotice("");
                      }}
                      required
                      disabled={applicationBusy}
                    />
                    {selectedProduct && (
                      <div className="form-text">
                        Allowed: {money(selectedProduct.minPrincipal)} - {money(selectedProduct.maxPrincipal)}
                      </div>
                    )}
                  </div>

                  <div className="col-md-6">
                    <label htmlFor="applicationMonths" className="form-label">Tenure (months)</label>
                    <input
                      id="applicationMonths"
                      className="form-control"
                      type="number"
                      min={selectedProduct?.minTenureMonths ?? 1}
                      max={selectedProduct?.maxTenureMonths ?? 600}
                      step={selectedProduct?.tenureStepMonths ?? 1}
                      value={months}
                      onChange={(event) => {
                        setMonths(event.target.value);
                        setQuote(null);
                        setApplication(null);
                        setApplicationNotice("");
                      }}
                      required
                      disabled={applicationBusy}
                    />
                  </div>

                  <div className="col-12">
                    <label htmlFor="applicationPurpose" className="form-label">Purpose &amp; supporting declaration</label>
                    <textarea
                      id="applicationPurpose"
                      className="form-control"
                      rows="3"
                      maxLength={1000}
                      value={purpose}
                      onChange={(event) => setPurpose(event.target.value)}
                      placeholder="Explain the purpose of this loan and any supporting employment/income details for the Loan Officer."
                      required
                      disabled={applicationBusy}
                    />
                    <div className="form-text">Maximum 1,000 characters ({purpose.length}/1000).</div>
                  </div>
                </div>

                <div className="d-flex flex-wrap gap-2 mt-4">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={
                      applicationBusy ||
                      accountsLoading ||
                      !selectedProduct ||
                      !applicationAccountId ||
                      !purpose.trim()
                    }
                  >
                    {applicationBusy ? "Creating draft..." : "Create Application Draft"}
                  </button>
                </div>
              </form>

              {application && (
                <div className="border rounded-3 p-3 mt-4 bg-light-subtle">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <h3 className="h6 fw-bold mb-0">Application #{application.id} — {application.productName || selectedProduct?.name}</h3>
                    <span className="badge text-bg-primary">
                      {String(application.status || "DRAFT").replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="small text-secondary mt-1 mb-2">{statusDescription(application.status)}</p>
                  <dl className="row small mt-2 mb-0">
                    <dt className="col-sm-4">Disbursement Account ID</dt>
                    <dd className="col-sm-8">Account #{application.accountId}</dd>
                    <dt className="col-sm-4">Requested Principal</dt>
                    <dd className="col-sm-8 fw-bold">{money(application.principal ?? principal)}</dd>
                    <dt className="col-sm-4">Tenure &amp; Rate</dt>
                    <dd className="col-sm-8">{application.months ?? months} months @ {rate(application.annualRate)}</dd>
                    <dt className="col-sm-4">Purpose</dt>
                    <dd className="col-sm-8">{application.purpose || purpose}</dd>
                  </dl>

                  {String(application.status || "DRAFT").toUpperCase() === "DRAFT" && (
                    <div className="mt-3 d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-success"
                        onClick={() => submitDraftApplication(application.id)}
                        disabled={applicationBusy}
                      >
                        {applicationBusy ? "Submitting..." : "Submit Application to Loan Officer"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* My Loan Applications & Multi-Stage Tracker */}
          <section className="card border-0 shadow-sm mt-4" aria-labelledby="application-history-heading">
            <div className="card-body p-4">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <div>
                  <h2 id="application-history-heading" className="h4 fw-bold mb-1">My Loan Applications &amp; Approval Tracker</h2>
                  <p className="text-secondary small mb-0">
                    Follow each application from Officer Verification through Admin Final Approval and Account Disbursement.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => { loadApplicationHistory(historyPage); loadDisbursedLoans(); }}
                  disabled={historyLoading}
                >
                  {historyLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {historyError && <div className="alert alert-danger" role="alert">{historyError}</div>}
              {historyLoading && applicationHistory.length === 0 ? (
                <p className="text-secondary">Loading applications...</p>
              ) : applicationHistory.length === 0 ? (
                <p className="text-secondary mb-0">No applications found.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table align-middle">
                    <thead>
                      <tr>
                        <th>Application</th>
                        <th>Product &amp; Account</th>
                        <th>Amount &amp; Tenure</th>
                        <th>Workflow Stage</th>
                        <th>Officer / Admin Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applicationHistory.map((item) => {
                        const status = String(item.status || "UNKNOWN").toUpperCase();
                        const stageIdx = stageIndexForStatus(status);
                        const badgeClass =
                          status === "DISBURSED" || status === "REPAYMENT" || status === "CLOSED"
                            ? "text-bg-success"
                            : status === "APPROVED"
                              ? "text-bg-info"
                              : status === "REJECTED"
                                ? "text-bg-danger"
                                : status === "ADDITIONAL_INFO_REQUIRED"
                                  ? "text-bg-warning"
                                  : status === "DRAFT"
                                    ? "text-bg-secondary"
                                    : "text-bg-primary";
                        const dateValue = item.submittedAt || item.createdAt;
                        return (
                          <tr key={item.id}>
                            <td>
                              <div className="fw-bold">#{item.id}</div>
                              <div className="small text-secondary">
                                {dateValue ? new Date(dateValue).toLocaleDateString() : "-"}
                              </div>
                            </td>
                            <td>
                              <div className="fw-semibold">{item.productName || "Loan product"}</div>
                              <div className="small text-secondary">Target Account #{item.accountId}</div>
                            </td>
                            <td>
                              <div className="fw-bold">{money(item.principal)}</div>
                              <div className="small text-secondary">{item.months} mo · {rate(item.annualRate)}</div>
                            </td>
                            <td style={{ minWidth: "220px" }}>
                              <span className={`badge ${badgeClass} mb-1`}>
                                {status === "APPROVED" ? "OFFICER VERIFIED · WITH ADMIN" : status.replaceAll("_", " ")}
                              </span>
                              <div className="small text-secondary">{statusDescription(status)}</div>
                              {stageIdx > 0 && (
                                <div className="progress mt-1" style={{ height: "6px" }}>
                                  <div
                                    className="progress-bar bg-success"
                                    style={{ width: `${Math.min(stageIdx * 20, 100)}%` }}
                                  />
                                </div>
                              )}
                            </td>
                            <td className="small">
                              {item.additionalInfoRequest && (
                                <div className="text-warning-emphasis">
                                  <strong>Info requested:</strong> {item.additionalInfoRequest}
                                </div>
                              )}
                              {item.decisionReason && (
                                <div>
                                  <strong>Decision note:</strong> {item.decisionReason}
                                </div>
                              )}
                              {!item.additionalInfoRequest && !item.decisionReason && (
                                <span className="text-secondary">{item.purpose || "-"}</span>
                              )}
                            </td>
                            <td>
                              <div className="d-flex flex-wrap gap-1">
                                {status === "DRAFT" && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-success"
                                      disabled={applicationBusy}
                                      onClick={() => submitDraftApplication(item.id)}
                                    >
                                      Submit
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-danger"
                                      disabled={applicationBusy}
                                      onClick={() => handleDeleteDraft(item.id)}
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                                {status === "ADDITIONAL_INFO_REQUIRED" && (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-warning"
                                    onClick={() => {
                                      setResubmitTarget(item);
                                      setResubmitNotes(item.customerNotes || "");
                                    }}
                                  >
                                    Provide Info
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={() => handleInspectHistory(item.id)}
                                >
                                  {auditTrailAppId === item.id ? "Hide Trail" : "Audit Trail"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {resubmitTarget && (
                <form className="border rounded-3 p-3 mt-3 bg-warning-subtle" onSubmit={handleResubmitInfo}>
                  <h3 className="h6 fw-bold mb-1">
                    Respond to Loan Officer — Application #{resubmitTarget.id}
                  </h3>
                  <p className="small mb-2">
                    Officer requested: <strong>{resubmitTarget.additionalInfoRequest || "Please provide additional clarification."}</strong>
                  </p>
                  <div className="mb-2">
                    <textarea
                      className="form-control"
                      rows="2"
                      maxLength={1000}
                      required
                      value={resubmitNotes}
                      onChange={(e) => setResubmitNotes(e.target.value)}
                      placeholder="Provide the requested clarification or document reference for the Loan Officer..."
                    />
                  </div>
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-sm btn-primary" disabled={applicationBusy}>
                      Send Response to Officer
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setResubmitTarget(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {auditTrailAppId && (
                <div className="border rounded-3 p-3 mt-3 bg-light-subtle">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h3 className="h6 fw-bold mb-0">Stage-by-Stage Audit Trail — Application #{auditTrailAppId}</h3>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setAuditTrailAppId(null)}>
                      Close
                    </button>
                  </div>
                  {auditTrailLoading ? (
                    <p className="small text-secondary mb-0">Loading trail...</p>
                  ) : auditTrail.length === 0 ? (
                    <p className="small text-secondary mb-0">No status transitions recorded yet.</p>
                  ) : (
                    <ul className="small mb-0 ps-3">
                      {auditTrail.map((h) => (
                        <li key={h.id} className="mb-1">
                          <strong>{h.fromStatus} → {h.toStatus}</strong> by {h.actorRole || h.actorType}
                          {h.actorId ? ` #${h.actorId}` : ""} ({h.occurredAt ? new Date(h.occurredAt).toLocaleString() : "-"})
                          {h.notes ? ` — "${h.notes}"` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="d-flex justify-content-between align-items-center mt-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => loadApplicationHistory(historyPage - 1)}
                  disabled={historyLoading || historyPage <= 0}
                >
                  Previous
                </button>
                <span className="small text-secondary">
                  Page {historyPage + 1}{historyTotalPages > 0 ? ` of ${historyTotalPages}` : ""}
                </span>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => loadApplicationHistory(historyPage + 1)}
                  disabled={
                    historyLoading ||
                    (historyTotalPages > 0 && historyPage + 1 >= historyTotalPages) ||
                    applicationHistory.length < 8
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </section>

          {/* Disbursed Loans & Amortization Schedule */}
          <section className="card border-0 shadow-sm mt-4" aria-labelledby="active-loans-heading">
            <div className="card-body p-4">
              <h2 id="active-loans-heading" className="h4 fw-bold mb-1">My Approved &amp; Disbursed Loans</h2>
              <p className="text-secondary small mb-3">
                Loans approved by Admin are immediately credited to your bank account and listed here with their repayment schedule.
              </p>

              {loansLoading ? (
                <p className="text-secondary mb-0">Loading disbursed loans...</p>
              ) : myLoans.length === 0 ? (
                <p className="text-secondary mb-0">
                  No disbursed loans yet. Once an Officer verifies your application and an Admin approves it, the credited loan will appear here.
                </p>
              ) : (
                <div className="table-responsive">
                  <table className="table align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Loan ID</th>
                        <th>Credited Account</th>
                        <th>Principal Disbursed</th>
                        <th>Monthly EMI</th>
                        <th>Outstanding</th>
                        <th>Status</th>
                        <th>Schedule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myLoans.map((loan) => (
                        <tr key={loan.id}>
                          <td className="fw-bold">Loan #{loan.id} <span className="small text-secondary">(App #{loan.applicationId})</span></td>
                          <td>Account #{loan.accountId}</td>
                          <td className="fw-semibold">{money(loan.principal)}</td>
                          <td>{money(loan.emi)}</td>
                          <td className="fw-bold">{money(loan.outstandingPrincipal)}</td>
                          <td><span className="badge text-bg-success">{loan.status}</span></td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleViewSchedule(loan.id)}
                            >
                              {selectedLoanId === loan.id ? "Hide Installments" : "View Installments"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedLoanId && (
                <div className="border rounded-3 p-3 mt-3 bg-light-subtle">
                  <h3 className="h6 fw-bold mb-2">Amortization Schedule — Loan #{selectedLoanId}</h3>
                  {installmentsLoading ? (
                    <p className="small text-secondary mb-0">Loading installments...</p>
                  ) : installments.length === 0 ? (
                    <p className="small text-secondary mb-0">No installments found.</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Due Date</th>
                            <th>Principal</th>
                            <th>Interest</th>
                            <th>Total EMI</th>
                            <th>Remaining</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {installments.map((inst) => {
                            const parentLoan = myLoans.find((l) => l.id === selectedLoanId);
                            return (
                              <tr key={inst.id}>
                                <td>{inst.number}</td>
                                <td>{inst.dueDate}</td>
                                <td>{money(inst.principal)}</td>
                                <td>{money(inst.interest)}</td>
                                <td className="fw-semibold">{money(inst.total)}</td>
                                <td>{money(inst.remainingBalance)}</td>
                                <td>
                                  <span className={`badge ${inst.status === "PAID" ? "text-bg-success" : "text-bg-warning"}`}>
                                    {inst.status}
                                  </span>
                                </td>
                                <td>
                                  {inst.status !== "PAID" && parentLoan && (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-primary"
                                      disabled={payingInstallmentId === inst.id}
                                      onClick={() => handlePayInstallment(parentLoan, inst)}
                                    >
                                      {payingInstallmentId === inst.id ? "Paying..." : "Pay EMI"}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}