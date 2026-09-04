CREATE TABLE users (id text PRIMARY KEY);
CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE workspaces (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE workspace_members (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE stores (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (id, workspace_id)
);
CREATE TABLE audit_runs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  store_id text NOT NULL,
  target_url text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  failure_category text CHECK (failure_category IN ('infrastructure', 'timeout', 'unsafe_url')),
  result_json jsonb,
  UNIQUE (id, workspace_id),
  FOREIGN KEY (store_id, workspace_id) REFERENCES stores(id, workspace_id) ON DELETE CASCADE
);
CREATE TABLE catalog_discoveries (
  store_id text PRIMARY KEY,
  workspace_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  failure_category text CHECK (failure_category IN ('infrastructure', 'timeout', 'unsafe_url')),
  discovered_count integer NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  rejected_count integer NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  partial boolean NOT NULL DEFAULT false,
  FOREIGN KEY (store_id, workspace_id) REFERENCES stores(id, workspace_id) ON DELETE CASCADE
);
CREATE TABLE catalog_items (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  store_id text NOT NULL,
  normalized_url text NOT NULL,
  source text NOT NULL CHECK (source = 'root_page_link'),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  active boolean NOT NULL,
  UNIQUE (store_id, normalized_url),
  FOREIGN KEY (store_id, workspace_id) REFERENCES stores(id, workspace_id) ON DELETE CASCADE
);
CREATE TABLE catalog_categories (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  store_id text NOT NULL,
  normalized_path text NOT NULL,
  name text NOT NULL,
  source text NOT NULL CHECK (source IN ('root_page_link', 'category_page_link')),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  active boolean NOT NULL,
  UNIQUE (store_id, normalized_path),
  FOREIGN KEY (store_id, workspace_id) REFERENCES stores(id, workspace_id) ON DELETE CASCADE
);
CREATE TABLE catalog_category_mappings (
  store_id text NOT NULL,
  catalog_item_id text NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (catalog_item_id, category_id)
);
CREATE TABLE store_audit_runs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  store_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'completed_with_failures', 'failed')),
  selection_mode text NOT NULL CHECK (selection_mode = 'automatic_bounded_active_catalog_v1'),
  selection_signature text NOT NULL,
  ruleset_version text NOT NULL,
  scope_snapshot_json jsonb NOT NULL,
  selected_pdp_count integer NOT NULL CHECK (selected_pdp_count BETWEEN 1 AND 5),
  completed_pdp_count integer NOT NULL DEFAULT 0 CHECK (completed_pdp_count >= 0),
  failed_pdp_count integer NOT NULL DEFAULT 0 CHECK (failed_pdp_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  summary_json jsonb,
  UNIQUE (id, workspace_id),
  FOREIGN KEY (store_id, workspace_id) REFERENCES stores(id, workspace_id) ON DELETE CASCADE
);
CREATE TABLE store_audit_run_items (
  id text PRIMARY KEY,
  store_audit_run_id text NOT NULL,
  workspace_id text NOT NULL,
  store_id text NOT NULL,
  catalog_item_id text NOT NULL REFERENCES catalog_items(id),
  normalized_url text NOT NULL,
  position integer NOT NULL CHECK (position >= 0 AND position < 5),
  audit_run_id text,
  failure_category text CHECK (failure_category IN ('infrastructure', 'timeout', 'unsafe_url')),
  UNIQUE (store_audit_run_id, position), UNIQUE (store_audit_run_id, catalog_item_id), UNIQUE (audit_run_id),
  FOREIGN KEY (store_audit_run_id, workspace_id) REFERENCES store_audit_runs(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (audit_run_id, workspace_id) REFERENCES audit_runs(id, workspace_id)
);
CREATE TABLE findings (
  id text NOT NULL,
  audit_run_id text NOT NULL,
  workspace_id text NOT NULL,
  rule_id text NOT NULL,
  payload_json jsonb NOT NULL,
  PRIMARY KEY (audit_run_id, id),
  FOREIGN KEY (audit_run_id, workspace_id) REFERENCES audit_runs(id, workspace_id) ON DELETE CASCADE
);
CREATE TABLE artifacts (
  id text PRIMARY KEY,
  audit_run_id text NOT NULL,
  workspace_id text NOT NULL,
  kind text NOT NULL CHECK (kind = 'screenshot'),
  content_type text NOT NULL CHECK (content_type = 'image/png'),
  byte_size integer NOT NULL CHECK (byte_size >= 0 AND byte_size <= 10485760),
  sha256 text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending', 'available', 'failed')),
  created_at timestamptz NOT NULL,
  FOREIGN KEY (audit_run_id, workspace_id) REFERENCES audit_runs(id, workspace_id) ON DELETE CASCADE
);
CREATE TABLE audit_jobs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  audit_run_id text UNIQUE,
  store_audit_run_id text UNIQUE,
  discovery_store_id text UNIQUE,
  job_type text NOT NULL CHECK (job_type IN ('quick_audit', 'store_audit', 'catalog_discovery')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 2),
  available_at timestamptz NOT NULL,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  worker_id text,
  completed_at timestamptz,
  failure_category text CHECK (failure_category IN ('infrastructure', 'timeout', 'unsafe_url')),
  created_at timestamptz NOT NULL,
  FOREIGN KEY (audit_run_id, workspace_id) REFERENCES audit_runs(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (store_audit_run_id, workspace_id) REFERENCES store_audit_runs(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (discovery_store_id, workspace_id) REFERENCES stores(id, workspace_id) ON DELETE CASCADE,
  CHECK ((job_type = 'quick_audit' AND audit_run_id IS NOT NULL AND store_audit_run_id IS NULL AND discovery_store_id IS NULL)
      OR (job_type = 'store_audit' AND audit_run_id IS NULL AND store_audit_run_id IS NOT NULL AND discovery_store_id IS NULL)
      OR (job_type = 'catalog_discovery' AND audit_run_id IS NULL AND store_audit_run_id IS NULL AND discovery_store_id IS NOT NULL))
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX stores_workspace ON stores(workspace_id);
CREATE INDEX runs_store ON audit_runs(store_id, created_at);
CREATE INDEX catalog_items_store ON catalog_items(store_id, active);
CREATE INDEX catalog_categories_store ON catalog_categories(store_id, active);
CREATE INDEX store_audit_runs_store ON store_audit_runs(store_id, started_at);
CREATE INDEX store_audit_items_parent ON store_audit_run_items(store_audit_run_id, position);
CREATE INDEX artifacts_run ON artifacts(audit_run_id) WHERE status = 'available';
CREATE INDEX audit_jobs_claimable ON audit_jobs(available_at, created_at, id) WHERE status IN ('queued', 'running');
