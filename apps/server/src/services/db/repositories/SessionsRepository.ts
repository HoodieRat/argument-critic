import type Database from "better-sqlite3";

import {
  DEFAULT_CRITICALITY_MULTIPLIER,
  DEFAULT_IMAGE_TEXT_EXTRACTION_ENABLED,
  DEFAULT_STRUCTURED_OUTPUT_ENABLED,
  MAX_CRITICALITY_MULTIPLIER,
  MIN_CRITICALITY_MULTIPLIER
} from "../../../config/constants.js";
import type { SessionMode, SessionRecord } from "../../../types/domain.js";
import { nowIso } from "../../../utils/time.js";

function normalizeCriticalityMultiplier(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CRITICALITY_MULTIPLIER;
  }

  return Number(Math.min(MAX_CRITICALITY_MULTIPLIER, Math.max(MIN_CRITICALITY_MULTIPLIER, value)).toFixed(2));
}

function normalizeStructuredOutputEnabled(value: boolean | number | null | undefined): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return DEFAULT_STRUCTURED_OUTPUT_ENABLED;
}

function normalizeImageTextExtractionEnabled(value: boolean | number | null | undefined): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return DEFAULT_IMAGE_TEXT_EXTRACTION_ENABLED;
}

function mapSession(row: {
  id: string;
  title: string;
  mode: SessionMode;
  topic: string | null;
  summary: string | null;
  source_session_id: string | null;
  source_session_mode: SessionMode | null;
  handoff_prompt: string | null;
  criticality_multiplier: number | null;
  structured_output_enabled: number | null;
  image_text_extraction_enabled: number | null;
  created_at: string;
  updated_at: string;
}): SessionRecord {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    topic: row.topic,
    summary: row.summary,
    sourceSessionId: row.source_session_id,
    sourceSessionMode: row.source_session_mode,
    handoffPrompt: row.handoff_prompt,
    criticalityMultiplier: normalizeCriticalityMultiplier(row.criticality_multiplier),
    structuredOutputEnabled: normalizeStructuredOutputEnabled(row.structured_output_enabled),
    imageTextExtractionEnabled: normalizeImageTextExtractionEnabled(row.image_text_extraction_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class SessionsRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(input: {
    id: string;
    title: string;
    mode: SessionMode;
    topic?: string | null;
    sourceSessionId?: string | null;
    sourceSessionMode?: SessionMode | null;
    handoffPrompt?: string | null;
    criticalityMultiplier?: number;
    structuredOutputEnabled?: boolean;
    imageTextExtractionEnabled?: boolean;
  }): SessionRecord {
    const timestamp = nowIso();
    this.database
      .prepare(
        `INSERT INTO sessions (
          id, title, mode, topic, summary, source_session_id, source_session_mode, handoff_prompt, criticality_multiplier, structured_output_enabled, image_text_extraction_enabled, created_at, updated_at
        ) VALUES (
          @id, @title, @mode, @topic, NULL, @sourceSessionId, @sourceSessionMode, @handoffPrompt, @criticalityMultiplier, @structuredOutputEnabled, @imageTextExtractionEnabled, @createdAt, @updatedAt
        )`
      )
      .run({
        id: input.id,
        title: input.title,
        mode: input.mode,
        topic: input.topic ?? null,
        sourceSessionId: input.sourceSessionId ?? null,
        sourceSessionMode: input.sourceSessionMode ?? null,
        handoffPrompt: input.handoffPrompt ?? null,
        criticalityMultiplier: normalizeCriticalityMultiplier(input.criticalityMultiplier),
        structuredOutputEnabled: normalizeStructuredOutputEnabled(input.structuredOutputEnabled) ? 1 : 0,
        imageTextExtractionEnabled: normalizeImageTextExtractionEnabled(input.imageTextExtractionEnabled) ? 1 : 0,
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

  public updateResponsePreferences(sessionId: string, input: {
    criticalityMultiplier?: number;
    structuredOutputEnabled?: boolean;
    imageTextExtractionEnabled?: boolean;
  }): void {
    const session = this.getById(sessionId);
    if (!session) {
      return;
    }

    const criticalityMultiplier = input.criticalityMultiplier === undefined
      ? session.criticalityMultiplier
      : normalizeCriticalityMultiplier(input.criticalityMultiplier);
    const structuredOutputEnabled = input.structuredOutputEnabled === undefined
      ? session.structuredOutputEnabled
      : normalizeStructuredOutputEnabled(input.structuredOutputEnabled);
    const imageTextExtractionEnabled = input.imageTextExtractionEnabled === undefined
      ? session.imageTextExtractionEnabled
      : normalizeImageTextExtractionEnabled(input.imageTextExtractionEnabled);

    this.database
      .prepare("UPDATE sessions SET criticality_multiplier = ?, structured_output_enabled = ?, image_text_extraction_enabled = ?, updated_at = ? WHERE id = ?")
      .run(criticalityMultiplier, structuredOutputEnabled ? 1 : 0, imageTextExtractionEnabled ? 1 : 0, nowIso(), sessionId);
  }

  public touch(sessionId: string): void {
    this.database.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(nowIso(), sessionId);
  }

  public count(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number };
    return row.count;
  }
}