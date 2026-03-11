-- =============================================================================
-- Migration 001: RBAC Foundation
-- Target: Supabase Postgres
-- Sprint: rbac-v1, Task 1
-- =============================================================================

-- 1. Add email column to developers
ALTER TABLE developers ADD COLUMN email TEXT;

-- 2. Seed developer emails
UPDATE developers SET email = 'wiley@n2o.dev' WHERE name = 'whsimonds';
UPDATE developers SET email = 'wiley+test@n2o.dev' WHERE name = 'wiley';

-- 3. Make email NOT NULL + UNIQUE after seeding
ALTER TABLE developers ALTER COLUMN email SET NOT NULL;
ALTER TABLE developers ADD CONSTRAINT developers_email_unique UNIQUE (email);

-- 4. Add access_role column with default 'engineer'
ALTER TABLE developers ADD COLUMN access_role TEXT DEFAULT 'engineer';
ALTER TABLE developers ADD CONSTRAINT chk_access_role CHECK (access_role IN ('admin', 'engineer'));

-- 5. Seed admin
UPDATE developers SET access_role = 'admin' WHERE name = 'whsimonds';

-- 6. Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  performed_by TEXT,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_performed_by ON audit_logs(performed_by);
CREATE INDEX idx_audit_logs_performed_at ON audit_logs(performed_at);

-- 7. Data normalization: fix tasks.owner values that don't match developers.name
-- Agent-generated names all belong to whsimonds (only user running agents)
UPDATE tasks SET owner = 'whsimonds' WHERE owner LIKE 'agent-%';
UPDATE tasks SET owner = 'whsimonds' WHERE owner IN ('claude', 'claude-main', 'tdd-agent');
