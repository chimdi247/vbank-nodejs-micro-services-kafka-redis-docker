// STRESS TEST: push beyond normal load in steps and watch where behaviour degrades.
// Question it answers: "how does the system behave above its expected capacity, and does it recover?"
// Default: 20 -> 60 -> 100 -> 150 VUs in 3-minute steps, then ramp down. Thresholds are
// deliberately loose: the point is to see latency and errors rise in Grafana, not to pass.
import { setupPool } from './lib/pool.js';
import { mixedIteration } from './lib/journeys.js';
import { thresholds, vus } from './lib/config.js';

export const options = {
  setupTimeout: '180s',
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: vus(20) },
        { duration: '3m', target: vus(60) },
        { duration: '3m', target: vus(100) },
        { duration: '3m', target: vus(150) },
        { duration: '2m', target: 0 },       // recovery
      ],
      gracefulRampDown: '1m',
    },
  },
  thresholds: thresholds({ p95: 2500, p99: 5000, failed: 0.05 }),
};

export const setup = () => setupPool();
export default (pool) => mixedIteration(pool);
