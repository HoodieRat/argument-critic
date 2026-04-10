import { ACTIVE_QUESTION_LIMIT } from "../../config/constants.js";
import type { QuestionRecord } from "../../types/domain.js";
import { QuestionsRepository } from "../db/repositories/QuestionsRepository.js";

export class QuestionQueueService {
  public constructor(private readonly questionsRepository: QuestionsRepository) {}

  public listActive(sessionId: string): QuestionRecord[] {
    return this.questionsRepository.listActive(sessionId, ACTIVE_QUESTION_LIMIT);
  }
}