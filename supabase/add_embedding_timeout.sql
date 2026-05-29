-- ── Bump statement_timeout for embedding inserts ─────────────────────────────
-- Service-role default is 30s on Supabase. HNSW index updates while bulk
-- inserting hundreds of context_chunks rows (one per ~1200-char document
-- chunk) can exceed that on a hot table. Raise to 120s so large documents
-- (5k+ chunks) still embed without 'canceling statement due to statement
-- timeout' errors.
--
-- Safe to re-run.

alter role service_role set statement_timeout = '120s';

-- The change applies to NEW connections via PgBouncer/pooler. Force a
-- pool reset to ensure existing pooled connections pick it up.
select pg_reload_conf();
