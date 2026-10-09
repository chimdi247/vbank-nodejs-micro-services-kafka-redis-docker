import type { Account, AccountType, Transaction, TransactionPage, TransactionStatus } from "./types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api/v1";
const TOKEN_KEY = "vbank.token";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | null = null;
export const onUnauthorized = (fn: () => void) => {
  unauthorizedHandler = fn;
};

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  auth?: boolean;
}

async function request<T>(path: string, { method = "GET", body, query, auth = true }: RequestOptions = {}): Promise<T> {
  const qs = query
    ? "?" +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = tokenStore.get();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (auth && res.status === 401) unauthorizedHandler?.();
    // zod validation errors come back as { message: "Invalid input", errors: [{ path, message }] }
    const detail = Array.isArray(data?.errors) && data.errors[0]
      ? `${data.errors[0].path?.join(".") ?? ""} ${data.errors[0].message}`.trim()
      : null;
    const message = detail ?? data?.message ?? data?.error ?? `Request failed (${res.status})`;
    throw new ApiError(String(message), res.status);
  }

  return data as T;
}

// ---- auth -------------------------------------------------------------------
export const login = (email: string, password: string) =>
  request<{ token: string }>("/auth/login", { method: "POST", body: { email, password }, auth: false });

export const register = (input: { firstName: string; lastName: string; email: string; password: string }) =>
  request<{ id: number; email: string }>("/auth/register", { method: "POST", body: input, auth: false });

export const logout = () => request<{ message: string }>("/auth/logout", { method: "POST" });

// ---- accounts ---------------------------------------------------------------
export const listAccounts = () => request<Account[]>("/accounts");

export const createAccount = (input: { accountType: AccountType; accountName: string }) =>
  request<Account>("/accounts", { method: "POST", body: input });

export const deleteAccount = (accountNumber: string) =>
  request<{ message: string }>(`/accounts/${accountNumber}`, { method: "DELETE" });

/** Sandbox funding: credits an account the caller owns. */
export const depositToAccount = (accountNumber: string, amount: number) =>
  request<{ availableBalance: number }>("/accounts/internal/transaction", {
    method: "POST",
    body: { accountNumber, amount, type: "credit" },
  });

// ---- transactions -----------------------------------------------------------
export interface TransactionFilters {
  limit?: number;
  offset?: number;
  accountNumber?: string;
  status?: TransactionStatus;
}

export const listTransactions = (filters: TransactionFilters = {}) =>
  request<TransactionPage>("/transactions", { query: { ...filters } });

export const getTransaction = (transactionId: string) => request<Transaction>(`/transactions/${transactionId}`);

export interface TransferInput {
  sourceAccountNumber: string;
  destinationAccountNumber: string;
  amount: number;
  note?: string;
}

export const transfer = (input: TransferInput) =>
  request<{ transactionId: string; status: TransactionStatus }>("/transactions/transfer", { method: "POST", body: input });

export const transferExternal = (input: TransferInput & { sourceBankCode: string; destinationBankCode: string }) =>
  request<{ transactionId: string; status: TransactionStatus; referenceId: string }>(
    "/transactions/transfer/external/outbound",
    { method: "POST", body: input },
  );
