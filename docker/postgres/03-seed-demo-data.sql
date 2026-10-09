-- =============================================================================
-- OPTIONAL demo data for the admin user, so the app and the Grafana business
-- KPI panels are not empty on first launch. Delete this file if you prefer to
-- start from a blank slate (then run `docker compose down -v` once).
--
-- Account numbers follow the format used by account-service:
--   <type 11|13><year><type 11|13><7 digits>
-- =============================================================================

INSERT INTO account (user_id, account_number, account_name, account_type, balance)
SELECT u.id, v.account_number, v.account_name, v.account_type::account_account_type_enum, v.balance
FROM "user" u
CROSS JOIN (VALUES
    ('112026110000001', 'Everyday savings', 'savings', 48250.00),
    ('132026130000001', 'Household current', 'current', 12500.00)
) AS v(account_number, account_name, account_type, balance)
WHERE u.email = 'admin@example.com'
ON CONFLICT (account_number) DO NOTHING;

-- a short history spread over the last days (statuses cover the whole lifecycle)
INSERT INTO "transaction" (
    user_id, transaction_id, source_account_number, destination_account_number,
    transaction_type, status, amount, note, reference_id, source_bank_code,
    destination_bank_code, is_destination_external, is_internal, details,
    completed_at, created_at, updated_at
)
SELECT u.id, t.transaction_id, t.src, t.dst, 'transfer'::transaction_transaction_type_enum, t.status::transaction_status_enum, t.amount, t.note,
       t.reference_id, 'VBANK', t.dest_bank, t.is_external, NOT t.is_external, t.details,
       CASE WHEN t.status IN ('completed', 'failed') THEN now() - t.age + interval '3 seconds' END,
       now() - t.age, now() - t.age + interval '3 seconds'
FROM "user" u
CROSS JOIN (VALUES
    ('VBNK-DEMO0000000000000000000000001', '112026110000001', '132026130000001', 'completed', 2500.00, 'Groceries budget',  NULL,        'VBANK', false, NULL,                                                                   interval '6 days'),
    ('VBNK-DEMO0000000000000000000000002', '132026130000001', '112026110000001', 'completed',  800.00, 'Refund',            NULL,        'VBANK', false, NULL,                                                                   interval '5 days'),
    ('VBNK-DEMO0000000000000000000000003', '112026110000001', '998877665544332', 'completed', 1200.00, 'Rent share',        'DEMO-REF-1','SBANK', true,  NULL,                                                                   interval '4 days'),
    ('VBNK-DEMO0000000000000000000000004', '112026110000001', '998877665544331', 'failed',     400.00, 'Gift',              'DEMO-REF-2','SBANK', true,  'event: ACCOUNT_DEBIT_COMPENSATED',                                     interval '3 days'),
    ('VBNK-DEMO0000000000000000000000005', '132026130000001', '112026110000001', 'completed', 3000.00, 'Top up savings',    NULL,        'VBANK', false, NULL,                                                                   interval '2 days'),
    ('VBNK-DEMO0000000000000000000000006', '112026110000001', '132026130000001', 'failed',   90000.00, 'Too large',         NULL,        'VBANK', false, 'event: ACCOUNT_DEBIT_FAILED, error: insufficient balance, errorCode: E0',   interval '1 day'),
    ('VBNK-DEMO0000000000000000000000007', '112026110000001', '132026130000001', 'completed',  650.00, 'Utilities',         NULL,        'VBANK', false, NULL,                                                                   interval '6 hours')
) AS t(transaction_id, src, dst, status, amount, note, reference_id, dest_bank, is_external, details, age)
WHERE u.email = 'admin@example.com'
ON CONFLICT (transaction_id) DO NOTHING;
