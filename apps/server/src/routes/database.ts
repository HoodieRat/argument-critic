import type { FastifyInstance } from "fastify";

import type { AppServices } from "../app.js";
import type { DatabaseQueryRequest } from "../types/api.js";

export async function registerDatabaseRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.post("/database/query", async (request) => {
    const body = request.body as DatabaseQueryRequest;
    return services.databaseAgent.answer(body.sessionId, body.query, body.interpret ?? false);
  });
}