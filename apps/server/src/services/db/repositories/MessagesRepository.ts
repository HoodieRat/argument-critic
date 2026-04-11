import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import type { AttachmentRecord, MessageRecord, ResponseProvenance, MessageRole } from "../../../types/domain.js";
import { nowIso } from "../../../utils/time.js";

function mapMessage(row: {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  provenance: ResponseProvenance;
  created_at: string;
}): MessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    provenance: row.provenance,
    createdAt: row.created_at
  };
}

function mapAttachment(row: {
  id: string;
  session_id: string;
  type: string;
  path: string;
  display_name: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  content_hash: string;
  created_at: string;
}): AttachmentRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    path: row.path,
    displayName: row.display_name,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    contentHash: row.content_hash,
    createdAt: row.created_at
  };
}

export class MessagesRepository {
  public constructor(private readonly database: Database.Database) {}

  private hydrateAttachments(messages: MessageRecord[]): MessageRecord[] {
    if (messages.length === 0) {
      return messages;
    }

    const messageIds = messages.map((message) => message.id);
    const placeholders = messageIds.map(() => "?").join(", ");
    const rows = this.database
      .prepare(
        `SELECT ma.message_id, a.*
         FROM message_attachments ma
         JOIN attachments a ON a.id = ma.attachment_id
         WHERE ma.message_id IN (${placeholders})
         ORDER BY ma.created_at ASC`
      )
      .all(...messageIds) as Array<{ message_id: string } & Parameters<typeof mapAttachment>[0]>;

    const attachmentsByMessageId = new Map<string, AttachmentRecord[]>();
    for (const row of rows) {
      const attachments = attachmentsByMessageId.get(row.message_id) ?? [];
      attachments.push(mapAttachment(row));
      attachmentsByMessageId.set(row.message_id, attachments);
    }

    return messages.map((message) => ({
      ...message,
      attachments: attachmentsByMessageId.get(message.id) ?? []
    }));
  }

  public create(input: {
    id: string;
    sessionId: string;
    role: MessageRole;
    content: string;
    provenance: ResponseProvenance;
  }): MessageRecord {
    const createdAt = nowIso();
    this.database
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, provenance, created_at)
         VALUES (@id, @sessionId, @role, @content, @provenance, @createdAt)`
      )
      .run({ ...input, createdAt });

    return this.getById(input.id)!;
  }

  public linkAttachments(messageId: string, attachmentIds: string[]): void {
    const normalizedAttachmentIds = [...new Set(attachmentIds.map((attachmentId) => attachmentId.trim()).filter(Boolean))];
    if (normalizedAttachmentIds.length === 0) {
      return;
    }

    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO message_attachments (id, message_id, attachment_id, created_at)
       VALUES (@id, @messageId, @attachmentId, @createdAt)`
    );
    const createdAt = nowIso();
    const transaction = this.database.transaction((messageAttachmentIds: string[]) => {
      for (const attachmentId of messageAttachmentIds) {
        insert.run({
          id: randomUUID(),
          messageId,
          attachmentId,
          createdAt
        });
      }
    });
    transaction(normalizedAttachmentIds);
  }

  public getById(messageId: string): MessageRecord | null {
    const row = this.database.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as Parameters<typeof mapMessage>[0] | undefined;
    return row ? this.hydrateAttachments([mapMessage(row)])[0] ?? null : null;
  }

  public listBySession(sessionId: string, limit = 100): MessageRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(sessionId, limit) as Array<Parameters<typeof mapMessage>[0]>;
    return this.hydrateAttachments(rows.map((row) => mapMessage(row)));
  }

  public listChronological(sessionId: string, limit = 100): MessageRecord[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM (
           SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
         ) ORDER BY created_at ASC`
      )
      .all(sessionId, limit) as Array<Parameters<typeof mapMessage>[0]>;
    return this.hydrateAttachments(rows.map((row) => mapMessage(row)));
  }

  public importSessionMessages(sourceSessionId: string, targetSessionId: string): MessageRecord[] {
    const rows = this.listChronological(sourceSessionId, 500);
    const sourceMessageIds = rows.map((message) => message.id);
    const placeholders = sourceMessageIds.length > 0 ? sourceMessageIds.map(() => "?").join(", ") : "''";
    const linkedAttachmentRows = sourceMessageIds.length > 0
      ? this.database
          .prepare(`SELECT message_id, attachment_id FROM message_attachments WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`)
          .all(...sourceMessageIds) as Array<{ message_id: string; attachment_id: string }>
      : [];
    const attachmentIdsBySourceMessageId = new Map<string, string[]>();
    for (const row of linkedAttachmentRows) {
      const linkedAttachmentIds = attachmentIdsBySourceMessageId.get(row.message_id) ?? [];
      linkedAttachmentIds.push(row.attachment_id);
      attachmentIdsBySourceMessageId.set(row.message_id, linkedAttachmentIds);
    }
    const insert = this.database.prepare(
      `INSERT INTO messages (id, session_id, role, content, provenance, created_at)
       VALUES (@id, @sessionId, @role, @content, @provenance, @createdAt)`
    );
    const linkAttachment = this.database.prepare(
      `INSERT OR IGNORE INTO message_attachments (id, message_id, attachment_id, created_at)
       VALUES (@id, @messageId, @attachmentId, @createdAt)`
    );

    const transaction = this.database.transaction((messages: MessageRecord[]) => {
      for (const message of messages) {
        const newMessageId = randomUUID();
        insert.run({
          id: newMessageId,
          sessionId: targetSessionId,
          role: message.role,
          content: message.content,
          provenance: message.provenance,
          createdAt: nowIso()
        });

        for (const attachmentId of attachmentIdsBySourceMessageId.get(message.id) ?? []) {
          linkAttachment.run({
            id: randomUUID(),
            messageId: newMessageId,
            attachmentId,
            createdAt: nowIso()
          });
        }
      }
    });

    transaction(rows);
    return this.listChronological(targetSessionId, 500);
  }
}