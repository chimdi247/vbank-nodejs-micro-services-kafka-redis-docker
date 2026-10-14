// LOAD TEST: expected everyday traffic, held long enough to reach a steady state.
// Question it answers: "does the system meet its SLOs under the load we expect?"
// Default: ramp to 20 VUs, hold 5 minutes. Scale with -e VU_SCALE=2.
import { setupPool } from './lib/pool.js';
import { mixedIteration } from './lib/journeys.js';
import { thresholds, vus } from './lib/config.js';

export const options = {
  setupTimeout: '180s',
  scenarios: {
    expected_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: vus(20) },  // ramp up
        { duration: '5m', target: vus(20) },  // steady state
        { duration: '30s', target: 0 },       // ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  // the same numbers as the Grafana SLOs: p95 < 500 ms is the target, 800 ms the failure line
  thresholds: thresholds({ p95: 800, p99: 1500, failed: 0.01, extra: { transfer_as_expected: ['rate>0.99'] } }),
};

export const setup = () => setupPool();
export default (pool) => mixedIteration(pool);
