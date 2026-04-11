import { expect, test } from "vitest";

import type { ChatTurnResponse, DatabaseQueryResponse } from "../../src/types/api.js";
import { createTestHarness, parseJson } from "./testHarness.js";

test("database mode returns deterministic stored answers and procedural reports", async () => {
  const harness = await createTestHarness();

  try {
    const firstReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        mode: "critic",
        message: "This policy is fair."
      }
    });
    const firstBody = parseJson<ChatTurnResponse>(firstReply.body);

    await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        sessionId: firstBody.session.id,
        mode: "critic",
        message: "This policy is not fair."
      }
    });

    const unansweredReply = await harness.app.inject({
      method: "POST",
      url: "/database/query",
      payload: {
        sessionId: firstBody.session.id,
        query: "List unanswered questions"
      }
    });
    const unansweredBody = parseJson<DatabaseQueryResponse>(unansweredReply.body);
    expect(unansweredBody.provenance).toBe("database");
    expect(unansweredBody.answer).toContain("Unanswered Questions");

    const contradictionsReply = await harness.app.inject({
      method: "POST",
      url: "/database/query",
      payload: {
        sessionId: firstBody.session.id,
        query: "Show contradictions"
      }
    });
    const contradictionsBody = parseJson<DatabaseQueryResponse>(contradictionsReply.body);
    expect(contradictionsBody.provenance).toBe("database");
    expect(contradictionsBody.answer).toContain("Contradictions");

    const reportReply = await harness.app.inject({
      method: "POST",
      url: "/database/query",
      payload: {
        sessionId: firstBody.session.id,
        query: "Generate session summary report"
      }
    });
    const reportBody = parseJson<DatabaseQueryResponse>(reportReply.body);
    expect(reportBody.answer).toContain(firstBody.session.title);
  } finally {
    await harness.cleanup();
  }
}, 10_000);