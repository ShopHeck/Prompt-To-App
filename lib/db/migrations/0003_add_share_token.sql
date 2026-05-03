-- Migration: add share_token to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_token TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_share_token_unique'
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_share_token_unique UNIQUE (share_token);
  END IF;
END
$$;
