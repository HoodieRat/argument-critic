import type Database from "better-sqlite3";

import type { SessionMode, SessionRecord } from "../../../types/domain.js";
import { nowIso } from "../../../utils/time.js";

function mapSession(row: {
  id: string;
  title: string;
  mode: SessionMode;
  topic: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}): SessionRecord {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    topic: row.topic,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class SessionsRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(input: { id: string; title: string; mode: SessionMode; topic?: string | null }): SessionRecord {
    const timestamp = nowIso();
    this.database
      .prepare(
        `INSERT INTO sessions (id, title, mode, topic, summary, created_at, updated_at)
         VALUES (@id, @title, @mode, @topic, NULL, @createdAt, @updatedAt)`
      )
      .run({
        id: input.id,
        title: input.title,
        mode: input.mode,
        topic: input.topic ?? null,
        createdAt: timestamp,
        updatedAt: timestamp
      });

    return this.getById(input.id)!;
  }

  public list(): SessionRecord[] {
    const rows = this.database.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all() as Array<Parameters<typeof mapSession>[0]>;
    return rows.map((row) => mapSession(row));
  }

  public getById(sessionId: string): SessionRecord | null {
    const row = this.database.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Parameters<typeof mapSession>[0] | undefined;
    return row ? mapSession(row) : null;
  }

  public updateSummary(sessionId: string, summary: string | null): void {
    this.database
      .prepare("UPDATE sessions SET summary = ?, updated_at = ? WHERE id = ?")
      .run(summary, nowIso(), sessionId);
  }

  public updateMode(sessionId: string, mode: SessionMode): void {
    this.database.prepare("UPDATE sessions SET mode = ?, updated_at = ? WHERE id = ?").run(mode, nowIso(), sessionId);
  }

  public updateTitle(sessionId: string, title: string): void {
    this.database.prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?").run(title, nowIso(), sessionId);
  }

  public touch(sessionId: string): void {
    this.database.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(nowIso(), sessionId);
  }

  public count(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number };
    return row.count;
  }
}