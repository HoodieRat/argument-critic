import { expect, test } from "vitest";

import type { ChatTurnResponse } from "../../src/types/api.js";
import { createTestHarness, parseJson } from "./testHarness.js";

test("question queue keeps the latest five unresolved questions and supports lifecycle actions", async () => {
  const harness = await createTestHarness();

  try {
    let sessionId = "";
    for (const term of ["better", "effective", "fair", "reasonable", "optimal", "strong"]) {
      const reply = await harness.app.inject({
        method: "POST",
        url: "/chat/turn",
        payload: {
          sessionId: sessionId || undefined,
          mode: "critic",
          message: `This plan is ${term}.`
        }
      });
      const body = parseJson<ChatTurnResponse>(reply.body);
      sessionId = body.session.id;
    }

    const activeReply = await harness.app.inject({ method: "GET", url: `/questions/active?sessionId=${sessionId}` });
    const activeBody = parseJson<{ questions: Array<{ id: string; questionText: string }> }>(activeReply.body);
    expect(activeBody.questions).toHaveLength(5);

    const historyReply = await harness.app.inject({ method: "GET", url: `/questions/history?sessionId=${sessionId}` });
    const historyBody = parseJson<{ questions: Array<{ id: string; status: string }> }>(historyReply.body);
    expect(historyBody.questions.length).toBeGreaterThanOrEqual(6);

    const firstQuestionId = activeBody.questions[0]!.id;
    const answerReply = await harness.app.inject({
      method: "POST",
      url: `/questions/${firstQuestionId}/answer`,
      payload: { sessionId, answer: "The criterion is measured retention." }
    });
    expect(parseJson<{ activeQuestions: unknown[] }>(answerReply.body).activeQuestions).toHaveLength(5);

    const secondQuestionId = activeBody.questions[1]!.id;
    const archiveReply = await harness.app.inject({
      method: "POST",
      url: `/questions/${secondQuestionId}/archive`,
      payload: { sessionId }
    });
    expect(parseJson<{ activeQuestions: unknown[] }>(archiveReply.body).activeQuestions).toHaveLength(4);

    const thirdQuestionId = activeBody.questions[2]!.id;
    const resolveReply = await harness.app.inject({
      method: "POST",
      url: `/questions/${thirdQuestionId}/resolve`,
      payload: { sessionId }
    });
    expect(parseJson<{ activeQuestions: unknown[] }>(resolveReply.body).activeQuestions).toHaveLength(3);

    const reopenReply = await harness.app.inject({
      method: "POST",
      url: `/questions/${secondQuestionId}/reopen`,
      payload: { sessionId }
    });
    expect(parseJson<{ activeQuestions: unknown[] }>(reopenReply.body).activeQuestions).toHaveLength(4);
  } finally {
    await harness.cleanup();
  }
});