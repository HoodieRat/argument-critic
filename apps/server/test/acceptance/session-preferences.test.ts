import { expect, test } from "vitest";

import type { ChatTurnResponse } from "../../src/types/api.js";
import { createTestHarness, parseJson } from "./testHarness.js";

test("new sessions default to 1x criticality with structured output enabled and image text extraction enabled, then allow per-session updates", async () => {
  const harness = await createTestHarness();

  try {
    const createReply = await harness.app.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        mode: "critic",
        title: "Preference Session"
      }
    });
    const created = parseJson<{ session: { id: string; criticalityMultiplier: number; structuredOutputEnabled: boolean; imageTextExtractionEnabled: boolean } }>(createReply.body);

    expect(createReply.statusCode).toBe(200);
    expect(created.session.criticalityMultiplier).toBe(1);
    expect(created.session.structuredOutputEnabled).toBe(true);
    expect(created.session.imageTextExtractionEnabled).toBe(true);

    const patchReply = await harness.app.inject({
      method: "PATCH",
      url: `/sessions/${created.session.id}`,
      payload: {
        criticalityMultiplier: 10,
        structuredOutputEnabled: false,
        imageTextExtractionEnabled: false
      }
    });
    const patched = parseJson<{ session: { criticalityMultiplier: number; structuredOutputEnabled: boolean; imageTextExtractionEnabled: boolean } }>(patchReply.body);

    expect(patchReply.statusCode).toBe(200);
    expect(patched.session.criticalityMultiplier).toBe(10);
    expect(patched.session.structuredOutputEnabled).toBe(false);
    expect(patched.session.imageTextExtractionEnabled).toBe(false);

    const getReply = await harness.app.inject({
      method: "GET",
      url: `/sessions/${created.session.id}`
    });
    const fetched = parseJson<{ session: { criticalityMultiplier: number; structuredOutputEnabled: boolean; imageTextExtractionEnabled: boolean } }>(getReply.body);

    expect(fetched.session.criticalityMultiplier).toBe(10);
    expect(fetched.session.structuredOutputEnabled).toBe(false);
    expect(fetched.session.imageTextExtractionEnabled).toBe(false);
  } finally {
    await harness.cleanup();
  }
});

test("criticality and structured-output preferences affect fallback chat behavior and copy on import", async () => {
  const harness = await createTestHarness();
  const challengeText = "This always works, clearly leads to better outcomes, and everyone should adopt it.";

  try {
    const lowSessionReply = await harness.app.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        mode: "critic",
        title: "Low Critique"
      }
    });
    const lowSession = parseJson<{ session: { id: string } }>(lowSessionReply.body).session;

    await harness.app.inject({
      method: "PATCH",
      url: `/sessions/${lowSession.id}`,
      payload: {
        criticalityMultiplier: 0.1,
        structuredOutputEnabled: false,
        imageTextExtractionEnabled: true
      }
    });

    const lowReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        sessionId: lowSession.id,
        mode: "critic",
        message: challengeText
      }
    });
    const lowBody = parseJson<ChatTurnResponse>(lowReply.body);

    expect(lowReply.statusCode).toBe(200);
    expect(lowBody.targetedQuestions).toHaveLength(1);
    expect(lowBody.answer).not.toContain("Pressure points:");

    const highSessionReply = await harness.app.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        mode: "critic",
        title: "High Critique"
      }
    });
    const highSession = parseJson<{ session: { id: string } }>(highSessionReply.body).session;

    await harness.app.inject({
      method: "PATCH",
      url: `/sessions/${highSession.id}`,
      payload: {
        criticalityMultiplier: 10,
        structuredOutputEnabled: true,
        imageTextExtractionEnabled: false
      }
    });

    const highReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        sessionId: highSession.id,
        mode: "critic",
        message: challengeText
      }
    });
    const highBody = parseJson<ChatTurnResponse>(highReply.body);

    expect(highReply.statusCode).toBe(200);
    expect(highBody.targetedQuestions.length).toBeGreaterThan(lowBody.targetedQuestions.length);
    expect(highBody.answer.length).toBeGreaterThan(lowBody.answer.length);
    expect(highBody.answer.trim().length).toBeGreaterThan(100);

    const importReply = await harness.app.inject({
      method: "POST",
      url: "/sessions/import",
      payload: {
        sourceSessionId: highSession.id,
        mode: "research_import"
      }
    });
    const imported = parseJson<{
      session: {
        criticalityMultiplier: number;
        structuredOutputEnabled: boolean;
        imageTextExtractionEnabled: boolean;
      };
    }>(importReply.body);

    expect(importReply.statusCode).toBe(200);
    expect(imported.session.criticalityMultiplier).toBe(10);
    expect(imported.session.structuredOutputEnabled).toBe(true);
    expect(imported.session.imageTextExtractionEnabled).toBe(false);
  } finally {
    await harness.cleanup();
  }
}, 10_000);