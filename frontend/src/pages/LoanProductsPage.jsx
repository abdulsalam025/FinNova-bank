import { useCallback, useEffect, useState } from "react";
import { getLoanQuote, listLoanProducts, createLoanApplication, submitLoanApplication, listLoanApplications } from "../api/loans.js";
import { listAccounts } from "../api/accounts.js";

function money(value) {
  if (value == null || value === "") return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function rate(value) {
  return value == null ? "—" : `${Number(value).toFixed(2)}%`;
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

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomerAccounts() {
      setAccountsLoading(true);
      setAccountError("");

      try {
        const data = await listAccounts({
          page: 0,
          size: 100,
          status: "ACTIVE",
        });
        const items = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data) ? data : [];

        const eligible = items.filter(
          (account) =>
            account.status === "ACTIVE" &&
            String(account.currency).toUpperCase() === "INR"
        );

        if (!cancelled) {
          setAccounts(eligible);
          setApplicationAccountId((current) =>
            eligible.some((account) => String(account.id) === current)
              ? current
              : String(eligible[0]?.id ?? "")
          );
        }
      } catch (err) {
        if (!cancelled) setAccountError(errorText(err));
      } finally {
        if (!cancelled) setAccountsLoading(false);
      }
    }

    loadCustomerAccounts();
    return () => {
      cancelled = true;
    };
  }, []);

  const [applicationHistory, setApplicationHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);

  const loadApplicationHistory = useCallback(async (page = 0) => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const result = await listLoanApplications({ page, size: 5 });
      const items = Array.isArray(result)
        ? result
        : (result?.items ?? result?.content ?? []);
      setApplicationHistory(items);
      setHistoryTotalPages(Number(result?.totalPages ?? result?.page?.totalPages ?? 0));
      setHistoryPage(page);
    } catch (err) {
      setHistoryError(errorText(err));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplicationHistory(0);
  }, [loadApplicationHistory]);
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
      setApplicationError(
        `Enter an amount between ${money(selectedProduct.minPrincipal)} and ${money(selectedProduct.maxPrincipal)}.`
      );
      return;
    }

    if (
      !Number.isInteger(term) ||
      term < Number(selectedProduct.minTenureMonths) ||
      term > Number(selectedProduct.maxTenureMonths) ||
      (term - Number(selectedProduct.minTenureMonths)) %
        Number(selectedProduct.tenureStepMonths || 1) !== 0
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
      setApplicationNotice(
        "Draft created. Review the details below, then submit it for review."
      );
    } catch (err) {
      setApplicationError(errorText(err));
    } finally {
      setApplicationBusy(false);
    }
  }

  async function submitDraftApplication() {
    if (!application?.id || applicationBusy) return;

    setApplicationBusy(true);
    setApplicationError("");
    setApplicationNotice("");

    try {
      const submitted = await submitLoanApplication(application.id);
      setApplication(submitted);
      await loadApplicationHistory(0);
      setApplicationNotice("Application submitted successfully for bank review.");
    } catch (err) {
      setApplicationError(errorText(err));
    } finally {
      setApplicationBusy(false);
    }
  }

  const selectedProduct = products.find(
    (product) => String(product.id) === selectedId
  );

  async function calculateQuote(event) {
    event.preventDefault();
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

    if (amount < Number(product.minPrincipal) ||
        amount > Number(product.maxPrincipal)) {
      setQuoteError(
        `This product allows a principal between ${money(product.minPrincipal)} and ${money(product.maxPrincipal)}.`
      );
      return;
    }

    if (term < product.minTenureMonths ||
        term > product.maxTenureMonths ||
        (term - product.minTenureMonths) % product.tenureStepMonths !== 0) {
      setQuoteError(
        `Choose a tenure from ${product.minTenureMonths} to ${product.maxTenureMonths} months in steps of ${product.tenureStepMonths}.`
      );
      return;
    }

    if (annualRate !== "") {
      const requestedRate = Number(annualRate);
      if (!Number.isFinite(requestedRate) ||
          requestedRate < Number(product.minAnnualRate) ||
          requestedRate > Number(product.maxAnnualRate)) {
        setQuoteError(
          `The optional rate must be between ${rate(product.minAnnualRate)} and ${rate(product.maxAnnualRate)}.`
        );
        return;
      }
    }

    setQuoting(true);
    try {
      const result = await getLoanQuote(
        product.id,
        amount,
        term,
        annualRate
      );
      setQuote(result);
    } catch (err) {
      setQuoteError(errorText(err));
    } finally {
      setQuoting(false);
    }
  }

  return (
    <main className="container py-4 py-lg-5">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <p className="text-primary fw-semibold mb-1">FINNOVA LENDING</p>
          <h1 className="h2 fw-bold mb-1">Loan Products</h1>
          <p className="text-secondary mb-0">
            Explore available products and calculate an estimated repayment.
          </p>
        </div>
        <button
          className="btn btn-outline-primary"
          onClick={loadProducts}
          disabled={loading}
        >
          Refresh products
        </button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {loading ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4 text-secondary">Loading loan products…</div>
        </div>
      ) : products.length === 0 ? (
        <div className="alert alert-info">
          No loan products were returned by the backend.
        </div>
      ) : (
        <>
          <div className="row g-3 mb-4">
            {products.map((product) => (
              <div className="col-md-6 col-xl-4" key={product.id}>
                <button
                  type="button"
                  className={`card h-100 w-100 text-start shadow-sm ${
                    String(product.id) === selectedId
                      ? "border-primary border-2"
                      : "border-0"
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
                        {rate(product.minAnnualRate)} – {rate(product.maxAnnualRate)}
                      </div>
                    </div>
                    <div className="mb-2">
                      <span className="text-secondary small">Principal range</span>
                      <div className="fw-semibold">
                        {money(product.minPrincipal)} – {money(product.maxPrincipal)}
                      </div>
                    </div>
                    <div>
                      <span className="text-secondary small">Tenure</span>
                      <div className="fw-semibold">
                        {product.minTenureMonths}–{product.maxTenureMonths} months
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
                  <h2 className="h5 fw-bold mb-1">EMI Calculator</h2>
                  <p className="text-secondary small mb-4">
                    The backend calculates the quote using its loan rules.
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
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-3">
                      <label htmlFor="loanPrincipal" className="form-label">
                        Loan amount (₹)
                      </label>
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
                      <label htmlFor="loanMonths" className="form-label">
                        Tenure (months)
                      </label>
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
                      <label htmlFor="annualRate" className="form-label">
                        Annual interest rate override (optional)
                      </label>
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

                    {quoteError && (
                      <div className="alert alert-danger" role="alert">{quoteError}</div>
                    )}

                    <button
                      className="btn btn-primary w-100"
                      type="submit"
                      disabled={quoting || !selectedId}
                    >
                      {quoting ? "Calculating…" : "Calculate EMI"}
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
                      <div className="display-6 mb-2">₹</div>
                      <p className="text-secondary mb-0">
                        Choose a product and calculate your estimated EMI.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded bg-primary text-white p-4 mb-3">
                        <div className="small opacity-75">Estimated monthly EMI</div>
                        <div className="display-5 fw-bold">
                          {money(quote.calculation?.emi)}
                        </div>
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
                            <div className="h5 fw-bold mb-0">
                              {money(quote.calculation?.totalInterest)}
                            </div>
                          </div>
                        </div>
                        <div className="col-sm-6">
                          <div className="border rounded p-3 h-100">
                            <div className="small text-secondary">Total repayment</div>
                            <div className="h5 fw-bold mb-0">
                              {money(quote.calculation?.totalPayment)}
                            </div>
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

                      <p className="small text-secondary mt-3 mb-0">
                        This is an estimate, not loan approval. Actual terms depend on the product and the bank's application review.
                      </p>
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>

          <section className="card border-0 shadow-sm mt-4" aria-labelledby="loan-application-heading">
            <div className="card-body p-4 p-lg-5">
              <p className="text-primary fw-semibold mb-1">NEXT STEP</p>
              <h2 id="loan-application-heading" className="h4 fw-bold">Apply for a Loan</h2>
              <p className="text-secondary">
                Create an application draft, check the details, and submit it for bank review.
                An EMI quote is an estimate and does not mean the loan is approved.
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
                    <label htmlFor="applicationAccount" className="form-label">Disbursement account</label>
                    <select
                      id="applicationAccount"
                      className="form-select"
                      value={applicationAccountId}
                      onChange={(event) => setApplicationAccountId(event.target.value)}
                      required
                      disabled={accountsLoading || accounts.length === 0 || applicationBusy}
                    >
                      <option value="">
                        {accountsLoading ? "Loading accounts…" : "Select an active INR account"}
                      </option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {(account.nickname || "Bank account")} · {account.accountNumber} · {account.currency}
                        </option>
                      ))}
                    </select>
                    {!accountsLoading && accounts.length === 0 && (
                      <div className="form-text">No active INR account found. Open or activate an eligible account first.</div>
                    )}
                  </div>

                  <div className="col-md-6">
                    <label htmlFor="applicationAmount" className="form-label">Requested amount (₹)</label>
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
                        Allowed: {money(selectedProduct.minPrincipal)} – {money(selectedProduct.maxPrincipal)}
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
                    <label htmlFor="applicationPurpose" className="form-label">Purpose of loan</label>
                    <textarea
                      id="applicationPurpose"
                      className="form-control"
                      rows="3"
                      maxLength={1000}
                      value={purpose}
                      onChange={(event) => setPurpose(event.target.value)}
                      placeholder="Explain briefly why you are applying for this loan."
                      required
                      disabled={applicationBusy}
                    />
                    <div className="form-text">Maximum 1,000 characters.</div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary mt-4"
                  disabled={
                    applicationBusy ||
                    accountsLoading ||
                    !selectedProduct ||
                    !applicationAccountId ||
                    !purpose.trim()
                  }
                >
                  {applicationBusy ? "Creating draft…" : "Create Application Draft"}
                </button>
              </form>

              {application && (
                <div className="border rounded-3 p-3 mt-4">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <h3 className="h6 fw-bold mb-0">Application review</h3>
                    <span className="badge text-bg-secondary">
                      {String(application.status || "DRAFT").replaceAll("_", " ")}
                    </span>
                  </div>
                  <dl className="row mt-3 mb-0">
                    <dt className="col-sm-4">Application ID</dt>
                    <dd className="col-sm-8">{application.id}</dd>
                    <dt className="col-sm-4">Product</dt>
                    <dd className="col-sm-8">{application.productName || selectedProduct?.name || "Selected product"}</dd>
                    <dt className="col-sm-4">Requested amount</dt>
                    <dd className="col-sm-8">{money(application.principal ?? principal)}</dd>
                    <dt className="col-sm-4">Tenure</dt>
                    <dd className="col-sm-8">{application.months ?? months} months</dd>
                    <dt className="col-sm-4">Purpose</dt>
                    <dd className="col-sm-8">{application.purpose || purpose}</dd>
                  </dl>

                  {String(application.status || "DRAFT").toUpperCase() === "DRAFT" ? (
                    <>
                      <p className="small text-secondary mt-2">
                        Submitting sends this application to the bank's review process. It does not guarantee approval or disbursement.
                      </p>
                      <button
                        type="button"
                        className="btn btn-success"
                        onClick={submitDraftApplication}
                        disabled={applicationBusy}
                      >
                        {applicationBusy ? "Submitting…" : "Submit Application for Review"}
                      </button>
                    </>
                  ) : (
                    <p className="small text-secondary mt-3 mb-0">
                      This application is no longer a draft. Check its status with the bank's application workflow.
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
          <section className="card border-0 shadow-sm mt-4" aria-labelledby="application-history-heading">
            <div className="card-body p-4">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <div>
                  <h2 id="application-history-heading" className="h4 fw-bold mb-1">My Loan Applications</h2>
                  <p className="text-secondary small mb-0">Track your applications and their current status.</p>
                </div>
                <button type="button" className="btn btn-outline-primary btn-sm"
                  onClick={() => loadApplicationHistory(historyPage)} disabled={historyLoading}>
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
                        <th>Product</th>
                        <th>Amount</th>
                        <th>Tenure</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applicationHistory.map((item) => {
                        const status = String(item.status || "UNKNOWN").toUpperCase();
                        const badgeClass = status === "APPROVED"
                          ? "text-bg-success"
                          : status === "REJECTED"
                            ? "text-bg-danger"
                            : status === "DRAFT"
                              ? "text-bg-secondary"
                              : "text-bg-primary";
                        const dateValue = item.submittedAt || item.createdAt;
                        return (
                          <tr key={item.id}>
                            <td>#{item.id}</td>
                            <td>{item.productName || "Loan product"}</td>
                            <td>{money(item.principal)}</td>
                            <td>{item.months} months</td>
                            <td><span className={`badge ${badgeClass}`}>{status.replaceAll("_", " ")}</span></td>
                            <td>{dateValue ? new Date(dateValue).toLocaleDateString() : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="d-flex justify-content-between align-items-center mt-3">
                <button type="button" className="btn btn-outline-secondary btn-sm"
                  onClick={() => loadApplicationHistory(historyPage - 1)}
                  disabled={historyLoading || historyPage <= 0}>
                  Previous
                </button>
                <span className="small text-secondary">
                  Page {historyPage + 1}{historyTotalPages > 0 ? ` of ${historyTotalPages}` : ""}
                </span>
                <button type="button" className="btn btn-outline-secondary btn-sm"
                  onClick={() => loadApplicationHistory(historyPage + 1)}
                  disabled={historyLoading || (historyTotalPages > 0 && historyPage + 1 >= historyTotalPages) || applicationHistory.length < 5}>
                  Next
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}



