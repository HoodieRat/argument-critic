import type Database from "better-sqlite3";

import { nowIso } from "../../../utils/time.js";

export class SettingsRepository {
  public constructor(private readonly database: Database.Database) {}

  public get<T>(key: string, fallback: T): T {
    const row = this.database.prepare("SELECT value_json FROM settings WHERE key = ?").get(key) as { value_json: string } | undefined;
    if (!row) {
      return fallback;
    }

    return JSON.parse(row.value_json) as T;
  }

  public set(key: string, value: unknown): void {
    this.database
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES (@key, @valueJson, @updatedAt)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run({ key, valueJson: JSON.stringify(value), updatedAt: nowIso() });
  }

  public delete(key: string): void {
    this.database.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
}