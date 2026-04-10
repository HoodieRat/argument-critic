import { randomUUID } from "node:crypto";

import type { ChatTurnRequest, ChatTurnResponse } from "../../types/api.js";
import type { ResponseProvenance, SessionMode, SessionRecord } from "../../types/domain.js";
import { HandoffValidator } from "../handoff/HandoffValidator.js";
import type { HandoffPacket } from "../handoff/HandoffPacket.js";
import { ClaimsRepository } from "../db/repositories/ClaimsRepository.js";
import { ContradictionsRepository } from "../db/repositories/ContradictionsRepository.js";
import { MessagesRepository } from "../db/repositories/MessagesRepository.js";
import { QuestionsRepository } from "../db/repositories/QuestionsRepository.js";
import { SessionsRepository } from "../db/repositories/SessionsRepository.js";
import { SettingsRepository } from "../db/repositories/SettingsRepository.js";
import { SessionRegistry } from "../copilot/SessionRegistry.js";
import { QuestionQueueService } from "../questions/QuestionQueueService.js";
import { PersistenceCoordinator } from "../persistence/PersistenceCoordinator.js";
import { SessionSummaryService } from "../session/SessionSummaryService.js";
import { DecisionMatrix } from "../routing/DecisionMatrix.js";
import { TurnRouter } from "../routing/TurnRouter.js";
import { DatabaseAgent } from "./DatabaseAgent.js";
import { ReportBuilderAgent } from "./ReportBuilderAgent.js";
import { QuestioningAgent } from "./QuestioningAgent.js";
import { CriticAgent } from "./CriticAgent.js";
import { ArgumentStructurerAgent } from "./ArgumentStructurerAgent.js";
import { ContextRetrieverAgent } from "./ContextRetrieverAgent.js";

const DEFAULT_SESSION_TITLES = new Set(["Untitled Session", "Working Session"]);

function buildAutoSessionTitle(message: string): string {
  const normalized = message
    .replace(/\s+/g, " ")
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .trim();
  const firstSentence = normalized.split(/(?<=[.!?])\s/, 1)[0] ?? normalized;
  const title = firstSentence.slice(0, 72).trim();
  return title.length > 0 ? title : "Untitled Session";
}

