-- Phase 4: Analytics support
-- Adds score column to applications (was missing in Phase 3 schema),
-- and an index to speed up funnel queries.

-- applications.score for pgvector match score (0.0–1.0)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS score float CHECK (score >= 0 AND score <= 1);

-- Fast funnel aggregation: status per user
CREATE INDEX IF NOT EXISTS idx_applications_user_status
  ON applications (user_id, status);

-- Fast pipeline_events timeline per application
CREATE INDEX IF NOT EXISTS idx_pipeline_events_app_created
  ON pipeline_events (application_id, created_at DESC);

-- Fast weekly activity window query
CREATE INDEX IF NOT EXISTS idx_pipeline_events_created
  ON pipeline_events (created_at DESC);
