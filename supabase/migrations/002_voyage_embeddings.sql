-- Phase 3: Switch embeddings from 1536-dim (mock) to 1024-dim (voyage-3-lite)
-- Run AFTER all existing embedding rows are cleared or backfilled.

-- Resumes: 1536 → 1024
ALTER TABLE resumes
  DROP COLUMN IF EXISTS embedding;
ALTER TABLE resumes
  ADD COLUMN embedding vector(1024);

-- Job listings: 1536 → 1024
ALTER TABLE job_listings
  DROP COLUMN IF EXISTS embedding;
ALTER TABLE job_listings
  ADD COLUMN embedding vector(1024);

-- Rebuild IVFFlat index with correct dimensionality
-- (drop old index first; index names must match 001_init.sql)
DROP INDEX IF EXISTS resumes_embedding_idx;
DROP INDEX IF EXISTS job_listings_embedding_idx;

CREATE INDEX resumes_embedding_idx
  ON resumes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX job_listings_embedding_idx
  ON job_listings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
