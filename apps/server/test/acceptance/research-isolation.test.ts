import { expect, test } from "vitest";

import { createTestHarness, parseJson } from "./testHarness.js";

test("research import is gated by settings and isolated until enabled", async () => {
  const harness = await createTestHarness({ researchEnabled: false });

  try {
    const sessionReply = await harness.app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Research Session", mode: "research_import" }
    });
    const sessionId = parseJson<{ session: { id: string } }>(sessionReply.body).session.id;

    const disabledReply = await harness.app.inject({
      method: "POST",
      url: "/research/import",
      payload: {
        sessionId,
        payload: JSON.stringify({ findings: [{ text: "Source A", category: "finding" }] }),
        enabledForContext: true
      }
    });
    const disabledBody = parseJson<{ imported: boolean; findingsImported: number }>(disabledReply.body);
    expect(disabledBody.imported).toBe(false);
    expect(disabledBody.findingsImported).toBe(0);

    const emptyRunsReply = await harness.app.inject({ method: "GET", url: `/research?sessionId=${sessionId}` });
    expect(parseJson<{ runs: unknown[] }>(emptyRunsReply.body).runs).toHaveLength(0);

    await harness.app.inject({
      method: "PUT",
      url: "/runtime/settings",
      payload: { researchEnabled: true }
    });

    const enabledReply = await harness.app.inject({
      method: "POST",
      url: "/research/import",
      payload: {
        sessionId,
        payload: JSON.stringify({
          sources: [{ title: "Paper", url: "https://example.test", snippet: "A snippet" }],
          findings: [
            { text: "Finding one", category: "support" },
            { text: "Finding two", category: "risk" }
          ]
        }),
        enabledForContext: true
      }
    });
    const enabledBody = parseJson<{ imported: boolean; findingsImported: number }>(enabledReply.body);
    expect(enabledBody.imported).toBe(true);
    expect(enabledBody.findingsImported).toBe(2);

    const runsReply = await harness.app.inject({ method: "GET", url: `/research?sessionId=${sessionId}` });
    expect(parseJson<{ runs: unknown[] }>(runsReply.body).runs).toHaveLength(1);
  } finally {
    await harness.cleanup();
  }
});