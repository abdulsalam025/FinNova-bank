import { http } from "./http.js";

export async function listLoanProducts(params = {}) {
  const { data } = await http.get("/loan-products", { params });
  return data;
}

export async function getLoanProduct(id) {
  const { data } = await http.get(`/loan-products/${id}`);
  return data;
}

export async function getLoanQuote(id, principal, months, annualRate) {
  const params = { principal, months };

  if (annualRate !== "" && annualRate != null) {
    params.annualRate = annualRate;
  }

  const { data } = await http.get(`/loan-products/${id}/quote`, { params });
  return data;
}

export async function compareLoanProducts(ids, principal, months) {
  const { data } = await http.get("/loan-products/compare", {
    params: { ids, principal, months },
    paramsSerializer: {
      serialize: (params) => {
        const search = new URLSearchParams();
        params.ids.forEach((id) => search.append("ids", id));
        search.set("principal", params.principal);
        search.set("months", params.months);
        return search.toString();
      },
    },
  });
  return data;
}

export async function listLoanApplications(params = {}) {
  const { data } = await http.get("/loan-applications", { params });
  return data;
}

export async function createLoanApplication(details) {
  const { data } = await http.post("/loan-applications", details);
  return data;
}

export async function submitLoanApplication(id) {
  const { data } = await http.post(`/loan-applications/${id}/submit`);
  return data;
}

export async function listMyLoans(params = {}) {
  const { data } = await http.get("/loans", { params });
  return data;
}
