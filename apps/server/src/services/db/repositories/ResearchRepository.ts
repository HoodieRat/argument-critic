import type Database from "better-sqlite3";

import type { ResearchFindingRecord, ResearchRunRecord, ResearchSourceRecord } from "../../../types/domain.js";
import { nowIso } from "../../../utils/time.js";

function mapResearchRun(row: {
  id: string;
  session_id: string;
  provider: string;
  import_mode: string;
  enabled_for_context: number;
  created_at: string;
}): ResearchRunRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    provider: row.provider,
    importMode: row.import_mode,
    enabledForContext: Boolean(row.enabled_for_context),
    createdAt: row.created_at
  };
}

function mapResearchSource(row: {
  id: string;
  research_run_id: string;
  title: string;
  url: string;
  snippet: string;
  source_hash: string;
  created_at: string;
}): ResearchSourceRecord {
  return {
    id: row.id,
    researchRunId: row.research_run_id,
    title: row.title,
    url: row.url,
    snippet: row.snippet,
    sourceHash: row.source_hash,
    createdAt: row.created_at
  };
}

function mapResearchFinding(row: {
  id: string;
  research_run_id: string;
  finding_text: string;
  category: string;
  created_at: string;
}): ResearchFindingRecord {
  return {
    id: row.id,
    researchRunId: row.research_run_id,
    findingText: row.finding_text,
    category: row.category,
    createdAt: row.created_at
  };
}

export class ResearchRepository {
  public constructor(private readonly database: Database.Database) {}

  public createRun(input: {
    id: string;
    sessionId: string;
    provider: string;
    importMode: string;
    enabledForContext: boolean;
  }): ResearchRunRecord {
    const createdAt = nowIso();
    this.database
      .prepare(
        `INSERT INTO research_runs (id, session_id, provider, import_mode, enabled_for_context, created_at)
         VALUES (@id, @sessionId, @provider, @importMode, @enabledForContext, @createdAt)`
      )
      .run({
        ...input,
        enabledForContext: input.enabledForContext ? 1 : 0,
        createdAt
      });

    return this.getRun(input.id)!;
  }

  public createSources(sources: Array<{ id: string; researchRunId: string; title: string; url: string; snippet: string; sourceHash: string }>): void {
    const statement = this.database.prepare(
      `INSERT INTO research_sources (id, research_run_id, title, url, snippet, source_hash, created_at)
       VALUES (@id, @researchRunId, @title, @url, @snippet, @sourceHash, @createdAt)`
    );
    const createdAt = nowIso();
    const transaction = this.database.transaction(() => {
      for (const source of sources) {
        statement.run({ ...source, createdAt });
      }
    });
    transaction();
  }

  public createFindings(findings: Array<{ id: string; researchRunId: string; findingText: string; category: string }>): void {
    const statement = this.database.prepare(
      `INSERT INTO research_findings (id, research_run_id, finding_text, category, created_at)
       VALUES (@id, @researchRunId, @findingText, @category, @createdAt)`
    );
    const createdAt = nowIso();
    const transaction = this.database.transaction(() => {
      for (const finding of findings) {
        statement.run({ ...finding, createdAt });
      }
    });
    transaction();
  }

  public listRunsBySession(sessionId: string): ResearchRunRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM research_runs WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId) as Array<Parameters<typeof mapResearchRun>[0]>;
    return rows.map((row) => mapResearchRun(row));
  }

  public listSources(researchRunId: string): ResearchSourceRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM research_sources WHERE research_run_id = ? ORDER BY created_at ASC")
      .all(researchRunId) as Array<Parameters<typeof mapResearchSource>[0]>;
    return rows.map((row) => mapResearchSource(row));
  }

  public listFindings(researchRunId: string): ResearchFindingRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM research_findings WHERE research_run_id = ? ORDER BY created_at ASC")
      .all(researchRunId) as Array<Parameters<typeof mapResearchFinding>[0]>;
    return rows.map((row) => mapResearchFinding(row));
  }

  private getRun(researchRunId: string): ResearchRunRecord | null {
    const row = this.database.prepare("SELECT * FROM research_runs WHERE id = ?").get(researchRunId) as Parameters<typeof mapResearchRun>[0] | undefined;
    return row ? mapResearchRun(row) : null;
  }
}