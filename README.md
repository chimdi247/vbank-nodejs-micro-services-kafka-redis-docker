# VBANK - Microservices Masterclass

A banking application built with a microservices architecture: React frontend -> API gateway -> auth / account / transaction services, talking over Kafka, Redis and PostgreSQL, fully observable through OpenTelemetry and Grafana.

## Run everything

```bash
docker compose up -d --build
```

First build takes a few minutes. Then open:

| What                       | URL                     | Login                                      |
| -------------------------- | ----------------------- | ------------------------------------------ |
| **VBank app**              | http://localhost:5173   | `admin@example.com` / `password123`        |
| API gateway                | http://localhost:3000   | -                                          |
| Kafka UI                   | http://localhost:8080   | -                                          |
| Redis UI                   | http://localhost:8081   | -                                          |
| **Grafana**                | http://localhost:3030   | `admin` / `admin` -> folder **VBank**      |
| Prometheus                 | http://localhost:9090   | -                                          |
| Alertmanager               | http://localhost:9093   | -                                          |
| Mailpit (alert e-mail inbox) | http://localhost:8025 | -                                          |
| cAdvisor                   | http://localhost:8082   | -                                          |

Stop: `docker compose down`. Stop **and wipe** all data (databases, metrics, logs, traces; the SQL init scripts run again next start): `docker compose down -v`.

## Request flow

```
browser -> nginx (frontend:5173, serves the React app and proxies /api/*)
        -> api-gateway:3000 -> auth-service | account-service | transaction-service
                                     |              |                  |
                                  Postgres       Kafka  <-- saga -->  Kafka          mock-central-bank (other banks)
                                  Redis (sessions)
```

The transfer between accounts is an event-driven saga over Kafka topic `transaction.events`; the UI follows each transfer live (initiated -> debited -> credited -> completed, or reversed on failure).

## Performance tests (`tests/`)

k6 smoke, load, stress, spike, soak, breakpoint and saga-latency tests, run in Docker with results streamed to a Grafana dashboard ("VBank k6 Load Tests"):

```bash
./tests/run.sh smoke        # also: load | stress | spike | soak | breakpoint | saga-latency | all
./tests/cleanup.sh          # remove the data the tests created
```

See [`tests/README.md`](tests/README.md).

## Database setup (`docker/`)

Postgres runs every file in `docker/postgres/` on its **first start** (empty volume), in order:

| File                        | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `01-schema.sql`             | all tables, enums and indexes (`user`, `credential`, `account`, `transaction`)              |
| `02-seed-admin-user.sql`    | creates **admin@example.com / password123**; the password is stored as a bcrypt hash (`crypt(..., gen_salt('bf', 10))`) |
| `03-seed-demo-data.sql`     | optional: two accounts and a few transactions for the admin so the app and KPI panels are not empty. Delete the file for a blank start |

`docker/kafka/create-topics.sh` creates the four Kafka topics (run by the one-shot `kafka-init` container).
The services now run TypeORM with `synchronize=false`; the SQL files own the schema. Set `DB_SYNCHRONIZE=true` on a service to let TypeORM manage it again.

## Observability (`observability/`)

OpenTelemetry auto-instrumentation is preloaded into every Node service (`node --require @opentelemetry/auto-instrumentations-node/register`, see the Dockerfiles and the `OTEL_*` variables in `docker-compose.yml`). W3C `traceparent` context flows through HTTP (gateway -> services), Postgres, Redis and Kafka messages, and winston log lines carry `trace_id` / `span_id`.

```
services --OTLP--> otel-collector --traces--> Tempo  --span metrics--> Prometheus
                                  --metrics-> Prometheus (scrape :8889)
                                  --logs----> Loki
cAdvisor, node-exporter, blackbox, postgres/redis/kafka exporters --> Prometheus --> Alertmanager --SMTP--> e-mail
Grafana: Prometheus + Loki + Tempo + Alertmanager + Postgres data sources, cross-linked (log <-> trace <-> metric)
```

| Path                                     | Mounted into          |
| ---------------------------------------- | --------------------- |
| `observability/prometheus/`              | prometheus (config + recording + alert rules) |
| `observability/loki/`, `tempo/`          | loki, tempo           |
| `observability/otel-collector/`          | otel-collector        |
| `observability/alertmanager/`            | alertmanager (SMTP settings rendered from `.env`) |
| `observability/blackbox/`                | blackbox-exporter     |
| `observability/grafana/`                 | grafana: `grafana.ini`, provisioned data sources, dashboards |

**Dashboard "VBank Platform Overview"** (Grafana -> VBank folder) covers: business KPIs (users, accounts, transactions, success/failed, volume), uptime per service, availability / latency / success SLIs against SLOs (99.9 % availability, 95 % of requests under 500 ms, 99.5 % non-5xx) with error budget, request rate, successful vs failed HTTP requests, 5xx error rate, p50/p95/p99 latency, container and node CPU / memory, Kafka lag, Redis, PostgreSQL, plus error logs and error traces.

Note: HTTP panels count server spans of every service, so one user request that passes the gateway is counted once per hop. Pick a single service in the `Service` variable for per-service numbers.

### Alerts

Alertmanager e-mails when **container or node CPU / memory stays above 50 % for 2 minutes** (`observability/prometheus/rules/alert-rules.yml`), and on service down, high 5xx rate, high p95 latency, Kafka lag, Postgres/Redis down.

Container usage is measured against the container's limit (the Node services have `cpus: 0.50`, `memory: 512M` in the compose file); containers without a limit are measured against the whole host.

By default mail goes to **Mailpit** (http://localhost:8025), a local inbox, so you can see alerts with no mail account. For a real mailbox, copy `.env.example` to `.env` and set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_REQUIRE_TLS=true` and `ALERT_EMAIL_TO`, then `docker compose up -d alertmanager`.

Trigger a test alert:

```bash
docker exec -d auth-service sh -c 'while :; do :; done'   # burns its CPU limit; alert after ~2 minutes
```

## Changes made to the original project

- Root `docker-compose.yml` now starts the whole platform; removed the dependency on git-ignored `.env.production` files (config lives in the compose file, overridable through `.env`).
- `bitnami/*` images replaced (`postgres:17-alpine`, `apache/kafka:3.9.0`): Bitnami removed versioned tags from Docker Hub.
- Dockerfiles rewritten: one consistent multi-stage build per service, production-only `node_modules`, non-root user, OpenTelemetry preloaded. The mock central bank now also uses the shared packages.
- Gateway: rate limit read from env (previously hard-coded 100 requests / 15 min when `NODE_ENV=production`), `trust proxy` enabled.
- Account service: `GET /accounts/:accountNumber` read a non-existent `:userId` route param (always returned `NaN`); fixed. Users can now only debit/credit accounts they own (before, any logged-in user could move money on any account).
- Transaction service: new `GET /api/v1/transactions` (paginated, filter by status/account) needed by the UI; a received transfer is now visible to the receiver; fixed `notifyCentralBank` always reporting `FAILED` for inbound transfers.
- Logger prints `trace_id` / `span_id` when a span is active.
