import { clearCsrf, http, refreshCsrf } from "./http.js";

export async function getProfile() {
  const { data } = await http.get("/profile");
  return data;
}

export async function login(credentials) {
  await refreshCsrf();
  const { data } = await http.post("/auth/login", credentials);
  clearCsrf();
  await refreshCsrf();
  return data;
}

export async function register(details) {
  await refreshCsrf();
  const { data } = await http.post("/auth/register", details);
  return data;
}

export async function logout() {
  try {
    await http.post("/auth/logout");
  } finally {
    clearCsrf();
  }
}

export async function changePassword(details) {
  try {
    return await http.post("/auth/password", details);
  } finally {
    clearCsrf();
  }
}

export async function updateProfile(details) {
  const { data } = await http.patch("/profile", details);
  return data;
}
