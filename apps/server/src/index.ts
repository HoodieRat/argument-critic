import { join } from "node:path";

import type { FastifyInstance } from "fastify";

import { createApp, type AppServices } from "./app.js";
import type { EnvironmentConfig } from "./config/env.js";
import type { Logger } from "./logger.js";
import { ensureDirectory } from "./utils/fs.js";
import { CopilotClient } from "./services/copilot/CopilotClient.js";
import { CopilotAccessTokenBroker } from "./services/copilot/CopilotAccessTokenBroker.js";
import { CopilotModelCatalog } from "./services/copilot/CopilotModelCatalog.js";
import { DefaultGitHubLoginService, type GitHubLoginAdapter, type GitHubLoginService } from "./services/copilot/GitHubLoginService.js";
import { GitHubModelsTokenStore } from "./services/copilot/GitHubModelsTokenStore.js";
import { SessionRegistry } from "./services/copilot/SessionRegistry.js";
import { createDatabaseService, type DatabaseService } from "./services/db/Database.js";
import { AuditLogRepository } from "./services/db/repositories/AuditLogRepository.js";
import { AttachmentsRepository } from "./services/db/repositories/AttachmentsRepository.js";
import { ClaimsRepository } from "./services/db/repositories/ClaimsRepository.js";
import { ContradictionsRepository } from "./services/db/repositories/ContradictionsRepository.js";
import { MessagesRepository } from "./services/db/repositories/MessagesRepository.js";
import { QuestionsRepository } from "./services/db/repositories/QuestionsRepository.js";
import { ReportsRepository } from "./services/db/repositories/ReportsRepository.js";
import { ResearchRepository } from "./services/db/repositories/ResearchRepository.js";
import { SessionsRepository } from "./services/db/repositories/SessionsRepository.js";
import { SettingsRepository } from "./services/db/repositories/SettingsRepository.js";
import { AttachmentStore } from "./services/attachments/AttachmentStore.js";
import { ImageAnalysisService } from "./services/attachments/ImageAnalysisService.js";
import { ArgumentStructurerAgent } from "./services/agents/ArgumentStructurerAgent.js";
import { ContextRetrieverAgent } from "./services/agents/ContextRetrieverAgent.js";
import { CriticAgent } from "./services/agents/CriticAgent.js";
import { DatabaseAgent } from "./services/agents/DatabaseAgent.js";
import { Orchestrator } from "./services/agents/Orchestrator.js";
import { QuestioningAgent } from "./services/agents/QuestioningAgent.js";
import { ReportBuilderAgent } from "./services/agents/ReportBuilderAgent.js";
import { ResearchAgent } from "./services/agents/ResearchAgent.js";
import { HandoffValidator } from "./services/handoff/HandoffValidator.js";
import { ArgumentParser } from "./services/parser/ArgumentParser.js";
import { DefinitionTracker } from "./services/parser/DefinitionTracker.js";
import { PersistenceCoordinator } from "./services/persistence/PersistenceCoordinator.js";
import { QuestionQueueService } from "./services/questions/QuestionQueueService.js";
import { QuestionResolutionService } from "./services/questions/QuestionResolutionService.js";
import { ProceduralReportBuilder } from "./services/reports/ProceduralReportBuilder.js";
import { ReportTemplates } from "./services/reports/ReportTemplates.js";
import { GptResearcherImporter } from "./services/research/GptResearcherImporter.js";
import { ResearchNormalizer } from "./services/research/ResearchNormalizer.js";
import { DecisionMatrix } from "./services/routing/DecisionMatrix.js";
import { TurnRouter } from "./services/routing/TurnRouter.js";
import { SessionSummaryService } from "./services/session/SessionSummaryService.js";
import type { ProcessSupervisor } from "./services/runtime/ProcessSupervisor.js";
import type { ShutdownCoordinator } from "./services/runtime/ShutdownCoordinator.js";

export interface StartServerOptions {
  readonly config: EnvironmentConfig;
  readonly githubModelsToken?: string;
  readonly githubLoginAdapter?: GitHubLoginAdapter;
  readonly githubLoginService?: GitHubLoginService;
  readonly rootDir: string;
  readonly logger: Logger;
  readonly processSupervisor: ProcessSupervisor;
  readonly shutdownCoordinator: ShutdownCoordinator;
  readonly listen?: boolean;
}

export interface ServerHandle {
  readonly app: FastifyInstance;
  readonly services: AppServices;
  readonly readyUrl: string;
  readonly stop: () => Promise<void>;
}

function createRepositories(databaseService: DatabaseService) {
  const connection = databaseService.connection;
  return {
    sessionsRepository: new SessionsRepository(connection),
    messagesRepository: new MessagesRepository(connection),
    questionsRepository: new QuestionsRepository(connection),
    claimsRepository: new ClaimsRepository(connection),
    contradictionsRepository: new ContradictionsRepository(connection),
    reportsRepository: new ReportsRepository(connection),
    attachmentsRepository: new AttachmentsRepository(connection),
    researchRepository: new ResearchRepository(connection),
    settingsRepository: new SettingsRepository(connection),
    auditLogRepository: new AuditLogRepository(connection)
  };
}

