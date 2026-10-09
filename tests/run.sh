#!/usr/bin/env bash
# Runs a performance test inside Docker (no k6 install needed) and streams the metrics to Grafana.
#
#   ./tests/run.sh smoke
#   ./tests/run.sh load -e VU_SCALE=2
#   ./tests/run.sh soak -e DURATION=2h
#   ./tests/run.sh all                      # smoke -> load -> saga-latency
#
# Everything after the test name is passed to `k6 run` (use -e NAME=value for script settings).
set -euo pipefail
cd "$(dirname "$0")/.."

TESTS="smoke load stress spike soak breakpoint saga-latency"
usage() {
  echo "Usage: $0 <test|all> [k6 options]"
  echo "Tests: $TESTS"
  exit 1
}

TEST="${1:-}"
[ -n "$TEST" ] || usage
shift || true

run_one() {
  local name="$1"; shift
  [ -f "tests/$name.js" ] || { echo "Unknown test: $name"; usage; }
  mkdir -p tests/results
  echo
  echo "=== k6: $name ==="
  docker compose --profile tests run --rm k6 run \
    -o experimental-prometheus-rw \
    --tag "testid=$name" \
    --summary-export "/results/${name}-$(date +%Y%m%d-%H%M%S).json" \
    "/tests/$name.js" "$@"
}

# The gateway limits requests per IP (2000 / 15 min by default), which would turn a load test into a
# rate-limit test. Lift the limit for the duration of the run and restore it afterwards.
export RATE_LIMIT_MAX_REQUESTS="${RATE_LIMIT_MAX_REQUESTS:-100000000}"

restore() {
  if [ "${KEEP_RATE_LIMIT:-0}" != "1" ]; then
    echo "Restoring the gateway's normal rate limit..."
    unset RATE_LIMIT_MAX_REQUESTS
    docker compose up -d --no-deps api-gateway >/dev/null
  fi
}
trap restore EXIT

echo "Starting the stack (rate limit lifted for the test)..."
docker compose up -d >/dev/null

echo -n "Waiting for the API gateway"
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' api-gateway 2>/dev/null || true)" = "healthy" ] && break
  echo -n "."; sleep 2
done
echo

if [ "$TEST" = "all" ]; then
  for t in smoke load saga-latency; do run_one "$t" "$@"; done
else
  run_one "$TEST" "$@"
fi

echo
echo "Live results:  http://localhost:3030  ->  VBank -> 'VBank k6 Load Tests' and 'VBank Platform Overview'"
echo "Summary files: tests/results/"
echo "Remove the test users afterwards with: ./tests/cleanup.sh"
