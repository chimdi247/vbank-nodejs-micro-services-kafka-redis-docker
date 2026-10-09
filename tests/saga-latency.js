// SAGA LATENCY TEST: end-to-end time of a money transfer.
// A transfer is accepted with HTTP 201 almost instantly, but really finishes later, after the
// debit/credit events have travelled through Kafka between the transaction and account services.
// This test measures that "accepted -> completed" time (metric transfer_settle_time) at a constant
// transfer rate. It is the best test for Kafka, consumer and database health.
//
//   internal transfers: 5 per second   (override with -e RATE=10)
//   other-bank transfers: 1 per second (the mock bank adds a 1-5 s processing delay on purpose)
import { setupPool, pick } from './lib/pool.js';
import { externalTransfer, moveMoney } from './lib/journeys.js';

export const options = {
  setupTimeout: '180s',
  scenarios: {
    internal: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 5),
      timeUnit: '1s',
      duration: __ENV.DURATION || '3m',
      preAllocatedVUs: 30,
      maxVUs: 300,
      exec: 'internalTransfer',
    },
    external: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1s',
      duration: __ENV.DURATION || '3m',
      preAllocatedVUs: 20,
      maxVUs: 200,
      exec: 'otherBankTransfer',
    },
  },
  thresholds: {
    'transfer_settle_time{kind:internal}': ['p(95)<3000', 'p(99)<6000'],
    'transfer_settle_time{kind:external}': ['p(95)<9000'],
    transfer_as_expected: ['rate>0.99'],
    transfers_timed_out: ['count==0'],
    'http_req_failed{phase:steady}': ['rate<0.02'],
  },
};

export const setup = () => setupPool();

export function internalTransfer(pool) {
  moveMoney(pick(pool), { poll: true });
}

export function otherBankTransfer(pool) {
  externalTransfer(pick(pool), 200, { poll: true });
}
