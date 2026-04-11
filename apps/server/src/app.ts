import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";

import { MANAGED_EXTENSION_ID } from "./config/constants.js";
import type { EnvironmentConfig } from "./config/env.js";
import type { Logger } from "./logger.js";
import type { DatabaseService } from "./services/db/Database.js";
import type { AuditLogRepository } from "./services/db/repositories/AuditLogRepository.js";
import type { AttachmentsRepository } from "./services/db/repositories/AttachmentsRepository.js";
import type { ClaimsRepository } from "./services/db/repositories/ClaimsRepository.js";
import type { ContradictionsRepository } from "./services/db/repositories/ContradictionsRepository.js";
import type { MessagesRepository } from "./services/db/repositories/MessagesRepository.js";
import type { QuestionsRepository } from "./services/db/repositories/QuestionsRepository.js";
import type { ReportsRepository } from "./services/db/repositories/ReportsRepository.js";
import type { ResearchRepository } from "./services/db/repositories/ResearchRepository.js";
import type { SessionsRepository } from "./services/db/repositories/SessionsRepository.js";
import type { SettingsRepository } from "./services/db/repositories/SettingsRepository.js";
import type { AttachmentStore } from "./services/attachments/AttachmentStore.js";
import type { ImageAnalysisService } from "./services/attachments/ImageAnalysisService.js";
import type { Orchestrator } from "./services/agents/Orchestrator.js";
import type { DatabaseAgent } from "./services/agents/DatabaseAgent.js";
import type { ReportBuilderAgent } from "./services/agents/ReportBuilderAgent.js";
import type { ResearchAgent } from "./services/agents/ResearchAgent.js";
import type { GitHubModelsTokenStore } from "./services/copilot/GitHubModelsTokenStore.js";
import type { GitHubLoginService } from "./services/copilot/GitHubLoginService.js";
import type { CopilotModelCatalog } from "./services/copilot/CopilotModelCatalog.js";
import type { ProceduralReportBuilder } from "./services/reports/ProceduralReportBuilder.js";
import type { QuestionQueueService } from "./services/questions/QuestionQueueService.js";
import type { QuestionResolutionService } from "./services/questions/QuestionResolutionService.js";
import type { ProcessSupervisor } from "./services/runtime/ProcessSupervisor.js";
import type { ShutdownCoordinator } from "./services/runtime/ShutdownCoordinator.js";
import { registerCaptureRoutes } from "./routes/capture.js";
import { registerAttachmentsRoutes } from "./routes/attachments.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerDatabaseRoutes } from "./routes/database.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerQuestionsRoutes } from "./routes/questions.js";
import { registerReportsRoutes } from "./routes/reports.js";
import { registerResearchRoutes } from "./routes/research.js";
import { registerRuntimeRoutes } from "./routes/runtime.js";
import { registerSessionsRoutes } from "./routes/sessions.js";

export interface AppServices {
  readonly config: EnvironmentConfig;
  readonly logger: Logger;
  readonly databaseService: DatabaseService;
  readonly sessionsRepository: SessionsRepository;
  readonly messagesRepository: MessagesRepository;
  readonly questionsRepository: QuestionsRepository;
  readonly claimsRepository: ClaimsRepository;
  readonly contradictionsRepository: ContradictionsRepository;
  readonly reportsRepository: ReportsRepository;
  readonly attachmentsRepository: AttachmentsRepository;
  readonly researchRepository: ResearchRepository;
  readonly settingsRepository: SettingsRepository;
  readonly auditLogRepository: AuditLogRepository;
  readonly orchestrator: Orchestrator;
  readonly databaseAgent: DatabaseAgent;
  readonly reportBuilder: ProceduralReportBuilder;
  readonly researchAgent: ResearchAgent;
  readonly responseBuilder: ReportBuilderAgent;
  readonly githubModelsTokenStore: GitHubModelsTokenStore;
  readonly githubLoginService: GitHubLoginService;
  readonly copilotModelCatalog: CopilotModelCatalog;
  readonly questionQueueService: QuestionQueueService;
  readonly questionResolutionService: QuestionResolutionService;
  readonly attachmentStore: AttachmentStore;
  readonly imageAnalysisService: ImageAnalysisService;
  readonly processSupervisor: ProcessSupervisor;
  readonly shutdownCoordinator: ShutdownCoordinator;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const MANAGED_EXTENSION_ORIGIN = `chrome-extension://${MANAGED_EXTENSION_ID}`;

function readHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }

  return typeof value === "string" ? value : "";
}

function normalizeHost(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("[")) {
    const closingBracketIndex = normalized.indexOf("]");
    return closingBracketIndex >= 0 ? normalized.slice(1, closingBracketIndex) : normalized;
  }

  const firstColonIndex = normalized.indexOf(":");
  return firstColonIndex >= 0 ? normalized.slice(0, firstColonIndex) : normalized;
}

function isTrustedLoopbackHost(value: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeHost(value));
}

function isTrustedLoopbackOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isTrustedExtensionOrigin(origin: string): boolean {
  return origin.trim().toLowerCase() === MANAGED_EXTENSION_ORIGIN;
}

function isTrustedDesktopOrigin(origin: string, userAgent: string): boolean {
  return origin.trim().toLowerCase() === "null" && /electron/i.test(userAgent);
}

function isTrustedCorsOrigin(origin: string | undefined): boolean {
  if (origin === undefined) {
    return true;
  }

  const normalized = origin.trim().toLowerCase();
  return normalized === "null" || isTrustedLoopbackOrigin(normalized) || isTrustedExtensionOrigin(normalized);
}

export async function createApp(services: AppServices): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors as unknown as FastifyPluginAsync<Record<string, unknown>>, {
    origin: (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void): void => {
      callback(null, isTrustedCorsOrigin(origin));
    }
  });
  await app.register(multipart as unknown as FastifyPluginAsync);

  app.addHook("onRequest", async (request, reply) => {
    const host = readHeaderValue(request.headers.host);
    if (host && !isTrustedLoopbackHost(host)) {
      await reply.code(403).send("Argument Critic only accepts localhost requests.");
      return reply;
    }

    const origin = readHeaderValue(request.headers.origin);
    if (!origin) {
      return;
    }

    const userAgent = readHeaderValue(request.headers["user-agent"]);
    if (isTrustedLoopbackOrigin(origin) || isTrustedExtensionOrigin(origin) || isTrustedDesktopOrigin(origin, userAgent)) {
      return;
    }

    await reply.code(403).send("Argument Critic rejected an untrusted browser origin.");
    return reply;
  });

  await registerHealthRoutes(app, services);
  await registerRuntimeRoutes(app, services);
  await registerSessionsRoutes(app, services);
  await registerChatRoutes(app, services);
  await registerDatabaseRoutes(app, services);
  await registerQuestionsRoutes(app, services);
  await registerReportsRoutes(app, services);
  await registerAttachmentsRoutes(app, services);
  await registerCaptureRoutes(app, services);
  await registerResearchRoutes(app, services);

  return app;
}