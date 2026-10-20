// Client-side checks give quick feedback only. The backend is the authority
// and its validation messages are shown whenever it rejects a request.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value) {
  const text = (value || "").trim();
  if (!text) return "Email is required.";
  if (text.length > 254) return "Email must be at most 254 characters.";
  if (!EMAIL_PATTERN.test(text)) return "Enter a valid email address.";
  return "";
}

export function validateFullName(value) {
  const text = (value || "").trim();
  if (!text) return "Full name is required.";
  if (text.length < 2 || text.length > 100) return "Full name must be 2 to 100 characters.";
  return "";
}

export function validateNewPassword(value) {
  if (!value) return "Password is required.";
  if (value.length < 8) return "Use at least 8 characters.";
  if (value.length > 72) return "Password must be at most 72 characters.";
  return "";
}

export function validateDateOfBirth(value) {
  if (!value) return "Date of birth is required.";
  const entered = new Date(value + "T00:00:00");
  if (Number.isNaN(entered.getTime())) return "Enter a valid date.";
  if (entered >= new Date()) return "Date of birth must be in the past.";
  return "";
}

export function validateMoney(value) {
  const text = (value || "").trim();
  if (!text) return "Monthly income is required.";
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(text)) return "Enter an amount such as 50000 or 50000.50.";
  return "";
}

export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}
