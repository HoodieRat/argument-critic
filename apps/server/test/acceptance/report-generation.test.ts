import { expect, test } from "vitest";

import type { ChatTurnResponse } from "../../src/types/api.js";
import { createTestHarness, parseJson } from "./testHarness.js";

test("report generation is procedural and saved for later retrieval", async () => {
  const harness = await createTestHarness();

  try {
    const chatReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        mode: "critic",
        message: "The proposal is reasonable because it is reasonable."
      }
    });
    const chatBody = parseJson<ChatTurnResponse>(chatReply.body);

    const reportReply = await harness.app.inject({
      method: "POST",
      url: "/reports/generate",
      payload: {
        sessionId: chatBody.session.id,
        reportType: "session_overview"
      }
    });
    const reportBody = parseJson<{ report: { id: string; content: string } }>(reportReply.body);
    expect(reportBody.report.content).toContain(chatBody.session.title);

    const listReply = await harness.app.inject({
      method: "GET",
      url: `/reports?sessionId=${chatBody.session.id}`
    });
    const listBody = parseJson<{ reports: Array<{ id: string }> }>(listReply.body);
    expect(listBody.reports.some((report) => report.id === reportBody.report.id)).toBe(true);
  } finally {
    await harness.cleanup();
  }
});