import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";

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

export async function createApp(services: AppServices): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await app.register(multipart);

  await registerHealthRoutes(app, services);
  await registerRuntimeRoutes(app, services);
  await registerSessionsRoutes(app, services);
  await registerChatRoutes(app, services);
  await registerDatabaseRoutes(app, services);
  await registerQuestionsRoutes(app, services);
  await registerReportsRoutes(app, services);
  await registerCaptureRoutes(app, services);
  await registerResearchRoutes(app, services);

  return app;
}