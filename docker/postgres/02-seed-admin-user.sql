-- =============================================================================
-- Admin login for the first start
--
--   email    : admin@example.com
--   password : password123
--
-- The password is never stored in clear text: pgcrypto's crypt() with a
-- bcrypt salt (cost 10) produces a "$2a$10$..." hash, which the auth-service
-- verifies with bcrypt.compare(). Same algorithm and cost the service uses
-- when a user signs up through the API.
--
-- Safe to run more than once.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH admin AS (
    INSERT INTO "user" (first_name, last_name, email)
    VALUES ('Admin', 'User', 'admin@example.com')
    ON CONFLICT (email) DO UPDATE SET updated_at = now()
    RETURNING id
)
INSERT INTO credential (email, password_hash, user_id)
SELECT 'admin@example.com',
       crypt('password123', gen_salt('bf', 10)),
       admin.id
FROM admin
ON CONFLICT (email) DO NOTHING;
