import { expect, test } from "vitest";

import type { ChatTurnResponse } from "../../src/types/api.js";
import { createTestHarness, parseJson } from "./testHarness.js";

test("question queue hard-stops at five active questions and supports clear-all plus generation toggle", async () => {
  const harness = await createTestHarness();

  try {
    const sessionReply = await harness.app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Question Queue", mode: "critic" }
    });
    const sessionId = parseJson<{ session: { id: string } }>(sessionReply.body).session.id;

    harness.server.services.questionsRepository.createMany(
      sessionId,
      "seed-turn",
      null,
      ["better", "effective", "fair", "reasonable", "optimal"].map((term, index) => ({
        id: `question-${index + 1}`,
        questionText: `What does ${term} mean in this plan?`,
        whyAsked: `The term \"${term}\" is vague without a decision rule.`,
        whatItTests: `Whether \"${term}\" has a measurable standard.`,
        priority: 100 - index
      }))
    );

    const activeReply = await harness.app.inject({ method: "GET", url: `/questions/active?sessionId=${sessionId}` });
    const activeBody = parseJson<{ questions: Array<{ id: string; questionText: string }> }>(activeReply.body);
    expect(activeBody.questions).toHaveLength(5);

    const atCapacityReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        sessionId,
        mode: "critic",
        message: "This plan is strong."
      }
    });
    const atCapacityBody = parseJson<ChatTurnResponse>(atCapacityReply.body);
    expect(atCapacityBody.targetedQuestions).toHaveLength(0);

    const historyReply = await harness.app.inject({ method: "GET", url: `/questions/history?sessionId=${sessionId}` });
    const historyBody = parseJson<{ questions: Array<{ id: string; status: string }> }>(historyReply.body);
    expect(historyBody.questions).toHaveLength(5);

    const firstQuestionId = activeBody.questions[0]!.id;
    const answerReply = await harness.app.inject({
      method: "POST",
      url: `/questions/${firstQuestionId}/answer`,
      payload: { sessionId, answer: "The criterion is measured retention." }
    });
    expect(parseJson<{ activeQuestions: unknown[] }>(answerReply.body).activeQuestions).toHaveLength(4);

    const secondQuestionId = activeBody.questions[1]!.id;
    const archiveReply = await harness.app.inject({
      method: "POST",
      url: `/questions/${secondQuestionId}/archive`,
      payload: { sessionId }
    });
    expect(parseJson<{ activeQuestions: unknown[] }>(archiveReply.body).activeQuestions).toHaveLength(3);

    const thirdQuestionId = activeBody.questions[2]!.id;
    const resolveReply = await harness.app.inject({
      method: "POST",
      url: `/questions/${thirdQuestionId}/resolve`,
      payload: { sessionId }
    });
    expect(parseJson<{ activeQuestions: unknown[] }>(resolveReply.body).activeQuestions).toHaveLength(2);

    const reopenReply = await harness.app.inject({
      method: "POST",
      url: `/questions/${secondQuestionId}/reopen`,
      payload: { sessionId }
    });
    expect(parseJson<{ activeQuestions: unknown[] }>(reopenReply.body).activeQuestions).toHaveLength(3);

    const clearReply = await harness.app.inject({
      method: "POST",
      url: "/questions/clear-all",
      payload: { sessionId }
    });
    expect(parseJson<{ activeQuestions: unknown[] }>(clearReply.body).activeQuestions).toHaveLength(0);

    const settingsOffReply = await harness.app.inject({
      method: "PUT",
      url: "/runtime/settings",
      payload: { questionGenerationEnabled: false }
    });
    expect(parseJson<{ questionGenerationEnabled: boolean }>(settingsOffReply.body).questionGenerationEnabled).toBe(false);

    const noQuestionReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        sessionId,
        mode: "critic",
        message: "This plan is still unclear."
      }
    });
    const noQuestionBody = parseJson<ChatTurnResponse>(noQuestionReply.body);
    expect(noQuestionBody.activeQuestions).toHaveLength(0);
    expect(noQuestionBody.targetedQuestions).toHaveLength(0);

    const settingsOnReply = await harness.app.inject({
      method: "PUT",
      url: "/runtime/settings",
      payload: { questionGenerationEnabled: true }
    });
    expect(parseJson<{ questionGenerationEnabled: boolean }>(settingsOnReply.body).questionGenerationEnabled).toBe(true);

    const resumedReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        sessionId,
        mode: "critic",
        message: "This plan is vague again."
      }
    });
    const resumedBody = parseJson<ChatTurnResponse>(resumedReply.body);
    expect(resumedBody.activeQuestions.length).toBeGreaterThan(0);
    expect(resumedBody.targetedQuestions.length).toBeGreaterThan(0);
  } finally {
    await harness.cleanup();
  }
}, 25_000);