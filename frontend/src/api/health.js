import { http } from "./http.js";

export async function getHealth(signal) {
  const response = await http.get("/health", { signal });
  return response.data;
}
