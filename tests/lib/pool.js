import { check } from 'k6';
import { PASSWORD, POOL_SIZE, RUN_ID, USER_DOMAIN } from './config.js';
import { createAccount, deposit, login, register } from './api.js';

/**
 * Creates `size` customers, each with a savings and a current account holding money.
 * Runs once in setup(); the result is handed to every VU, so the measured traffic contains no
 * bcrypt-heavy registrations. Users are named perf-<run>-<n>@loadtest.local.
 */
export function setupPool(size = POOL_SIZE) {
  const pool = [];
  for (let i = 0; i < size; i++) {
    const email = `perf-${RUN_ID}-${i}@${USER_DOMAIN}`;

    const reg = register({ firstName: 'Perf', lastName: 'Tester', email, password: PASSWORD }, 'provision');
    if (!check(reg, { 'provision: user registered (201)': (r) => r.status === 201 })) {
      throw new Error(`Cannot register ${email}: HTTP ${reg.status} ${reg.body}. Is the stack up and is the gateway rate limit high enough?`);
    }

    const token = login(email, PASSWORD, 'provision').json('token');
    const accounts = [];
    for (const [type, name] of [['savings', 'Perf savings'], ['current', 'Perf current']]) {
      const res = createAccount(token, type, name, 'provision');
      check(res, { 'provision: account created (201)': (r) => r.status === 201 });
      const accountNumber = res.json('accountNumber');
      deposit(token, accountNumber, 100000, 'provision');
      accounts.push(accountNumber);
    }
    pool.push({ email, token, accounts });
  }
  return pool;
}

export const pick = (pool) => pool[Math.floor(Math.random() * pool.length)];