function createServices(options: StartServerOptions, databaseService: DatabaseService): AppServices {
  const repositories = createRepositories(databaseService);
  const githubModelsTokenStore = new GitHubModelsTokenStore(repositories.settingsRepository, options.logger, options.githubModelsToken);
  const githubLoginService = options.githubLoginService ?? new DefaultGitHubLoginService(githubModelsTokenStore, options.logger, {
    authMethod: options.config.githubLoginAuthMethod,
    oauthClientId: options.config.githubOAuthClientId,
    cliAdapter: options.githubLoginAdapter
  });
  const copilotAccessTokenBroker = new CopilotAccessTokenBroker(options.logger);
  const copilotModelCatalog = new CopilotModelCatalog(githubModelsTokenStore, copilotAccessTokenBroker, options.logger);
  const copilotClient = new CopilotClient(copilotModelCatalog, copilotAccessTokenBroker, githubModelsTokenStore, repositories.settingsRepository, options.config.githubModel, options.logger);
  const sessionRegistry = new SessionRegistry();
  const parser = new ArgumentParser();
  const definitionTracker = new DefinitionTracker();
  const turnRouter = new TurnRouter();
  const decisionMatrix = new DecisionMatrix();
  const contextRetriever = new ContextRetrieverAgent(
    repositories.messagesRepository,
    repositories.claimsRepository,
    repositories.contradictionsRepository,
    repositories.questionsRepository,
    repositories.researchRepository
  );
  const argumentStructurer = new ArgumentStructurerAgent(parser);
  const criticAgent = new CriticAgent(definitionTracker);
  const questioningAgent = new QuestioningAgent();
  const responseBuilder = new ReportBuilderAgent(copilotClient);
  const reportBuilder = new ProceduralReportBuilder(
    repositories.sessionsRepository,
    repositories.questionsRepository,
    repositories.contradictionsRepository,
    repositories.reportsRepository,
    repositories.researchRepository,
    new ReportTemplates()
  );
  const databaseAgent = new DatabaseAgent(
    repositories.sessionsRepository,
    repositories.questionsRepository,
    repositories.contradictionsRepository,
    repositories.reportsRepository,
    reportBuilder,
    responseBuilder
  );
  const questionQueueService = new QuestionQueueService(repositories.questionsRepository);
  const questionResolutionService = new QuestionResolutionService(
    repositories.messagesRepository,
    repositories.questionsRepository,
    questionQueueService
  );
  const attachmentStore = new AttachmentStore(options.config, repositories.attachmentsRepository);
  const imageAnalysisService = new ImageAnalysisService(repositories.attachmentsRepository, repositories.auditLogRepository, copilotClient);
  const researchAgent = new ResearchAgent(
    options.config.researchEnabled,
    repositories.settingsRepository,
    new GptResearcherImporter(repositories.researchRepository, new ResearchNormalizer())
  );
  const sessionSummaryService = new SessionSummaryService();
  const persistenceCoordinator = new PersistenceCoordinator(databaseService, repositories.auditLogRepository);
  const orchestrator = new Orchestrator(
    repositories.sessionsRepository,
    repositories.messagesRepository,
    repositories.claimsRepository,
    repositories.contradictionsRepository,
    repositories.questionsRepository,
    repositories.attachmentsRepository,
    repositories.settingsRepository,
    turnRouter,
    decisionMatrix,
    contextRetriever,
    argumentStructurer,
    criticAgent,
    questioningAgent,
    databaseAgent,
    responseBuilder,
    imageAnalysisService,
    questionQueueService,
    sessionSummaryService,
    persistenceCoordinator,
    sessionRegistry,
    new HandoffValidator()
  );

  return {
    config: options.config,
    logger: options.logger,
    databaseService,
    processSupervisor: options.processSupervisor,
    shutdownCoordinator: options.shutdownCoordinator,
    orchestrator,
    databaseAgent,
    reportBuilder,
    researchAgent,
    responseBuilder,
    githubModelsTokenStore,
    githubLoginService,
    copilotModelCatalog,
    questionQueueService,
    questionResolutionService,
    attachmentStore,
    imageAnalysisService,
    sessionsRepository: repositories.sessionsRepository,
    messagesRepository: repositories.messagesRepository,
    questionsRepository: repositories.questionsRepository,
    claimsRepository: repositories.claimsRepository,
    contradictionsRepository: repositories.contradictionsRepository,
    reportsRepository: repositories.reportsRepository,
    attachmentsRepository: repositories.attachmentsRepository,
    researchRepository: repositories.researchRepository,
    settingsRepository: repositories.settingsRepository,
    auditLogRepository: repositories.auditLogRepository
  };
}

export async function startServer(options: StartServerOptions): Promise<ServerHandle> {
  await ensureDirectory(options.config.dataDir);
  await ensureDirectory(join(options.config.dataDir, "attachments"));
  await ensureDirectory(join(options.config.dataDir, "reports"));
  await ensureDirectory(join(options.config.dataDir, "research-imports"));
  await ensureDirectory(join(options.config.dataDir, "runtime"));

  const databaseService = createDatabaseService({
    databasePath: join(options.config.dataDir, "argument-critic.sqlite"),
    migrationsDir: join(options.rootDir, "apps", "server", "src", "services", "db", "migrations"),
    logger: options.logger
  });
  await databaseService.initialize();

  const services = createServices(options, databaseService);
  if (services.githubLoginService instanceof DefaultGitHubLoginService) {
    await services.githubLoginService.hydrateExistingGitHubCliLogin();
  }
  const app = await createApp(services);
  await app.ready();

  let stopped = false;

  if (options.listen ?? true) {
    try {
      await app.listen({ host: options.config.host, port: options.config.port });
    } catch (error) {
      await app.close().catch(() => undefined);
      databaseService.close();
      throw error;
    }
  }

  return {
    app,
    services,
    readyUrl: `http://${options.config.host}:${options.config.port}`,
    stop: async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      await app.close();
      databaseService.close();
    }
  };
}