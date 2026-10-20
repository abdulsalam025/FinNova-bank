import { http } from "./http.js";

export async function listAccounts(params = {}) {
  const { data } = await http.get("/accounts", { params });
  return data;
}

export async function openAccount(details) {
  const { data } = await http.post("/accounts", details);
  return data;
}

export async function renameAccount(id, details) {
  const { data } = await http.patch(`/accounts/${id}`, details);
  return data;
}

export async function closeAccount(id) {
  const { data } = await http.post(`/accounts/${id}/close`);
  return data;
}
