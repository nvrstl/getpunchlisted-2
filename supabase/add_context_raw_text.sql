-- ── Full raw text on project_context ─────────────────────────────────────────
-- project_context.content currently stores an AI-generated summary + key
-- points. That's enough for high-level project Q&A but means the chat can't
-- quote clauses verbatim. Add raw_text to hold the original extracted text
-- (PDF body, email body, etc.) so the chat can pull exact wording.
--
-- Nullable + safe to leave NULL on legacy rows; chats fall back to content.

alter table project_context add column if not exists raw_text text;
