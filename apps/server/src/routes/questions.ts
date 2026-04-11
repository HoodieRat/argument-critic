import type { FastifyInstance } from "fastify";

import type { AppServices } from "../app.js";
import type { QuestionAnswerRequest } from "../types/api.js";
import type { QuestionStatus } from "../types/domain.js";

export async function registerQuestionsRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.get("/questions/active", async (request) => {
    const query = request.query as { sessionId: string };
    return { questions: services.questionQueueService.listActive(query.sessionId) };
  });

  app.get("/questions/history", async (request) => {
    const query = request.query as { sessionId: string; status?: QuestionStatus };
    return {
      questions: services.questionsRepository.listHistory(query.sessionId, query.status)
    };
  });

  app.post("/questions/:questionId/answer", async (request) => {
    const params = request.params as { questionId: string };
    const body = request.body as QuestionAnswerRequest & { sessionId: string };
    return services.questionResolutionService.answerQuestion(body.sessionId, params.questionId, body.answer, body.resolutionNote);
  });

  app.post("/questions/:questionId/archive", async (request) => {
    const params = request.params as { questionId: string };
    const body = request.body as { sessionId: string };
    return services.questionResolutionService.archiveQuestion(body.sessionId, params.questionId);
  });

  app.post("/questions/:questionId/resolve", async (request) => {
    const params = request.params as { questionId: string };
    const body = request.body as { sessionId: string };
    return services.questionResolutionService.resolveQuestion(body.sessionId, params.questionId);
  });

  app.post("/questions/:questionId/reopen", async (request) => {
    const params = request.params as { questionId: string };
    const body = request.body as { sessionId: string };
    return services.questionResolutionService.reopenQuestion(body.sessionId, params.questionId);
  });

  app.post("/questions/clear-all", async (request) => {
    const body = request.body as { sessionId: string };
    services.questionsRepository.clearAllActive(body.sessionId);
    return {
      activeQuestions: services.questionQueueService.listActive(body.sessionId)
    };
  });
}