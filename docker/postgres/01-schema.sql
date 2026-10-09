-- =============================================================================
-- VBank schema
-- Runs automatically the first time the postgres container starts (empty data
-- volume). Files in /docker-entrypoint-initdb.d are executed in name order.
--
-- The tables mirror the TypeORM entities of the auth, account and transaction
-- services, which now run with synchronize=false (DB_SYNCHRONIZE=false).
--
-- To re-run the scripts:   docker compose down -v && docker compose up -d
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- auth-service
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "user" (
    id          SERIAL PRIMARY KEY,
    first_name  VARCHAR   NOT NULL,
    last_name   VARCHAR   NOT NULL,
    email       VARCHAR   NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS credential (
    id             SERIAL PRIMARY KEY,
    email          VARCHAR   NOT NULL,
    password_hash  VARCHAR   NOT NULL,
    user_id        INTEGER,
    created_at     TIMESTAMP NOT NULL DEFAULT now(),
    updated_at     TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_credential_email   UNIQUE (email),
    CONSTRAINT uq_credential_user_id UNIQUE (user_id),
    CONSTRAINT fk_credential_user    FOREIGN KEY (user_id) REFERENCES "user"(id)
);

-- -----------------------------------------------------------------------------
-- account-service
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE account_account_type_enum   AS ENUM ('savings', 'current');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE account_account_status_enum AS ENUM ('active', 'frozen', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS account (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER                      NOT NULL,
    account_number  VARCHAR(15)                  NOT NULL,
    account_name    VARCHAR,
    account_type    account_account_type_enum    NOT NULL DEFAULT 'savings',
    account_status  account_account_status_enum  NOT NULL DEFAULT 'active',
    balance         NUMERIC(10, 2)               NOT NULL DEFAULT 0,
    currency        VARCHAR(3)                   NOT NULL DEFAULT 'INR',
    created_at      TIMESTAMP                    NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP                    NOT NULL DEFAULT now(),
    closed_at       TIMESTAMP,
    CONSTRAINT uq_account_account_number UNIQUE (account_number)
);
COMMENT ON COLUMN account.account_number IS 'Numeric account identifier stored as string';
CREATE INDEX IF NOT EXISTS idx_account_user_id ON account (user_id);

-- -----------------------------------------------------------------------------
-- transaction-service
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE transaction_transaction_type_enum AS ENUM ('transfer', 'credit', 'debit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE transaction_status_enum AS ENUM (
        'initiated', 'debit_success', 'credit_success', 'failed',
        'credit_failed', 'debit_compensate', 'compensation_success', 'completed'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "transaction" (
    id                         SERIAL PRIMARY KEY,
    user_id                    INTEGER,
    transaction_id             VARCHAR                            NOT NULL,
    source_account_number      VARCHAR                            NOT NULL,
    destination_account_number VARCHAR                            NOT NULL,
    transaction_type           transaction_transaction_type_enum  NOT NULL,
    status                     transaction_status_enum            NOT NULL DEFAULT 'initiated',
    amount                     NUMERIC(10, 2)                     NOT NULL,
    note                       VARCHAR,
    reference_id               VARCHAR,
    source_bank_code           VARCHAR,
    destination_bank_code      VARCHAR,
    is_source_external         BOOLEAN                            NOT NULL DEFAULT false,
    is_destination_external    BOOLEAN                            NOT NULL DEFAULT false,
    is_internal                BOOLEAN                            NOT NULL DEFAULT true,
    details                    VARCHAR,
    completed_at               TIMESTAMP,
    source_debited_at          TIMESTAMP,
    destination_credited_at    TIMESTAMP,
    compensated_at             TIMESTAMP,
    created_at                 TIMESTAMP                          NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMP                          NOT NULL DEFAULT now(),
    CONSTRAINT uq_transaction_transaction_id UNIQUE (transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_transaction_user_id      ON "transaction" (user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_reference_id ON "transaction" (reference_id);
CREATE INDEX IF NOT EXISTS idx_transaction_source       ON "transaction" (source_account_number);
CREATE INDEX IF NOT EXISTS idx_transaction_destination  ON "transaction" (destination_account_number);
CREATE INDEX IF NOT EXISTS idx_transaction_created_at   ON "transaction" (created_at);
