-- Generation jobs queue for crash recovery
CREATE TABLE IF NOT EXISTS generation_jobs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_scheduled
  ON generation_jobs (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_project_id
  ON generation_jobs (project_id);
