CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  topic TEXT,
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  provenance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY,
  attachment_id TEXT NOT NULL,
  crop_x INTEGER NOT NULL,
  crop_y INTEGER NOT NULL,
  crop_width INTEGER NOT NULL,
  crop_height INTEGER NOT NULL,
  analysis_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  text TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(source_message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS claim_links (
  id TEXT PRIMARY KEY,
  from_claim_id TEXT NOT NULL,
  to_claim_id TEXT NOT NULL,
  link_type TEXT NOT NULL,
  explanation TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(from_claim_id) REFERENCES claims(id) ON DELETE CASCADE,
  FOREIGN KEY(to_claim_id) REFERENCES claims(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS definitions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  term TEXT NOT NULL,
  definition_text TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(source_message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assumptions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  text TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(source_message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS objections (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  text TEXT NOT NULL,
  severity TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(claim_id) REFERENCES claims(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contradictions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  claim_a_id TEXT NOT NULL,
  claim_b_id TEXT NOT NULL,
  status TEXT NOT NULL,
  explanation TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(claim_a_id) REFERENCES claims(id) ON DELETE CASCADE,
  FOREIGN KEY(claim_b_id) REFERENCES claims(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  topic TEXT,
  question_text TEXT NOT NULL,
  why_asked TEXT NOT NULL,
  what_it_tests TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL,
  source_turn_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS question_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  import_mode TEXT NOT NULL,
  enabled_for_context INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT PRIMARY KEY,
  research_run_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  snippet TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(research_run_id) REFERENCES research_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_findings (
  id TEXT PRIMARY KEY,
  research_run_id TEXT NOT NULL,
  finding_text TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(research_run_id) REFERENCES research_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  turn_id TEXT,
  route TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);