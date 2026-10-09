# Performance tests

[k6](https://k6.io) scripts that exercise VBank through the API gateway. They run inside Docker (nothing to install) and stream their metrics into Prometheus, so you watch them live in Grafana next to CPU, memory, Kafka lag and traces.

```bash
./tests/run.sh smoke            # 1 minute: does everything work?
./tests/run.sh load             # 6.5 minutes: expected traffic
./tests/run.sh saga-latency     # 3 minutes: how long does a transfer really take?
./tests/run.sh all              # smoke -> load -> saga-latency

./tests/cleanup.sh              # delete the users/accounts/transactions the tests created
```

Open **Grafana -> VBank -> "VBank k6 Load Tests"** (http://localhost:3030) while a test runs. Summaries are written to `tests/results/`.

`run.sh` starts the stack if needed, lifts the gateway's rate limit for the run (2000 requests / 15 min per IP would otherwise make every load test a rate-limit test) and puts it back afterwards (`KEEP_RATE_LIMIT=1` keeps it lifted).

## The tests

| Script | Type | Shape | Question it answers |
| --- | --- | --- | --- |
| `smoke.js` | Smoke | 1 user, 1 pass | Is everything up and does every flow work? Health of all services, seeded admin login, register/login/logout, accounts, internal transfer, insufficient funds, other-bank transfer accepted and declined (with reversal). Every check must pass. Run it first, and after every deploy. |
| `load.js` | Load | ramp to 20 VUs, hold 5 min | Does the system meet its SLOs under expected traffic? Mixed traffic: 60 % browsing, 30 % internal transfers, 5 % logins, 5 % other-bank transfers. |
| `stress.js` | Stress | 20 -> 60 -> 100 -> 150 VUs, 3 min steps | How does it behave beyond expected capacity, which component saturates first, and does it recover? Loose thresholds: you are looking at the curves. |
| `spike.js` | Spike | 10 -> 200 VUs in 20 s, hold 1 min, back to 10 | Does it survive a flash crowd and return to normal? Compare the last (recovery) minutes with the first. |
| `soak.js` | Soak / endurance | 10 VUs for 30 min (`-e DURATION=4h`) | Does anything leak or degrade over time: memory, DB connections, Kafka lag, disk? |
| `breakpoint.js` | Capacity | arrival rate rising to 400 iterations/s over 10 min | How much can we sustain? The run aborts itself when p95 > 1.5 s or errors > 5 %; the rate reached then is your capacity. |
| `saga-latency.js` | End-to-end latency | 5 internal + 1 other-bank transfers per second, 3 min | How long from "transfer accepted" to "completed" through Kafka? Metric `transfer_settle_time`. Best test for the event pipeline. |

Pass options to a test after its name: `./tests/run.sh load -e VU_SCALE=2`, `./tests/run.sh soak -e DURATION=2h -e SOAK_VUS=20`, `./tests/run.sh breakpoint -e MAX_RATE=800`.

## Settings (`-e NAME=value`)

| Name | Default | Meaning |
| --- | --- | --- |
| `BASE_URL` | gateway | Target. Use `http://frontend` (or `http://localhost:5173` outside Docker) to include nginx. |
| `VU_SCALE` | 1 | Multiplies every VU count of load, stress, spike, soak |
| `POOL_SIZE` | 20 | Test customers created in `setup()` and shared by the VUs |
| `POLL_SAMPLE` | 0.1 | Share of transfers followed until completion in the mixed tests |
| `THINK_TIME` | 1 | Average pause between actions (seconds) |
| `SETTLE_TIMEOUT_S` | 30 | How long to wait for a transfer to complete |
| `DURATION` | per test | soak, saga-latency |
| `RATE` | 5 | internal transfers per second in saga-latency |
| `MAX_RATE` | 400 | arrival-rate ceiling for breakpoint |
| `CHECK_DIRECT` | true | smoke: also probe each service's own `/health` |

## Pass / fail criteria

Thresholds are in each script and mirror the SLOs on the Grafana dashboard. For `load` and `soak`: p95 < 800 ms (target 500 ms), p99 < 1.5 s, < 1 % failed requests, > 98 % checks, > 99 % of followed transfers ending as expected. k6 exits non-zero when a threshold fails, so the scripts also work in CI (`./tests/run.sh smoke` as a deploy gate). Only measured traffic counts: requests that create the test users in `setup()` are tagged `phase=provision` and excluded.

## Reading the results

- **Latency rises before errors do.** Find the load level where p95 starts climbing, then look at the "What the system did meanwhile" row: the first container to hit its CPU limit (they are capped at 0.5 CPU in `docker-compose.yml`) is the bottleneck. Login (bcrypt) is the most CPU-hungry call.
- **Kafka lag growing while HTTP stays fast** means transfers are accepted faster than the services settle them: `saga-latency` will show it as a rising `transfer_settle_time`.
- **Remove the CPU/memory limits** in `docker-compose.yml` (`deploy:`) to measure the application instead of the limits.
- Transfers that end `failed` with "insufficient balance" or timeouts under heavy concurrency can be real findings: the account service updates balances without row locking, so concurrent operations on the same account can overwrite each other.

## Running without Docker

Install k6 and point it at a running stack:

```bash
k6 run tests/smoke.js
k6 run -e BASE_URL=http://localhost:3000 tests/load.js
k6 run -o experimental-prometheus-rw -e K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write --tag testid=load tests/load.js
```

(The gateway rate limit still applies: start it with `RATE_LIMIT_MAX_REQUESTS=100000000 docker compose up -d api-gateway`.)

## Layout

```
tests/
  run.sh, cleanup.sh, cleanup-perf-data.sql
  smoke.js  load.js  stress.js  spike.js  soak.js  breakpoint.js  saga-latency.js
  lib/  config.js (settings, thresholds)   api.js (one function per endpoint)
        pool.js (test customers)           journeys.js (user behaviour, custom metrics)
  results/  summaries of each run (git-ignored)
```
