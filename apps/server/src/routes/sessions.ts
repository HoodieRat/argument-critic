import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { AppServices } from "../app.js";
import type { SessionImportRequest, SessionUpdateRequest } from "../types/api.js";

function buildImportedSessionTitle(sourceTitle: string, mode: "normal_chat" | "critic" | "database" | "report" | "research_import" | "attachment_analysis"): string {
  switch (mode) {
    case "critic":
      return `Critic import: ${sourceTitle}`;
    case "research_import":
      return `Research import: ${sourceTitle}`;
    case "attachment_analysis":
      return `Capture import: ${sourceTitle}`;
    default:
      return `Chat import: ${sourceTitle}`;
  }
}

export async function registerSessionsRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.get("/sessions", async () => ({ sessions: services.sessionsRepository.list() }));

  app.post("/sessions", async (request) => {
    const body = request.body as { title?: string; mode?: "normal_chat" | "critic" | "database" | "report" | "research_import" | "attachment_analysis"; topic?: string };
    const session = services.sessionsRepository.create({
      id: randomUUID(),
      title: body.title?.trim() || "Untitled Session",
      mode: body.mode ?? "normal_chat",
      topic: body.topic ?? null
    });
    return { session };
  });

  app.post("/sessions/import", async (request, reply) => {
    const body = (request.body ?? {}) as SessionImportRequest;
    const sourceSessionId = typeof body.sourceSessionId === "string" ? body.sourceSessionId.trim() : "";
    if (!sourceSessionId) {
      reply.code(400);
      return { error: "A source session is required." };
    }

    const sourceSession = services.sessionsRepository.getById(sourceSessionId);
    if (!sourceSession) {
      reply.code(404);
      return { error: "Source session not found." };
    }

    const mode = body.mode ?? sourceSession.mode;
    const session = services.sessionsRepository.create({
      id: randomUUID(),
      title: body.title?.trim() || buildImportedSessionTitle(sourceSession.title, mode),
      mode,
      topic: sourceSession.topic ?? null
    });

    services.messagesRepository.importSessionMessages(sourceSession.id, session.id);
    services.sessionsRepository.updateSummary(session.id, sourceSession.summary);

    return { session: services.sessionsRepository.getById(session.id)! };
  });

  app.patch("/sessions/:sessionId", async (request, reply) => {
    const params = request.params as { sessionId: string };
    const body = (request.body ?? {}) as SessionUpdateRequest;
    const session = services.sessionsRepository.getById(params.sessionId);
    if (!session) {
      reply.code(404);
      return { error: "Session not found." };
    }

    const nextTitle = typeof body.title === "string" ? body.title.trim() : "";
    if (!nextTitle) {
      reply.code(400);
      return { error: "A non-empty session title is required." };
    }

    services.sessionsRepository.updateTitle(session.id, nextTitle.slice(0, 120));
    return { session: services.sessionsRepository.getById(session.id)! };
  });

  app.get("/sessions/:sessionId", async (request, reply) => {
    const params = request.params as { sessionId: string };
    const session = services.sessionsRepository.getById(params.sessionId);
    if (!session) {
      reply.code(404);
      return {
        error: "Session not found."
      };
    }

    return {
      session,
      messages: services.messagesRepository.listChronological(params.sessionId),
      activeQuestions: services.questionQueueService.listActive(params.sessionId)
    };
  });
}