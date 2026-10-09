#!/usr/bin/env bash
# Deletes the users, accounts and transactions created by the performance tests.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-admin}" -d "${POSTGRES_DB:-vbank}" < tests/cleanup-perf-data.sql
echo "Performance test data removed."
