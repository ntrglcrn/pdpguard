CREATE TABLE external_identities (
  provider text NOT NULL,
  subject text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (provider, subject),
  UNIQUE (provider, user_id)
);

ALTER TABLE audit_runs ADD COLUMN worker_token_hash text;
