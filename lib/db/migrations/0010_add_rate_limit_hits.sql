-- Rate limit hits: tracks per-key request timestamps for sliding window rate limiting
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_key_hit_at ON rate_limit_hits(key, hit_at);

-- Scheduled cleanup suggestion:
-- DELETE FROM rate_limit_hits WHERE hit_at < NOW() - INTERVAL '1 hour';
