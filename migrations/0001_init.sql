-- Book Companion: core schema

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  doc_source TEXT,
  current_chapter TEXT,
  chapter_state TEXT,
  last_sync DATETIME,
  created_at DATETIME
);

CREATE TABLE IF NOT EXISTS edits_flagged (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  section TEXT,
  old_text TEXT,
  new_text TEXT,
  reason TEXT,
  user_decision TEXT,
  created_at DATETIME
);

CREATE TABLE IF NOT EXISTS fact_checks (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  claim TEXT,
  search_results TEXT,
  created_at DATETIME
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME
);
