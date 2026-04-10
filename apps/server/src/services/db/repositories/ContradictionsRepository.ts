import type Database from "better-sqlite3";

import type { ContradictionRecord, ContradictionStatus } from "../../../types/domain.js";
import { nowIso } from "../../../utils/time.js";

function mapContradiction(row: {
  id: string;
  session_id: string;
  claim_a_id: string;
  claim_b_id: string;
  status: ContradictionStatus;
  explanation: string;
  created_at: string;
}): ContradictionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    claimAId: row.claim_a_id,
    claimBId: row.claim_b_id,
    status: row.status,
    explanation: row.explanation,
    createdAt: row.created_at
  };
}

export class ContradictionsRepository {
  public constructor(private readonly database: Database.Database) {}

  public createMany(
    sessionId: string,
    contradictions: Array<{ id: string; claimAId: string; claimBId: string; explanation: string; status?: ContradictionStatus }>
  ): void {
    if (contradictions.length === 0) {
      return;
    }

    const statement = this.database.prepare(
      `INSERT INTO contradictions (id, session_id, claim_a_id, claim_b_id, status, explanation, created_at)
       VALUES (@id, @sessionId, @claimAId, @claimBId, @status, @explanation, @createdAt)`
    );
    const createdAt = nowIso();
    const transaction = this.database.transaction(() => {
      for (const contradiction of contradictions) {
        statement.run({
          ...contradiction,
          sessionId,
          status: contradiction.status ?? "open",
          createdAt
        });
      }
    });
    transaction();
  }

  public listBySession(sessionId: string): ContradictionRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM contradictions WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId) as Array<Parameters<typeof mapContradiction>[0]>;
    return rows.map((row) => mapContradiction(row));
  }
}