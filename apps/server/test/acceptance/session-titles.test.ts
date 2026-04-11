import { expect, test } from "vitest";

import type { ChatTurnResponse } from "../../src/types/api.js";
import { createTestHarness, parseJson } from "./testHarness.js";

test("sessions can be renamed explicitly", async () => {
  const harness = await createTestHarness();

  try {
    const createReply = await harness.app.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        mode: "normal_chat",
        title: "Untitled Session"
      }
    });
    const created = parseJson<{ session: { id: string; title: string } }>(createReply.body);

    const renameReply = await harness.app.inject({
      method: "PATCH",
      url: `/sessions/${created.session.id}`,
      payload: {
        title: "Remote policy review"
      }
    });
    const renamed = parseJson<{ session: { id: string; title: string } }>(renameReply.body);

    expect(renameReply.statusCode).toBe(200);
    expect(renamed.session.title).toBe("Remote policy review");
  } finally {
    await harness.cleanup();
  }
});

test("blank sessions auto-title themselves from the first user turn", async () => {
  const harness = await createTestHarness();

  try {
    const createReply = await harness.app.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        mode: "normal_chat",
        title: "Untitled Session"
      }
    });
    const created = parseJson<{ session: { id: string } }>(createReply.body);

    const turnReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        sessionId: created.session.id,
        mode: "normal_chat",
        message: "Remote work policy needs manager approval for exceptions."
      }
    });
    const turnBody = parseJson<ChatTurnResponse>(turnReply.body);

    expect(turnReply.statusCode).toBe(200);
    expect(turnBody.session.title).toContain("Remote work policy needs manager approval for exceptions");
  } finally {
    await harness.cleanup();
  }
});

test("auto-title can be disabled from runtime settings", async () => {
  const harness = await createTestHarness();

  try {
    await harness.app.inject({
      method: "PUT",
      url: "/runtime/settings",
      payload: {
        sessionAutoTitleEnabled: false
      }
    });

    const createReply = await harness.app.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        mode: "normal_chat",
        title: "Untitled Session"
      }
    });
    const created = parseJson<{ session: { id: string } }>(createReply.body);

    const turnReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        sessionId: created.session.id,
        mode: "normal_chat",
        message: "Evidence for the new claim should be reviewed next week."
      }
    });
    const turnBody = parseJson<ChatTurnResponse>(turnReply.body);

    expect(turnReply.statusCode).toBe(200);
    expect(turnBody.session.title).toBe("Untitled Session");
  } finally {
    await harness.cleanup();
  }
}, 10_000);
