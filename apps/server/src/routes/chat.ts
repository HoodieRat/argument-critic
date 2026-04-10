import type { FastifyInstance } from "fastify";

import type { AppServices } from "../app.js";
import type { ChatTurnRequest } from "../types/api.js";

export async function registerChatRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.post("/chat/turn", async (request) => {
    const body = request.body as ChatTurnRequest;
    return services.orchestrator.handleChatTurn(body);
  });

  app.post("/chat/cancel", async (request) => {
    const body = request.body as { sessionId: string };
    return { cancelled: services.orchestrator.cancelTurn(body.sessionId) };
  });
}