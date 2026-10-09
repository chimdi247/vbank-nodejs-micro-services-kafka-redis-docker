// SOAK (ENDURANCE) TEST: moderate load for a long time.
// Question it answers: "does anything leak or degrade over hours: memory, connections, Kafka lag, disk?"
// Default: 10 VUs for 30 minutes. Use -e DURATION=4h for a real soak.
// Watch in Grafana: container memory trend, Postgres connections, Kafka consumer lag, p95 over time.
import { setupPool } from './lib/pool.js';
import { mixedIteration } from './lib/journeys.js';
import { thresholds, vus } from './lib/config.js';

export const options = {
  setupTimeout: '180s',
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: vus(Number(__ENV.SOAK_VUS || 10)),
      duration: __ENV.DURATION || '30m',
      gracefulStop: '30s',
    },
  },
  thresholds: thresholds({ p95: 800, p99: 1500, failed: 0.01, extra: { transfer_as_expected: ['rate>0.99'] } }),
};

export const setup = () => setupPool();
export default (pool) => mixedIteration(pool);
