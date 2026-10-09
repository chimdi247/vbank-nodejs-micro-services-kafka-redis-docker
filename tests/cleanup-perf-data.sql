-- Removes everything the performance tests created: users perf-*@loadtest.local, their accounts and
-- every transaction that touches those accounts. The seeded admin and demo data are not touched.
BEGIN;

CREATE TEMP TABLE perf_users ON COMMIT DROP AS
  SELECT id FROM "user" WHERE email LIKE 'perf-%@loadtest.local';

CREATE TEMP TABLE perf_accounts ON COMMIT DROP AS
  SELECT account_number FROM account WHERE user_id IN (SELECT id FROM perf_users);

DELETE FROM "transaction"
 WHERE user_id IN (SELECT id FROM perf_users)
    OR source_account_number      IN (SELECT account_number FROM perf_accounts)
    OR destination_account_number IN (SELECT account_number FROM perf_accounts);

DELETE FROM account    WHERE user_id IN (SELECT id FROM perf_users);
DELETE FROM credential WHERE user_id IN (SELECT id FROM perf_users);
DELETE FROM "user"     WHERE id      IN (SELECT id FROM perf_users);

COMMIT;
