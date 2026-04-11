ALTER TABLE sessions ADD COLUMN source_session_id TEXT;
ALTER TABLE sessions ADD COLUMN source_session_mode TEXT;
ALTER TABLE sessions ADD COLUMN handoff_prompt TEXT;