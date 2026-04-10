import { randomUUID } from "node:crypto";

import type { QuestionRecord } from "../../types/domain.js";
import { MessagesRepository } from "../db/repositories/MessagesRepository.js";
import { QuestionsRepository } from "../db/repositories/QuestionsRepository.js";
import { QuestionQueueService } from "./QuestionQueueService.js";

export class QuestionResolutionService {
  public constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly questionsRepository: QuestionsRepository,
    private readonly queueService: QuestionQueueService
  ) {}

  public answerQuestion(sessionId: string, questionId: string, answer: string, resolutionNote?: string): { question: QuestionRecord; activeQuestions: QuestionRecord[] } {
    const question = this.questionsRepository.getById(questionId);
    if (!question || question.sessionId !== sessionId) {
      throw new Error("Question not found.");
    }

    const message = this.messagesRepository.create({
      id: randomUUID(),
      sessionId,
      role: "user",
      content: answer,
      provenance: "database"
    });

    this.questionsRepository.recordAnswer({
      id: randomUUID(),
      questionId,
      messageId: message.id,
      resolutionNote
    });

    const updated = this.questionsRepository.updateStatus(questionId, "answered");
    return { question: updated, activeQuestions: this.queueService.listActive(sessionId) };
  }

  public archiveQuestion(sessionId: string, questionId: string): { question: QuestionRecord; activeQuestions: QuestionRecord[] } {
    const updated = this.ensureSessionQuestion(sessionId, questionId, "archived");
    return { question: updated, activeQuestions: this.queueService.listActive(sessionId) };
  }

  public resolveQuestion(sessionId: string, questionId: string): { question: QuestionRecord; activeQuestions: QuestionRecord[] } {
    const updated = this.ensureSessionQuestion(sessionId, questionId, "resolved");
    return { question: updated, activeQuestions: this.queueService.listActive(sessionId) };
  }

  public reopenQuestion(sessionId: string, questionId: string): { question: QuestionRecord; activeQuestions: QuestionRecord[] } {
    const updated = this.ensureSessionQuestion(sessionId, questionId, "unanswered");
    return { question: updated, activeQuestions: this.queueService.listActive(sessionId) };
  }

  private ensureSessionQuestion(sessionId: string, questionId: string, nextStatus: QuestionRecord["status"]): QuestionRecord {
    const question = this.questionsRepository.getById(questionId);
    if (!question || question.sessionId !== sessionId) {
      throw new Error("Question not found.");
    }

    return this.questionsRepository.updateStatus(questionId, nextStatus);
  }
}