import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { PASSWORD, POLL_SAMPLE, SETTLE_TIMEOUT_S, THINK_TIME } from './config.js';
import {
  getAccount,
  getTransaction,
  listAccounts,
  listTransactions,
  login,
  transfer,
  transferExternal,
} from './api.js';
import { pick } from './pool.js';

// ---- custom metrics ----------------------------------------------------------------
// Time from "transfer accepted" (HTTP 201) until the saga over Kafka reaches completed/failed.
export const transferSettleTime = new Trend('transfer_settle_time', true);
export const transfersCompleted = new Counter('transfers_completed');
export const transfersFailed = new Counter('transfers_failed');
export const transfersTimedOut = new Counter('transfers_timed_out');
// share of followed transfers that ended as expected (completed, or failed when a failure was expected)
export const transferAsExpected = new Rate('transfer_as_expected');

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const think = () => sleep(Math.max(0.1, THINK_TIME * (0.5 + Math.random())));

/** Polls a transaction until it is completed or failed. Returns the final status or 'timeout'. */
export function waitForSettlement(token, transactionId, kind, expected = 'completed') {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < SETTLE_TIMEOUT_S) {
    const res = getTransaction(token, transactionId);
    if (res.status === 200) {
      const status = res.json('status');
      if (status === 'completed' || status === 'failed') {
        transferSettleTime.add(Date.now() - start, { kind });
        (status === 'completed' ? transfersCompleted : transfersFailed).add(1, { kind });
        transferAsExpected.add(status === expected, { kind });
        return status;
      }
    }
    sleep(0.5);
  }
  transfersTimedOut.add(1, { kind });
  transferAsExpected.add(false, { kind });
  return 'timeout';
}

// ---- user actions --------------------------------------------------------------------

/** What a customer does when opening the app: balances, recent activity, one account. */
export function browse(s) {
  const accounts = listAccounts(s.token);
  check(accounts, { 'list accounts (200)': (r) => r.status === 200 });

  const txs = listTransactions(s.token, 'limit=10');
  check(txs, { 'list transactions (200)': (r) => r.status === 200 });

  const acc = getAccount(s.token, s.accounts[0]);
  check(acc, { 'get account (200)': (r) => r.status === 200 });
}

/** Internal transfer between the user's own two accounts; direction alternates randomly so balances stay level. */
export function moveMoney(s, { poll = false } = {}) {
  const [from, to] = Math.random() < 0.5 ? [s.accounts[0], s.accounts[1]] : [s.accounts[1], s.accounts[0]];
  const res = transfer(s.token, from, to, randomInt(1, 50));
  const accepted = check(res, { 'transfer accepted (201)': (r) => r.status === 201 });
  if (accepted && poll) waitForSettlement(s.token, res.json('transactionId'), 'internal');
  return res;
}

/**
 * Transfer to the mock central bank. The partner bank always accepts 200 and always declines 400
 * (see services/mock-central-bank-service), which makes the outcome predictable.
 */
export function externalTransfer(s, amount = 200, { poll = false } = {}) {
  const res = transferExternal(s.token, s.accounts[0], '998877665544332', amount);
  const accepted = check(res, { 'external transfer accepted (201)': (r) => r.status === 201 });
  if (accepted && poll) waitForSettlement(s.token, res.json('transactionId'), 'external', amount === 400 ? 'failed' : 'completed');
  return res;
}

/** Login is bcrypt-bound, so it is the most CPU-hungry call in the system. */
export function signIn(s) {
  const res = login(s.email, PASSWORD);
  check(res, { 'login (200)': (r) => r.status === 200 });
}

/** One iteration of realistic mixed traffic: 60 % browsing, 30 % internal transfers, 5 % logins, 5 % other-bank transfers. */
export function mixedIteration(pool) {
  const s = pick(pool);
  const roll = Math.random();
  if (roll < 0.6) browse(s);
  else if (roll < 0.9) moveMoney(s, { poll: Math.random() < POLL_SAMPLE });
  else if (roll < 0.95) signIn(s);
  else externalTransfer(s, 200, { poll: Math.random() < POLL_SAMPLE });
  think();
}
