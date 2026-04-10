import type Database from "better-sqlite3";

import type { ReportRecord } from "../../../types/domain.js";
import { nowIso } from "../../../utils/time.js";

function mapReport(row: {
  id: string;
  session_id: string;
  report_type: string;
  title: string;
  content: string;
  created_at: string;
}): ReportRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    reportType: row.report_type,
    title: row.title,
    content: row.content,
    createdAt: row.created_at
  };
}

export class ReportsRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(input: { id: string; sessionId: string; reportType: string; title: string; content: string }): ReportRecord {
    const createdAt = nowIso();
    this.database
      .prepare(
        `INSERT INTO reports (id, session_id, report_type, title, content, created_at)
         VALUES (@id, @sessionId, @reportType, @title, @content, @createdAt)`
      )
      .run({ ...input, createdAt });

    return this.getById(input.id)!;
  }

  public getById(reportId: string): ReportRecord | null {
    const row = this.database.prepare("SELECT * FROM reports WHERE id = ?").get(reportId) as Parameters<typeof mapReport>[0] | undefined;
    return row ? mapReport(row) : null;
  }

  public listBySession(sessionId: string): ReportRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM reports WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId) as Array<Parameters<typeof mapReport>[0]>;
    return rows.map((row) => mapReport(row));
  }
}