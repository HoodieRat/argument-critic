ALTER TABLE sessions ADD COLUMN criticality_multiplier REAL NOT NULL DEFAULT 1.0;
ALTER TABLE sessions ADD COLUMN structured_output_enabled INTEGER NOT NULL DEFAULT 1;