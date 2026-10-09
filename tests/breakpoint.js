// BREAKPOINT (CAPACITY) TEST: raise the request rate steadily until the system breaks.
// Question it answers: "how many iterations per second can we sustain before the SLO is lost?"
// Uses an open model (arrival rate), so load keeps rising even when responses slow down.
// The run stops itself as soon as p95 latency exceeds 1.5 s or errors exceed 5 %; the arrival
// rate reached at that moment (Grafana: k6 request rate) is the capacity of this setup.
// Read-heavy mix, no think time, to find the limit quickly. Raise the ceiling with -e MAX_RATE=800.
import { setupPool, pick } from './lib/pool.js';
import { browse, moveMoney } from './lib/journeys.js';

const MAX_RATE = Number(__ENV.MAX_RATE || 400);

export const options = {
  setupTimeout: '180s',
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 1000,
      stages: [{ duration: '10m', target: MAX_RATE }],
    },
  },
  thresholds: {
    'http_req_duration{phase:steady}': [{ threshold: 'p(95)<1500', abortOnFail: true, delayAbortEval: '30s' }],
    'http_req_failed{phase:steady}': [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }],
    dropped_iterations: [{ threshold: 'count<1000', abortOnFail: true }],  // k6 itself can no longer keep up
  },
};

export const setup = () => setupPool();

export default (pool) => {
  const s = pick(pool);
  if (Math.random() < 0.8) browse(s);
  else moveMoney(s);
};
