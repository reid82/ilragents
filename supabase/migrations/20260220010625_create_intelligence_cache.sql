CREATE TABLE IF NOT EXISTS property_intelligence_cache (
  cache_key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intelligence_cache_expires
  ON property_intelligence_cache (expires_at);

-- Grant access to service_role (used by the pipeline)
GRANT ALL ON property_intelligence_cache TO service_role;
