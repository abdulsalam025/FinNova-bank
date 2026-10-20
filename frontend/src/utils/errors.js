// Turns an Axios error into { message, status, fieldErrors } for display.
// The backend sends: timestamp, status, error, message, path, fieldErrors[].
export function describeError(error, fallback = "Something went wrong. Please try again.") {
  if (!error || !error.response) {
    const timedOut = error && error.code === "ECONNABORTED";
    return {
      message: timedOut
        ? "The server took too long to respond. Please try again."
        : "Cannot reach the server. Check that the backend is running.",
      status: 0,
      fieldErrors: {},
    };
  }

  const status = error.response.status;
  const data = error.response.data && typeof error.response.data === "object" ? error.response.data : {};
  const fieldErrors = {};
  const raw = data.fieldErrors;

  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      const field = item && (item.field || item.name);
      const text = item && (item.message || item.defaultMessage);
      if (field && text && !fieldErrors[field]) fieldErrors[field] = String(text);
    });
  } else if (raw && typeof raw === "object") {
    Object.entries(raw).forEach(([field, text]) => {
      fieldErrors[field] = Array.isArray(text) ? String(text[0]) : String(text);
    });
  }

  let message = typeof data.message === "string" && data.message ? data.message : fallback;
  if (status === 429) message = "Too many attempts. Please wait a minute and try again.";

  return { message, status, fieldErrors };
}
