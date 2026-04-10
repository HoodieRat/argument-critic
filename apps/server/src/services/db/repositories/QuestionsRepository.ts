import type Database from "better-sqlite3";

import type { QuestionRecord, QuestionStatus } from "../../../types/domain.js";
import { nowIso } from "../../../utils/time.js";

function mapQuestion(row: {
  id: string;
  session_id: string;
  topic: string | null;
  question_text: string;
  why_asked: string;
  what_it_tests: string;
  status: QuestionStatus;
  priority: number;
  source_turn_id: string;
  created_at: string;
  updated_at: string;
}): QuestionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    topic: row.topic,
    questionText: row.question_text,
    whyAsked: row.why_asked,
    whatItTests: row.what_it_tests,
    status: row.status,
    priority: row.priority,
    sourceTurnId: row.source_turn_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class QuestionsRepository {
  public constructor(private readonly database: Database.Database) {}

  public createMany(
    sessionId: string,
    turnId: string,
    topic: string | null,
    questions: Array<{ id: string; questionText: string; whyAsked: string; whatItTests: string; priority: number }>
  ): QuestionRecord[] {
    const insert = this.database.prepare(
      `INSERT INTO questions (
        id, session_id, topic, question_text, why_asked, what_it_tests,
        status, priority, source_turn_id, created_at, updated_at
      ) VALUES (
        @id, @sessionId, @topic, @questionText, @whyAsked, @whatItTests,
        @status, @priority, @turnId, @createdAt, @updatedAt
      )`
    );
    const timestamp = nowIso();

    const transaction = this.database.transaction(() => {
      for (const question of questions) {
        insert.run({
          ...question,
          sessionId,
          topic,
          status: "unanswered",
          turnId,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      }
    });
    transaction();

    return this.listByTurn(turnId);
  }

  public listActive(sessionId: string, limit: number): QuestionRecord[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM questions
         WHERE session_id = ? AND status = 'unanswered'
         ORDER BY priority DESC, created_at DESC
         LIMIT ?`
      )
      .all(sessionId, limit) as Array<Parameters<typeof mapQuestion>[0]>;
    return rows.map((row) => mapQuestion(row));
  }

  public listHistory(sessionId: string, status?: QuestionStatus): QuestionRecord[] {
    if (status) {
      const filteredRows = this.database
        .prepare("SELECT * FROM questions WHERE session_id = ? AND status = ? ORDER BY created_at DESC")
        .all(sessionId, status) as Array<Parameters<typeof mapQuestion>[0]>;
      return filteredRows.map((row) => mapQuestion(row));
    }

    const rows = this.database
      .prepare("SELECT * FROM questions WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId) as Array<Parameters<typeof mapQuestion>[0]>;
    return rows.map((row) => mapQuestion(row));
  }

  public listByTurn(turnId: string): QuestionRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM questions WHERE source_turn_id = ? ORDER BY created_at ASC")
      .all(turnId) as Array<Parameters<typeof mapQuestion>[0]>;
    return rows.map((row) => mapQuestion(row));
  }

  public getById(questionId: string): QuestionRecord | null {
    const row = this.database.prepare("SELECT * FROM questions WHERE id = ?").get(questionId) as Parameters<typeof mapQuestion>[0] | undefined;
    return row ? mapQuestion(row) : null;
  }

  public updateStatus(questionId: string, status: QuestionStatus): QuestionRecord {
    this.database.prepare("UPDATE questions SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), questionId);
    return this.getById(questionId)!;
  }

  public recordAnswer(input: { id: string; questionId: string; messageId: string; resolutionNote?: string | null }): void {
    this.database
      .prepare(
        `INSERT INTO question_answers (id, question_id, message_id, resolution_note, created_at)
         VALUES (@id, @questionId, @messageId, @resolutionNote, @createdAt)`
      )
      .run({
        ...input,
        resolutionNote: input.resolutionNote ?? null,
        createdAt: nowIso()
      });
  }
}