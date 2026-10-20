import { http } from "./http.js";

export async function listTransactions(params = {}) {
  const { data } = await http.get("/transactions", { params });
  return data;
}
