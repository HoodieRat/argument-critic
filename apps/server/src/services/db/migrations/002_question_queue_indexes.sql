CREATE INDEX IF NOT EXISTS idx_messages_session_created_at
  ON messages (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_questions_session_status_created_at
  ON questions (session_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_questions_turn_id
  ON questions (source_turn_id);

CREATE INDEX IF NOT EXISTS idx_contradictions_session_created_at
  ON contradictions (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_session_created_at
  ON reports (session_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_content_hash
  ON attachments (session_id, content_hash);