export class Orchestrator {
  public constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly messagesRepository: MessagesRepository,
    private readonly claimsRepository: ClaimsRepository,
    private readonly contradictionsRepository: ContradictionsRepository,
    private readonly questionsRepository: QuestionsRepository,
    private readonly settingsRepository: SettingsRepository,
    private readonly turnRouter: TurnRouter,
    private readonly decisionMatrix: DecisionMatrix,
    private readonly contextRetriever: ContextRetrieverAgent,
    private readonly argumentStructurer: ArgumentStructurerAgent,
    private readonly criticAgent: CriticAgent,
    private readonly questioningAgent: QuestioningAgent,
    private readonly databaseAgent: DatabaseAgent,
    private readonly reportBuilder: ReportBuilderAgent,
    private readonly questionQueueService: QuestionQueueService,
    private readonly sessionSummaryService: SessionSummaryService,
    private readonly persistenceCoordinator: PersistenceCoordinator,
    private readonly sessionRegistry: SessionRegistry,
    private readonly handoffValidator: HandoffValidator
  ) {}

  public async handleChatTurn(request: ChatTurnRequest): Promise<ChatTurnResponse> {
    const session = this.ensureSession(request.sessionId, request.mode, request.topic, request.message);
    const shouldAutoTitle = this.shouldAutoTitleSession(session);
    const autoTitle = shouldAutoTitle && this.settingsRepository.get("session.autoTitleEnabled", true)
      ? buildAutoSessionTitle(request.message)
      : null;
    return this.sessionRegistry.runExclusive(session.id, async (signal) => {
      const turnId = randomUUID();
      const route = this.turnRouter.route(request.mode, request.message);
      const context = this.contextRetriever.retrieve(session.id, request.includeResearch ?? false);
      const strategy = this.decisionMatrix.determine({ route, hasStoredMatches: context.messages.length > 0 });
      const packet: HandoffPacket = {
        turn_id: turnId,
        session_id: session.id,
        mode: request.mode,
        user_asked: request.message,
        answered_so_far: "",
        new_facts: [],
        new_records_written: [],
        records_updated: [],
        records_read: ["messages", "questions", "claims", "contradictions"],
        questions_asked_now: [],
        active_question_queue_delta: [],
        unresolved_items: [],
        next_required_agent: route === "database" ? "DatabaseAgent" : "ArgumentStructurerAgent",
        must_not_drift: ["mode", "question queue state", "contradiction visibility"],
        procedural_only_items: route === "database" ? [request.message] : [],
        ai_only_items: route === "database" ? [] : [request.message]
      };
      this.handoffValidator.validate(packet);

      if (route === "database") {
        const databaseResponse = await this.databaseAgent.answer(session.id, request.message, strategy === "hybrid", signal);
        const userMessageId = randomUUID();
        const assistantMessageId = randomUUID();
        this.persistenceCoordinator.commit(route, session.id, turnId, { strategy, route }, () => {
          this.messagesRepository.create({
            id: userMessageId,
            sessionId: session.id,
            role: "user",
            content: request.message,
            provenance: "database"
          });
          this.messagesRepository.create({
            id: assistantMessageId,
            sessionId: session.id,
            role: "assistant",
            content: databaseResponse.answer,
            provenance: databaseResponse.provenance
          });
          if (autoTitle) {
            this.sessionsRepository.updateTitle(session.id, autoTitle);
          }
          this.sessionsRepository.touch(session.id);
          this.sessionsRepository.updateSummary(
            session.id,
            this.sessionSummaryService.buildSummary(this.messagesRepository.listChronological(session.id), this.questionQueueService.listActive(session.id))
          );
        });

        return {
          session: this.sessionsRepository.getById(session.id)!,
          answer: databaseResponse.answer,
          provenance: databaseResponse.provenance,
          messages: this.messagesRepository.listChronological(session.id),
          activeQuestions: this.questionQueueService.listActive(session.id),
          targetedQuestions: [],
          route
        };
      }

      const structured = this.argumentStructurer.structure(request.message);
      const criticResult = this.criticAgent.critique(request.message, structured, context);
      const questions = this.questioningAgent.generate(criticResult.findings, context.unansweredQuestions);
      const answer = await this.reportBuilder.composeChatResponse({
        mode: request.mode,
        message: request.message,
        structured,
        criticResult,
        questions,
        context,
        signal
      });

      const userMessageId = randomUUID();
      const assistantMessageId = randomUUID();
      const targetedQuestionIds = questions.map((question) => ({ id: randomUUID(), ...question }));
      this.persistenceCoordinator.commit(route, session.id, turnId, { strategy, route, findings: criticResult.findings.length }, () => {
        this.messagesRepository.create({
          id: userMessageId,
          sessionId: session.id,
          role: "user",
          content: request.message,
          provenance: "ai"
        });
        this.claimsRepository.createClaims(session.id, userMessageId, structured.claims);
        this.claimsRepository.createDefinitions(session.id, userMessageId, structured.definitions);
        this.claimsRepository.createAssumptions(session.id, userMessageId, structured.assumptions);
        this.claimsRepository.createObjections(session.id, criticResult.objections.map((objection) => ({ id: randomUUID(), ...objection })));
        this.contradictionsRepository.createMany(session.id, criticResult.contradictions.map((record) => ({ id: randomUUID(), ...record })));
        this.messagesRepository.create({
          id: assistantMessageId,
          sessionId: session.id,
          role: "assistant",
          content: answer,
          provenance: this.resolveProvenance(route, strategy)
        });
        this.questionsRepository.createMany(session.id, turnId, request.topic ?? session.topic, targetedQuestionIds);
        if (autoTitle) {
          this.sessionsRepository.updateTitle(session.id, autoTitle);
        }
        this.sessionsRepository.updateMode(session.id, request.mode);
        this.sessionsRepository.updateSummary(
          session.id,
          this.sessionSummaryService.buildSummary(this.messagesRepository.listChronological(session.id), this.questionQueueService.listActive(session.id))
        );
      });

      return {
        session: this.sessionsRepository.getById(session.id)!,
        answer,
        provenance: this.resolveProvenance(route, strategy),
        messages: this.messagesRepository.listChronological(session.id),
        activeQuestions: this.questionQueueService.listActive(session.id),
        targetedQuestions: this.questionsRepository.listByTurn(turnId),
        route
      };
    });
  }

  public cancelTurn(sessionId: string): boolean {
    return this.sessionRegistry.cancel(sessionId);
  }

  private ensureSession(sessionId: string | undefined, mode: SessionMode, topic: string | undefined, message: string): SessionRecord {
    if (sessionId) {
      const existing = this.sessionsRepository.getById(sessionId);
      if (existing) {
        return existing;
      }
    }

    const titleSource = topic?.trim() || message.trim().split(/\r?\n/, 1)[0] || "Untitled Session";
    return this.sessionsRepository.create({
      id: randomUUID(),
      title: titleSource.slice(0, 80),
      mode,
      topic: topic ?? null
    });
  }

  private resolveProvenance(route: string, strategy: string): ResponseProvenance {
    if (route === "database") {
      return strategy === "hybrid" ? "hybrid" : "database";
    }

    return strategy === "hybrid" ? "hybrid" : "ai";
  }

  private shouldAutoTitleSession(session: SessionRecord): boolean {
    if (!DEFAULT_SESSION_TITLES.has(session.title.trim())) {
      return false;
    }

    return this.messagesRepository.listChronological(session.id, 1).length === 0;
  }
}