CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'anon'
  ) THEN
    CREATE ROLE anon NOLOGIN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'authenticated'
  ) THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'service_role'
  ) THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Phase 20M.3A2: canonical application role authority. Supabase populates
  -- the JWT `app_metadata` claim from this column, and only the service role
  -- or SQL can write it, so the admin payout read RPCs resolve the actor role
  -- from `raw_app_meta_data ->> 'app_role'` rather than trusting a caller.
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Older CI volumes may already have auth.users without the app metadata
-- column; add it idempotently so the stub matches the hosted schema.
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid
$$;