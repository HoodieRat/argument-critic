import type { ClaimRecord, ContradictionRecord, DefinitionRecord, MessageRecord, QuestionRecord, ResearchFindingRecord } from "../../types/domain.js";
import { ClaimsRepository } from "../db/repositories/ClaimsRepository.js";
import { ContradictionsRepository } from "../db/repositories/ContradictionsRepository.js";
import { MessagesRepository } from "../db/repositories/MessagesRepository.js";
import { QuestionsRepository } from "../db/repositories/QuestionsRepository.js";
import { ResearchRepository } from "../db/repositories/ResearchRepository.js";

export interface RetrievedContext {
  readonly messages: MessageRecord[];
  readonly claims: ClaimRecord[];
  readonly definitions: DefinitionRecord[];
  readonly contradictions: ContradictionRecord[];
  readonly unansweredQuestions: QuestionRecord[];
  readonly researchFindings: ResearchFindingRecord[];
}

export class ContextRetrieverAgent {
  public constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly claimsRepository: ClaimsRepository,
    private readonly contradictionsRepository: ContradictionsRepository,
    private readonly questionsRepository: QuestionsRepository,
    private readonly researchRepository: ResearchRepository
  ) {}

  public retrieve(sessionId: string, includeResearch: boolean): RetrievedContext {
    const latestResearchRun = includeResearch ? this.researchRepository.listRunsBySession(sessionId)[0] ?? null : null;
    return {
      messages: this.messagesRepository.listChronological(sessionId, 12),
      claims: this.claimsRepository.listRecentClaims(sessionId, 20),
      definitions: this.claimsRepository.listDefinitions(sessionId),
      contradictions: this.contradictionsRepository.listBySession(sessionId),
      unansweredQuestions: this.questionsRepository.listActive(sessionId, 10),
      researchFindings: latestResearchRun ? this.researchRepository.listFindings(latestResearchRun.id) : []
    };
  }
}