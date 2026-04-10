import type { FastifyInstance } from "fastify";

import type { AppServices } from "../app.js";
import type { ResearchImportRequest } from "../types/api.js";

export async function registerResearchRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.get("/research", async (request) => {
    const query = request.query as { sessionId: string };
    return { runs: services.researchRepository.listRunsBySession(query.sessionId) };
  });

  app.post("/research/import", async (request) => {
    const body = request.body as ResearchImportRequest;
    return services.researchAgent.import(body.sessionId, body.payload, body.provider ?? "gpt-researcher", body.enabledForContext);
  });
}