import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { AppServices } from "../app.js";
import type { SessionImportRequest, SessionUpdateRequest } from "../types/api.js";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function describeSessionMode(mode: "normal_chat" | "critic" | "database" | "report" | "research_import" | "attachment_analysis"): string {
  switch (mode) {
    case "critic":
      return "Critic";
    case "research_import":
      return "Reviewer";
    case "attachment_analysis":
      return "Capture";
    case "database":
      return "Database";
    case "report":
      return "Report";
    default:
      return "Chat";
  }
}

function buildImportedSessionTitle(sourceTitle: string, mode: "normal_chat" | "critic" | "database" | "report" | "research_import" | "attachment_analysis"): string {
  switch (mode) {
    case "critic":
      return `Critic import: ${sourceTitle}`;
    case "research_import":
      return `Reviewer import: ${sourceTitle}`;
    case "attachment_analysis":
      return `Capture import: ${sourceTitle}`;
    default:
      return `Chat import: ${sourceTitle}`;
  }
}

function buildImportedSessionHandoffPrompt(
  sourceTitle: string,
  sourceMode: "normal_chat" | "critic" | "database" | "report" | "research_import" | "attachment_analysis",
  targetMode: "normal_chat" | "critic" | "database" | "report" | "research_import" | "attachment_analysis"
): string {
  const sourceLabel = describeSessionMode(sourceMode);

  switch (targetMode) {
    case "critic":
      return `Imported from the ${sourceLabel} session \"${sourceTitle}\". Treat the copied conversation in this session as the case to challenge. Do not restart from scratch. Identify contradictions, weak assumptions, vague terms, unsupported steps, and ask direct follow-up questions tied to the imported material.`;
    case "research_import":
      return `Imported from the ${sourceLabel} session \"${sourceTitle}\". Treat the copied conversation in this session as material to review. State what the material supports, what it does not prove, what still needs verification, and what question should be answered next before relying on it.`;
    default:
      return `Imported from the ${sourceLabel} session \"${sourceTitle}\". Use the copied conversation in this session as the working context for this lane and continue from the imported material instead of starting over.`;
  }
}

export async function registerSessionsRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.get("/sessions", async () => ({ sessions: services.sessionsRepository.list() }));

  app.post("/sessions", async (request) => {
    const body = request.body as {
      title?: string;
      mode?: "normal_chat" | "critic" | "database" | "report" | "research_import" | "attachment_analysis";
      topic?: string;
      criticalityMultiplier?: number;
      structuredOutputEnabled?: boolean;
      imageTextExtractionEnabled?: boolean;
    };
    const session = services.sessionsRepository.create({
      id: randomUUID(),
      title: body.title?.trim() || "Untitled Session",
      mode: body.mode ?? "normal_chat",
      topic: body.topic ?? null,
      criticalityMultiplier: body.criticalityMultiplier,
      structuredOutputEnabled: body.structuredOutputEnabled,
      imageTextExtractionEnabled: body.imageTextExtractionEnabled
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
      topic: sourceSession.topic ?? null,
      sourceSessionId: sourceSession.id,
      sourceSessionMode: sourceSession.mode,
      handoffPrompt: buildImportedSessionHandoffPrompt(sourceSession.title, sourceSession.mode, mode),
      criticalityMultiplier: sourceSession.criticalityMultiplier,
      structuredOutputEnabled: sourceSession.structuredOutputEnabled,
      imageTextExtractionEnabled: sourceSession.imageTextExtractionEnabled
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

    const nextTitle = typeof body.title === "string" ? body.title.trim() : undefined;
    if (body.title !== undefined && !nextTitle) {
      reply.code(400);
      return { error: "A non-empty session title is required." };
    }

    if (body.criticalityMultiplier !== undefined && !isFiniteNumber(body.criticalityMultiplier)) {
      reply.code(400);
      return { error: "criticalityMultiplier must be a finite number." };
    }

    if (body.structuredOutputEnabled !== undefined && typeof body.structuredOutputEnabled !== "boolean") {
      reply.code(400);
      return { error: "structuredOutputEnabled must be a boolean." };
    }

    if (body.imageTextExtractionEnabled !== undefined && typeof body.imageTextExtractionEnabled !== "boolean") {
      reply.code(400);
      return { error: "imageTextExtractionEnabled must be a boolean." };
    }

    if (nextTitle === undefined && body.criticalityMultiplier === undefined && body.structuredOutputEnabled === undefined && body.imageTextExtractionEnabled === undefined) {
      reply.code(400);
      return { error: "At least one session field must be updated." };
    }

    if (nextTitle !== undefined) {
      services.sessionsRepository.updateTitle(session.id, nextTitle.slice(0, 120));
    }

    if (body.criticalityMultiplier !== undefined || body.structuredOutputEnabled !== undefined || body.imageTextExtractionEnabled !== undefined) {
      services.sessionsRepository.updateResponsePreferences(session.id, {
        criticalityMultiplier: body.criticalityMultiplier,
        structuredOutputEnabled: body.structuredOutputEnabled,
        imageTextExtractionEnabled: body.imageTextExtractionEnabled
      });
    }

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