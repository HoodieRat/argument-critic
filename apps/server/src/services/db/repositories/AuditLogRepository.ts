import type Database from "better-sqlite3";

import type { AuditLogRecord } from "../../../types/domain.js";
import { nowIso } from "../../../utils/time.js";

function mapAudit(row: {
  id: string;
  session_id: string | null;
  turn_id: string | null;
  route: string;
  action: string;
  detail_json: string;
  created_at: string;
}): AuditLogRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    route: row.route,
    action: row.action,
    detailJson: row.detail_json,
    createdAt: row.created_at
  };
}

export class AuditLogRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(input: {
    id: string;
    sessionId?: string | null;
    turnId?: string | null;
    route: string;
    action: string;
    detail: unknown;
  }): AuditLogRecord {
    const createdAt = nowIso();
    this.database
      .prepare(
        `INSERT INTO audit_log (id, session_id, turn_id, route, action, detail_json, created_at)
         VALUES (@id, @sessionId, @turnId, @route, @action, @detailJson, @createdAt)`
      )
      .run({
        id: input.id,
        sessionId: input.sessionId ?? null,
        turnId: input.turnId ?? null,
        route: input.route,
        action: input.action,
        detailJson: JSON.stringify(input.detail),
        createdAt
      });

    return this.getById(input.id)!;
  }

  public findLatestByAction(action: string, sessionId?: string): AuditLogRecord | null {
    if (sessionId) {
      const row = this.database
        .prepare("SELECT * FROM audit_log WHERE action = ? AND session_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(action, sessionId) as Parameters<typeof mapAudit>[0] | undefined;
      return row ? mapAudit(row) : null;
    }

    const row = this.database
      .prepare("SELECT * FROM audit_log WHERE action = ? ORDER BY created_at DESC LIMIT 1")
      .get(action) as Parameters<typeof mapAudit>[0] | undefined;
    return row ? mapAudit(row) : null;
  }

  public getById(id: string): AuditLogRecord | null {
    const row = this.database.prepare("SELECT * FROM audit_log WHERE id = ?").get(id) as Parameters<typeof mapAudit>[0] | undefined;
    return row ? mapAudit(row) : null;
  }
}