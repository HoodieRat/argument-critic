import type Database from "better-sqlite3";

import type { ClaimRecord, DefinitionRecord, ObjectionRecord } from "../../../types/domain.js";
import { nowIso } from "../../../utils/time.js";

function mapClaim(row: {
  id: string;
  session_id: string;
  text: string;
  claim_type: string;
  confidence: number;
  source_message_id: string;
  created_at: string;
}): ClaimRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    text: row.text,
    claimType: row.claim_type,
    confidence: row.confidence,
    sourceMessageId: row.source_message_id,
    createdAt: row.created_at
  };
}

function mapDefinition(row: {
  id: string;
  session_id: string;
  term: string;
  definition_text: string;
  source_message_id: string;
  created_at: string;
}): DefinitionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    term: row.term,
    definitionText: row.definition_text,
    sourceMessageId: row.source_message_id,
    createdAt: row.created_at
  };
}

function mapObjection(row: {
  id: string;
  session_id: string;
  claim_id: string;
  text: string;
  severity: string;
  created_at: string;
}): ObjectionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    claimId: row.claim_id,
    text: row.text,
    severity: row.severity,
    createdAt: row.created_at
  };
}

export class ClaimsRepository {
  public constructor(private readonly database: Database.Database) {}

  public createClaims(sessionId: string, sourceMessageId: string, claims: Array<{ id: string; text: string; claimType: string; confidence: number }>): void {
    const statement = this.database.prepare(
      `INSERT INTO claims (id, session_id, text, claim_type, confidence, source_message_id, created_at)
       VALUES (@id, @sessionId, @text, @claimType, @confidence, @sourceMessageId, @createdAt)`
    );
    const createdAt = nowIso();

    const transaction = this.database.transaction(() => {
      for (const claim of claims) {
        statement.run({ ...claim, sessionId, sourceMessageId, createdAt });
      }
    });
    transaction();
  }

  public createDefinitions(
    sessionId: string,
    sourceMessageId: string,
    definitions: Array<{ id: string; term: string; definitionText: string }>
  ): void {
    const statement = this.database.prepare(
      `INSERT INTO definitions (id, session_id, term, definition_text, source_message_id, created_at)
       VALUES (@id, @sessionId, @term, @definitionText, @sourceMessageId, @createdAt)`
    );
    const createdAt = nowIso();

    const transaction = this.database.transaction(() => {
      for (const definition of definitions) {
        statement.run({ ...definition, sessionId, sourceMessageId, createdAt });
      }
    });
    transaction();
  }

  public createAssumptions(sessionId: string, sourceMessageId: string, assumptions: Array<{ id: string; text: string }>): void {
    const statement = this.database.prepare(
      `INSERT INTO assumptions (id, session_id, text, source_message_id, created_at)
       VALUES (@id, @sessionId, @text, @sourceMessageId, @createdAt)`
    );
    const createdAt = nowIso();

    const transaction = this.database.transaction(() => {
      for (const assumption of assumptions) {
        statement.run({ ...assumption, sessionId, sourceMessageId, createdAt });
      }
    });
    transaction();
  }

  public createObjections(sessionId: string, objections: Array<{ id: string; claimId: string; text: string; severity: string }>): void {
    const statement = this.database.prepare(
      `INSERT INTO objections (id, session_id, claim_id, text, severity, created_at)
       VALUES (@id, @sessionId, @claimId, @text, @severity, @createdAt)`
    );
    const createdAt = nowIso();

    const transaction = this.database.transaction(() => {
      for (const objection of objections) {
        statement.run({ ...objection, sessionId, createdAt });
      }
    });
    transaction();
  }

  public listRecentClaims(sessionId: string, limit = 20): ClaimRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM claims WHERE session_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(sessionId, limit) as Array<Parameters<typeof mapClaim>[0]>;
    return rows.map((row) => mapClaim(row));
  }

  public listDefinitions(sessionId: string): DefinitionRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM definitions WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId) as Array<Parameters<typeof mapDefinition>[0]>;
    return rows.map((row) => mapDefinition(row));
  }

  public listObjections(sessionId: string): ObjectionRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM objections WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId) as Array<Parameters<typeof mapObjection>[0]>;
    return rows.map((row) => mapObjection(row));
  }
}