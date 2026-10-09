// SMOKE TEST: one user, one pass through every feature.
// Question it answers: "is the system up and does every flow work at all?"
// Run it first, after every deploy, and before any heavier test.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import {
  ADMIN_EMAIL, ADMIN_PASSWORD, API, CHECK_DIRECT, DIRECT, PASSWORD, RUN_ID, USER_DOMAIN,
} from './lib/config.js';
import {
  createAccount, deposit, getAccount, getTransaction, health, listAccounts, listTransactions,
  login, logout, register, transfer, transferExternal,
} from './lib/api.js';
import { waitForSettlement } from './lib/journeys.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    // every functional check must pass; 4xx we provoke on purpose are declared as expected below
    checks: ['rate==1'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
};

const balanceOf = (token, accountNumber) => Number(getAccount(token, accountNumber).json('balance'));

export default function () {
  const email = `perf-${RUN_ID}-smoke@${USER_DOMAIN}`;
  let token;
  let savings;
  let current;

  group('1. health', () => {
    const gw = health();
    check(gw, { 'api-gateway /health (200)': (r) => r.status === 200 });
    if (CHECK_DIRECT) {
      for (const [name, url] of Object.entries(DIRECT)) {
        const r = health(url);
        check(r, { [`${name} /health (200)`]: (x) => x.status === 200 });
      }
    }
  });

  group('2. seeded admin can sign in', () => {
    const r = login(ADMIN_EMAIL, ADMIN_PASSWORD);
    check(r, {
      'admin login (200)': (x) => x.status === 200,
      'admin login returns a JWT': (x) => typeof x.json('token') === 'string',
    });
  });

  group('3. auth', () => {
    const reg = register({ firstName: 'Smoke', lastName: 'Tester', email, password: PASSWORD });
    check(reg, { 'register (201)': (r) => r.status === 201 });

    const dup = http.post(`${API}/auth/register`,
      JSON.stringify({ firstName: 'Smoke', lastName: 'Tester', email, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' }, responseCallback: http.expectedStatuses(400, 409), tags: { name: 'auth.register.duplicate' } });
    check(dup, { 'duplicate email is rejected (4xx)': (r) => r.status === 400 || r.status === 409 });

    const bad = login(email, 'wrong-password', 'steady', { responseCallback: http.expectedStatuses(400, 401) });
    check(bad, { 'wrong password is rejected': (r) => r.status === 400 || r.status === 401 });

    const ok = login(email, PASSWORD);
    check(ok, { 'login (200)': (r) => r.status === 200 });
    token = ok.json('token');

    const anon = listAccounts(null, { responseCallback: http.expectedStatuses(401, 403) });
    check(anon, { 'accounts without a token are refused': (r) => r.status === 401 || r.status === 403 });
  });

  group('4. accounts', () => {
    const a = createAccount(token, 'savings', 'Smoke savings');
    check(a, { 'create savings (201)': (r) => r.status === 201 });
    savings = a.json('accountNumber');

    const b = createAccount(token, 'current', 'Smoke current');
    check(b, { 'create current (201)': (r) => r.status === 201 });
    current = b.json('accountNumber');

    const again = createAccount(token, 'savings', 'Second savings', 'steady', { responseCallback: http.expectedStatuses(400, 409) });
    check(again, { 'second account of the same type is refused': (r) => r.status === 400 || r.status === 409 });

    check(deposit(token, savings, 1000), { 'deposit (200)': (r) => r.status === 200 });
    check(balanceOf(token, savings), { 'balance is 1000 after deposit': (v) => v === 1000 });

    const list = listAccounts(token);
    check(list, { 'list accounts (200)': (r) => r.status === 200, 'two accounts listed': (r) => r.json().length === 2 });
  });

  group('5. internal transfer', () => {
    const res = transfer(token, savings, current, 250, 'smoke internal');
    check(res, { 'transfer accepted (201)': (r) => r.status === 201 });
    const id = res.json('transactionId');
    check(waitForSettlement(token, id, 'internal'), { 'transfer completes': (s) => s === 'completed' });
    check(balanceOf(token, savings), { 'source debited (750)': (v) => v === 750 });
    check(balanceOf(token, current), { 'destination credited (250)': (v) => v === 250 });

    const tx = getTransaction(token, id);
    check(tx, { 'get transaction (200)': (r) => r.status === 200 });

    const list = listTransactions(token, 'limit=5');
    check(list, {
      'list transactions (200)': (r) => r.status === 200,
      'new transaction is listed': (r) => r.json('data').some((t) => t.transactionId === id),
    });
  });

  group('6. insufficient funds', () => {
    const res = transfer(token, savings, current, 999999, 'too much');
    check(res, { 'transfer accepted for processing (201)': (r) => r.status === 201 });
    check(waitForSettlement(token, res.json('transactionId'), 'internal', 'failed'), { 'transfer fails': (s) => s === 'failed' });
    check(balanceOf(token, savings), { 'balance unchanged (750)': (v) => v === 750 });
  });

  group('7. other-bank transfers (mock central bank)', () => {
    const ok = transferExternal(token, savings, '998877665544332', 200);
    check(ok, { 'external transfer accepted (201)': (r) => r.status === 201 });
    check(waitForSettlement(token, ok.json('transactionId'), 'external'), { 'bank accepts 200: completed': (s) => s === 'completed' });
    check(balanceOf(token, savings), { 'debited 200 (550)': (v) => v === 550 });

    const declined = transferExternal(token, savings, '998877665544332', 400);
    check(declined, { 'external transfer accepted (201)': (r) => r.status === 201 });
    check(waitForSettlement(token, declined.json('transactionId'), 'external', 'failed'), { 'bank declines 400: failed': (s) => s === 'failed' });
    // the saga returns the money after a decline; give the compensation a moment
    let restored = false;
    for (let i = 0; i < 20 && !restored; i++) {
      restored = balanceOf(token, savings) === 550;
      if (!restored) sleep(0.5);
    }
    check(restored, { 'declined transfer is reversed (550)': (v) => v === true });
  });

  group('8. sign out', () => {
    check(logout(token), { 'logout (200)': (r) => r.status === 200 });
    const after = listAccounts(token, { responseCallback: http.expectedStatuses(401, 403) });
    check(after, { 'token no longer works': (r) => r.status === 401 || r.status === 403 });
  });
}
