CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL DEFAULT 'Everyday Checking',
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  account_last4 CHAR(4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts(user_id);
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_reference VARCHAR(160),
  description VARCHAR(180) NOT NULL,
  transaction_type VARCHAR(12) NOT NULL CHECK (transaction_type IN ('credit','debit')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending','processing','received','completed','failed','returned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_reference)
);
CREATE INDEX IF NOT EXISTS transactions_account_created_idx ON transactions(account_id, created_at DESC);
CREATE TABLE IF NOT EXISTS incoming_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_reference VARCHAR(160) NOT NULL UNIQUE,
  sender_name VARCHAR(120) NOT NULL,
  sender_country VARCHAR(100) NOT NULL,
  sender_bank VARCHAR(160) NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','received','failed','returned')),
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  credited_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS incoming_account_created_idx ON incoming_payments(account_id, created_at DESC);
