import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { ChatTurnRequest, ChatTurnResponse } from "../../types/api.js";
import type { AttachmentRecord, ResponseProvenance, SessionMode, SessionRecord } from "../../types/domain.js";
import { ACTIVE_QUESTION_LIMIT } from "../../config/constants.js";
import type { CopilotCompletionRequest } from "../copilot/CopilotClient.js";
import { HandoffValidator } from "../handoff/HandoffValidator.js";
import type { HandoffPacket } from "../handoff/HandoffPacket.js";
import { AttachmentsRepository } from "../db/repositories/AttachmentsRepository.js";
import { ClaimsRepository } from "../db/repositories/ClaimsRepository.js";
import { ContradictionsRepository } from "../db/repositories/ContradictionsRepository.js";
import { MessagesRepository } from "../db/repositories/MessagesRepository.js";
import { QuestionsRepository } from "../db/repositories/QuestionsRepository.js";
import { SessionsRepository } from "../db/repositories/SessionsRepository.js";
import { SettingsRepository } from "../db/repositories/SettingsRepository.js";
import { ImageAnalysisService } from "../attachments/ImageAnalysisService.js";
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
const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_EXTRACTED_IMAGE_TEXT_CHARS = 6_000;

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
    private readonly attachmentsRepository: AttachmentsRepository,
    private readonly settingsRepository: SettingsRepository,
    private readonly turnRouter: TurnRouter,
    private readonly decisionMatrix: DecisionMatrix,
    private readonly contextRetriever: ContextRetrieverAgent,
    private readonly argumentStructurer: ArgumentStructurerAgent,
    private readonly criticAgent: CriticAgent,
    private readonly questioningAgent: QuestioningAgent,
    private readonly databaseAgent: DatabaseAgent,
    private readonly reportBuilder: ReportBuilderAgent,
    private readonly imageAnalysisService: ImageAnalysisService,
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
      const attachmentIds = [...new Set((request.attachmentIds ?? []).map((attachmentId) => attachmentId.trim()).filter(Boolean))];
      const attachmentPayload = attachmentIds.length > 0 ? await this.buildAttachmentPayload(session, attachmentIds) : {
        attachmentContext: [],
        imageAttachments: []
      };
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
          this.messagesRepository.linkAttachments(userMessageId, attachmentIds);
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
      const criticResult = this.criticAgent.critique(request.message, structured, context, {
        criticalityMultiplier: session.criticalityMultiplier
      });
      const questionGenerationEnabled = this.settingsRepository.get("questions.generationEnabled", true);
      const questionQueueAtCapacity = context.unansweredQuestions.length >= ACTIVE_QUESTION_LIMIT;
      const questions = questionGenerationEnabled && !questionQueueAtCapacity
        ? this.questioningAgent.generate({
            mode: request.mode,
            currentMessage: request.message,
            findings: criticResult.findings,
            existingQuestions: context.unansweredQuestions,
            recentMessages: context.messages,
            claims: context.claims,
            definitions: context.definitions,
            contradictions: context.contradictions,
            criticalityMultiplier: session.criticalityMultiplier
          })
        : [];
      const answer = await this.reportBuilder.composeChatResponse({
        mode: request.mode,
        message: request.message,
        structured,
        criticResult,
        questions,
        context,
        attachmentContext: attachmentPayload.attachmentContext,
        imageAttachments: attachmentPayload.imageAttachments,
        handoffPrompt: session.handoffPrompt,
        sessionPreferences: {
          criticalityMultiplier: session.criticalityMultiplier,
          structuredOutputEnabled: session.structuredOutputEnabled
        },
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
        this.messagesRepository.linkAttachments(userMessageId, attachmentIds);
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

  private async buildAttachmentPayload(
    session: SessionRecord,
    attachmentIds: string[]
  ): Promise<{
    attachmentContext: string[];
    imageAttachments: NonNullable<CopilotCompletionRequest["imageAttachments"]>;
  }> {
    const attachments = this.attachmentsRepository.listByIds(attachmentIds);
    const attachmentContext: string[] = [];
    const imageAttachments: NonNullable<CopilotCompletionRequest["imageAttachments"]> = [];

    for (const attachment of attachments) {
      const prepared = await this.describeAttachment(session, attachment);
      attachmentContext.push(prepared.summary);
      if (prepared.imageAttachment) {
        imageAttachments.push(prepared.imageAttachment);
      }
    }

    return {
      attachmentContext,
      imageAttachments
    };
  }

  private async describeAttachment(
    session: SessionRecord,
    attachment: AttachmentRecord
  ): Promise<{
    summary: string;
    imageAttachment?: NonNullable<CopilotCompletionRequest["imageAttachments"]>[number];
  }> {
    const label = attachment.displayName ?? "Attachment";
    if (attachment.mimeType.startsWith("image/")) {
      const capture = this.attachmentsRepository.getCaptureByAttachmentId(attachment.id);
      const summary = this.imageAnalysisService.analyze(session.id, attachment.id, capture?.id);
      if (session.imageTextExtractionEnabled) {
        const extractedText = await this.imageAnalysisService.extractText(session.id, attachment.id);
        if (extractedText) {
          return {
            summary: this.buildExtractedImageTextSummary(summary, extractedText)
          };
        }
      }

      const imageAttachment = await this.buildInlineImageAttachment(attachment);
      return {
        summary: imageAttachment
          ? `${label} (${attachment.mimeType}): ${summary}${session.imageTextExtractionEnabled ? " Text extraction was unavailable for this turn, so inspect the attached image directly instead." : " Inspect the attached image directly for the actual visual content."}`
          : `${label} (${attachment.mimeType}): ${summary} The image bytes could not be attached directly for this turn, so rely on the user's description if needed.`,
        imageAttachment
      };
    }

    if (this.isTextLikeAttachment(attachment)) {
      try {
        const content = await readFile(attachment.path, "utf8");
        const excerpt = content.replace(/\s+/g, " ").trim();
        const preview = excerpt.length > 1400 ? `${excerpt.slice(0, 1400).trim()}...` : excerpt;
        return {
          summary: preview
            ? `${label} (${attachment.mimeType}): ${preview}`
            : `${label} (${attachment.mimeType}): The attached file is empty.`
        };
      } catch {
        return {
          summary: `${label} (${attachment.mimeType}): Attached as reference, but the file could not be read as text.`
        };
      }
    }

    return {
      summary: `${label} (${attachment.mimeType}): Attached as reference. This file type is not parsed directly, so rely on the user's prompt for what to inspect.`
    };
  }

  private async buildInlineImageAttachment(
    attachment: AttachmentRecord
  ): Promise<NonNullable<CopilotCompletionRequest["imageAttachments"]>[number] | undefined> {
    try {
      const bytes = await readFile(attachment.path);
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_INLINE_IMAGE_BYTES) {
        return undefined;
      }

      return {
        label: attachment.displayName ?? "Attachment image",
        mimeType: attachment.mimeType,
        dataUrl: `data:${attachment.mimeType};base64,${bytes.toString("base64")}`
      };
    } catch {
      return undefined;
    }
  }

  private buildExtractedImageTextSummary(summary: string, extractedText: string): string {
    const trimmed = extractedText.trim();
    if (!trimmed) {
      return summary;
    }

    if (trimmed === "[no readable text]") {
      return `${summary} No readable text was detected in the image.`;
    }

    const preview = trimmed.length > MAX_EXTRACTED_IMAGE_TEXT_CHARS
      ? `${trimmed.slice(0, MAX_EXTRACTED_IMAGE_TEXT_CHARS).trim()}... [truncated]`
      : trimmed;

    return `${summary} Visible text extracted from the image:\n${preview}`;
  }

  private isTextLikeAttachment(attachment: AttachmentRecord): boolean {
    if (attachment.mimeType.startsWith("text/")) {
      return true;
    }

    if (["application/json", "application/xml", "application/javascript"].includes(attachment.mimeType)) {
      return true;
    }

    const displayName = (attachment.displayName ?? attachment.path).toLowerCase();
    return [".txt", ".md", ".json", ".csv", ".ts", ".tsx", ".js", ".jsx", ".py", ".html", ".css", ".sql", ".yml", ".yaml", ".xml"].some((extension) => displayName.endsWith(extension));
  }
}