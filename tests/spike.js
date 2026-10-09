// SPIKE TEST: a sudden burst, then back to normal.
// Question it answers: "does the system survive a flash crowd and return to normal afterwards?"
// Shape: 10 VUs, jump to 200 in 20 s, hold 1 minute, drop to 10, watch 3 minutes of recovery.
// In Grafana compare latency/errors in the last phase with the first one: they should match.
import { setupPool } from './lib/pool.js';
import { mixedIteration } from './lib/journeys.js';
import { thresholds, vus } from './lib/config.js';

export const options = {
  setupTimeout: '180s',
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: vus(10),
      stages: [
        { duration: '1m', target: vus(10) },    // baseline
        { duration: '20s', target: vus(200) },  // spike
        { duration: '1m', target: vus(200) },   // hold the peak
        { duration: '20s', target: vus(10) },   // drop
        { duration: '3m', target: vus(10) },    // recovery
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: thresholds({ p95: 3000, p99: 6000, failed: 0.10 }),
};

export const setup = () => setupPool();
export default (pool) => mixedIteration(pool);
