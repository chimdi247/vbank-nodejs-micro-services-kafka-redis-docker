import http from 'k6/http';
import { API, BASE_URL } from './config.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// `name` groups URLs with ids into one metric series; `phase` separates provisioning from the measured traffic.
function params(name, token, phase, extra) {
  const headers = Object.assign({}, JSON_HEADERS);
  if (token) headers.Authorization = `Bearer ${token}`;
  return Object.assign({ headers, tags: { name, phase } }, extra || {});
}

const body = (o) => JSON.stringify(o);

// ---- health ---------------------------------------------------------------------
export const health = (url = BASE_URL) => http.get(`${url}/health`, { tags: { name: 'health', phase: 'steady' } });

// ---- auth -----------------------------------------------------------------------
export const register = (user, phase = 'steady') =>
  http.post(`${API}/auth/register`, body(user), params('auth.register', null, phase));

export const login = (email, password, phase = 'steady', extra) =>
  http.post(`${API}/auth/login`, body({ email, password }), params('auth.login', null, phase, extra));

export const logout = (token) => http.post(`${API}/auth/logout`, null, params('auth.logout', token, 'steady'));

// ---- accounts -------------------------------------------------------------------
export const createAccount = (token, accountType, accountName, phase = 'steady', extra) =>
  http.post(`${API}/accounts`, body({ accountType, accountName }), params('accounts.create', token, phase, extra));

export const listAccounts = (token, extra) => http.get(`${API}/accounts`, params('accounts.list', token, 'steady', extra));

export const getAccount = (token, accountNumber) =>
  http.get(`${API}/accounts/${accountNumber}`, params('accounts.get', token, 'steady'));

export const deposit = (token, accountNumber, amount, phase = 'steady') =>
  http.post(
    `${API}/accounts/internal/transaction`,
    body({ accountNumber, amount, type: 'credit' }),
    params('accounts.deposit', token, phase),
  );

// ---- transactions ---------------------------------------------------------------
export const listTransactions = (token, query = 'limit=10') =>
  http.get(`${API}/transactions?${query}`, params('transactions.list', token, 'steady'));

export const getTransaction = (token, transactionId) =>
  http.get(`${API}/transactions/${transactionId}`, params('transactions.get', token, 'steady'));

export const transfer = (token, sourceAccountNumber, destinationAccountNumber, amount, note = 'k6') =>
  http.post(
    `${API}/transactions/transfer`,
    body({ sourceAccountNumber, destinationAccountNumber, amount, note }),
    params('transactions.transfer', token, 'steady'),
  );

export const transferExternal = (token, sourceAccountNumber, destinationAccountNumber, amount, bank = 'SBANK') =>
  http.post(
    `${API}/transactions/transfer/external/outbound`,
    body({
      sourceAccountNumber,
      destinationAccountNumber,
      amount,
      note: 'k6 external',
      sourceBankCode: 'VBANK',
      destinationBankCode: bank,
    }),
    params('transactions.transfer_external', token, 'steady'),
  );
