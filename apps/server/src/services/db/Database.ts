import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";

import type { Logger } from "../../logger.js";
import { ensureDirectory } from "../../utils/fs.js";

export interface DatabaseServiceOptions {
  readonly databasePath: string;
  readonly migrationsDir: string;
  readonly logger: Logger;
}

class DatabaseService {
  public readonly connection: Database.Database;

  public constructor(private readonly options: DatabaseServiceOptions) {
    this.connection = new Database(options.databasePath);
    this.connection.pragma("journal_mode = WAL");
    this.connection.pragma("foreign_keys = ON");
  }

  public async initialize(): Promise<void> {
    await ensureDirectory(dirname(this.options.databasePath));
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);

    const migrationFiles = (await readdir(this.options.migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
    const migrationRows = this.connection.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>;
    const applied = new Set(migrationRows.map((row) => String(row.id)));

    for (const file of migrationFiles) {
      if (applied.has(file)) {
        continue;
      }

      const sql = await readFile(join(this.options.migrationsDir, file), "utf8");
      const transaction = this.connection.transaction(() => {
        this.connection.exec(sql);
        this.connection
          .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
          .run(file, new Date().toISOString());
      });

      transaction();
      this.options.logger.info("Applied migration", { file });
    }
  }

  public close(): void {
    this.connection.close();
  }
}

export function createDatabaseService(options: DatabaseServiceOptions): DatabaseService {
  return new DatabaseService(options);
}

export type { DatabaseService };