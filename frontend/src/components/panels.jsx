/* Safe message for users: 5xx/network failures never expose raw exception text. */
export function friendlyError(error, fallback) {
  if (!error?.response) {
    return error?.code === "ECONNABORTED"
      ? "The server took too long to respond."
      : "Cannot reach the server. Check that the backend is running.";
  }
  const status = error.response.status;
  if (status === 401) return "Your session has ended. Sign in again.";
  if (status === 403) return "You do not have permission to view this.";
  if (status === 429) return "Too many requests. Wait a moment and retry.";
  if (status >= 500) return fallback;
  const message = error.response.data?.message;
  return typeof message === "string" && message ? message : fallback;
}

export function pageInfo(data, size) {
  const items = data?.items ?? [];
  const page = Number(data?.page ?? 0);
  const total = data?.totalElements ?? data?.total ?? null;
  const totalPages = data?.totalPages ?? (total !== null ? Math.ceil(total / size) : null);
  const hasNext = totalPages !== null ? page + 1 < totalPages : items.length === size;
  return { items, page, total, totalPages, hasNext, hasPrev: page > 0 };
}

export function ErrorBlock({ message, onRetry }) {
  return (
    <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2 mb-0" role="alert">
      <span>{message}</span>
      <button type="button" className="btn btn-sm btn-outline-dark" onClick={onRetry}>Retry</button>
    </div>
  );
}

export function Loading({ label }) {
  return (
    <p className="text-body-secondary mb-0" role="status">
      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
      {label}
    </p>
  );
}

export function Pager({ info, onPage, label }) {
  if (!info.hasPrev && !info.hasNext) return null;
  const position = info.totalPages !== null ? `Page ${info.page + 1} of ${info.totalPages}` : `Page ${info.page + 1}`;
  return (
    <nav className="d-flex align-items-center justify-content-between gap-2 mt-3" aria-label={label}>
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!info.hasPrev} onClick={() => onPage(info.page - 1)}>Previous</button>
      <span className="small text-body-secondary">{position}</span>
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!info.hasNext} onClick={() => onPage(info.page + 1)}>Next</button>
    </nav>
  );
}