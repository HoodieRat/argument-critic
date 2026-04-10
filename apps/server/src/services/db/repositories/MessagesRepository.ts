import type Database from "better-sqlite3";

import type { MessageRecord, ResponseProvenance, MessageRole } from "../../../types/domain.js";
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

export class MessagesRepository {
  public constructor(private readonly database: Database.Database) {}

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

  public getById(messageId: string): MessageRecord | null {
    const row = this.database.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as Parameters<typeof mapMessage>[0] | undefined;
    return row ? mapMessage(row) : null;
  }

  public listBySession(sessionId: string, limit = 100): MessageRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(sessionId, limit) as Array<Parameters<typeof mapMessage>[0]>;
    return rows.map((row) => mapMessage(row));
  }

  public listChronological(sessionId: string, limit = 100): MessageRecord[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM (
           SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
         ) ORDER BY created_at ASC`
      )
      .all(sessionId, limit) as Array<Parameters<typeof mapMessage>[0]>;
    return rows.map((row) => mapMessage(row));
  }

  public importSessionMessages(sourceSessionId: string, targetSessionId: string): MessageRecord[] {
    const rows = this.listChronological(sourceSessionId, 500);
    const insert = this.database.prepare(
      `INSERT INTO messages (id, session_id, role, content, provenance, created_at)
       VALUES (@id, @sessionId, @role, @content, @provenance, @createdAt)`
    );

    const transaction = this.database.transaction((messages: MessageRecord[]) => {
      for (const message of messages) {
        insert.run({
          id: crypto.randomUUID(),
          sessionId: targetSessionId,
          role: message.role,
          content: message.content,
          provenance: message.provenance,
          createdAt: nowIso()
        });
      }
    });

    transaction(rows);
    return this.listChronological(targetSessionId, 500);
  }
}