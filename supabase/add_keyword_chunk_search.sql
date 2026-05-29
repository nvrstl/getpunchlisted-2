-- ── Keyword substring search over context_chunks ────────────────────────────
-- Vector similarity misses chunks that mention specific terms (brand names,
-- artikelnummers, product codes) but score low semantically. This function
-- scans every chunk in the project for substring matches and returns the
-- ones that hit any of the supplied keywords, ranked by how many hits.
-- Combined with the vector RPC in retrieval.js, the chat now sees both
-- semantically relevant chunks AND chunks that literally contain the
-- user's keywords.
--
-- Safe to re-run.

create or replace function search_chunks_by_keywords(
  p_project_id  uuid,
  p_keywords    text[],
  p_match_count int default 30
)
returns table (
  chunk_id           uuid,
  project_context_id uuid,
  text               text,
  similarity         float
)
language sql
stable
as $$
  select
    cc.id                  as chunk_id,
    cc.project_context_id  as project_context_id,
    cc.text                as text,
    -- Hit count is treated as a pseudo-similarity score so the calling
    -- code can merge results with the vector pool uniformly. Normalised
    -- to roughly the cosine-similarity 0..1 range by dividing by the
    -- number of keywords searched (so a chunk that matches every term
    -- gets 1.0).
    (
      coalesce((
        select sum(case when cc.text ilike '%' || k || '%' then 1 else 0 end)::float
        from unnest(p_keywords) k
      ), 0)
      / greatest(array_length(p_keywords, 1), 1)::float
    ) as similarity
  from context_chunks cc
  where cc.project_id = p_project_id
    and exists (
      select 1 from unnest(p_keywords) k where cc.text ilike '%' || k || '%'
    )
  order by similarity desc, cc.chunk_idx asc
  limit p_match_count;
$$;
