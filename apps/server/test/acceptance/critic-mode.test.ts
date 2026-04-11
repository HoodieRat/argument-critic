import { expect, test } from "vitest";

import type { ChatTurnResponse, DatabaseQueryResponse } from "../../src/types/api.js";
import { createTestHarness, parseJson } from "./testHarness.js";

test("critic mode surfaces contradictions and asks targeted questions", async () => {
  const harness = await createTestHarness();

  try {
    const first = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        mode: "normal_chat",
        message: "Remote work increases productivity."
      }
    });
    const firstBody = parseJson<ChatTurnResponse>(first.body);

    const second = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        sessionId: firstBody.session.id,
        mode: "critic",
        message: "Remote work does not increase productivity."
      }
    });
    const secondBody = parseJson<ChatTurnResponse>(second.body);

    expect(second.statusCode).toBe(200);
    expect(secondBody.answer.trim().length).toBeGreaterThan(20);
    expect(secondBody.answer).not.toMatch(/glad|happy to help/i);
    expect(secondBody.activeQuestions.length).toBeGreaterThan(0);
    expect(secondBody.targetedQuestions.length).toBeGreaterThan(0);

    const databaseReply = await harness.app.inject({
      method: "POST",
      url: "/database/query",
      payload: {
        sessionId: firstBody.session.id,
        query: "Show contradictions"
      }
    });
    const databaseBody = parseJson<DatabaseQueryResponse>(databaseReply.body);

    expect(databaseBody.answer).toContain("conflicts with new claim");
  } finally {
    await harness.cleanup();
  }
}, 20_000);