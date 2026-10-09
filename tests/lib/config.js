// Shared settings for every k6 script. Override any of them with `-e NAME=value`.

// Where the traffic goes. Point it at the API gateway (default) or at the web app
// (http://localhost:5173) to include nginx in the measurement: both serve /api/v1.
export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const API = `${BASE_URL}/api/v1`;

// Direct service URLs, used only by the smoke test's health checks.
export const DIRECT = {
  'auth-service': __ENV.AUTH_URL || 'http://localhost:3001',
  'account-service': __ENV.ACCOUNT_URL || 'http://localhost:3002',
  'transaction-service': __ENV.TRANSACTION_URL || 'http://localhost:3003',
  'mock-central-bank-service': __ENV.CENTRAL_BANK_URL || 'http://localhost:5010',
};
export const CHECK_DIRECT = (__ENV.CHECK_DIRECT || 'true') !== 'false';

export const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@example.com';
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'password123';

// Test users are created with this prefix so they can be removed again (tests/cleanup.sh).
export const RUN_ID = __ENV.RUN_ID || Date.now().toString(36);
export const USER_DOMAIN = 'loadtest.local';
export const PASSWORD = 'Perf-Passw0rd!';

// Users created once in setup() and shared by all virtual users.
export const POOL_SIZE = Number(__ENV.POOL_SIZE || 20);
// Share of money transfers whose completion is followed to the end (polling costs extra requests).
export const POLL_SAMPLE = Number(__ENV.POLL_SAMPLE || 0.1);
// Average pause between user actions, seconds.
export const THINK_TIME = Number(__ENV.THINK_TIME || 1);
// How long to wait for a transfer to reach completed / failed.
export const SETTLE_TIMEOUT_S = Number(__ENV.SETTLE_TIMEOUT_S || 30);

// Only requests tagged phase=steady count towards thresholds; user provisioning in setup() is excluded.
export function thresholds({ p95 = 800, p99 = 1500, failed = 0.01, extra = {} } = {}) {
  return Object.assign(
    {
      'http_req_failed{phase:steady}': [`rate<${failed}`],
      'http_req_duration{phase:steady}': [`p(95)<${p95}`, `p(99)<${p99}`],
      checks: ['rate>0.98'],
    },
    extra,
  );
}

// Scales a number of virtual users by the optional -e VU_SCALE=2 factor.
export const VU_SCALE = Number(__ENV.VU_SCALE || 1);
export const vus = (n) => Math.max(1, Math.round(n * VU_SCALE));
