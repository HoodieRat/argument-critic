import { randomUUID } from "node:crypto";

import type { DatabaseService } from "../db/Database.js";
import { AuditLogRepository } from "../db/repositories/AuditLogRepository.js";

export class PersistenceCoordinator {
  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditLogRepository: AuditLogRepository
  ) {}

  public commit(route: string, sessionId: string | null, turnId: string | null, detail: unknown, callback: () => void): void {
    const transaction = this.databaseService.connection.transaction(() => {
      callback();
      this.auditLogRepository.create({
        id: randomUUID(),
        sessionId,
        turnId,
        route,
        action: "turn.completed",
        detail
      });
    });

    transaction();
  }
}