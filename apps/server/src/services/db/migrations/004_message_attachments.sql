ALTER TABLE attachments ADD COLUMN display_name TEXT;

CREATE TABLE message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE,
  UNIQUE (message_id, attachment_id)
);

CREATE INDEX idx_message_attachments_message_id ON message_attachments(message_id);
CREATE INDEX idx_message_attachments_attachment_id ON message_attachments(attachment_id);