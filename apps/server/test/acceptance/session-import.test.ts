import { expect, test } from "vitest";

import type { ChatTurnResponse } from "../../src/types/api.js";
import { createTestHarness, parseJson } from "./testHarness.js";

test("importing a session to critic creates a separate transcript with copied messages", async () => {
  const harness = await createTestHarness();

  try {
    const firstReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        mode: "normal_chat",
        message: "We should replace meetings with async updates for routine status reporting."
      }
    });
    const firstBody = parseJson<ChatTurnResponse>(firstReply.body);

    const importReply = await harness.app.inject({
      method: "POST",
      url: "/sessions/import",
      payload: {
        sourceSessionId: firstBody.session.id,
        mode: "critic"
      }
    });
    const imported = parseJson<{
      session: {
        id: string;
        mode: string;
        title: string;
        sourceSessionId: string | null;
        sourceSessionMode: string | null;
        handoffPrompt: string | null;
      };
    }>(importReply.body);

    const importedSessionReply = await harness.app.inject({
      method: "GET",
      url: `/sessions/${imported.session.id}`
    });
    const importedSession = parseJson<{
      session: {
        id: string;
        mode: string;
        title: string;
        sourceSessionId: string | null;
        sourceSessionMode: string | null;
        handoffPrompt: string | null;
      };
      messages: Array<{ role: string; content: string }>;
    }>(importedSessionReply.body);

    expect(importReply.statusCode).toBe(200);
    expect(imported.session.mode).toBe("critic");
    expect(imported.session.title).toContain("Critic import:");
    expect(imported.session.id).not.toBe(firstBody.session.id);
    expect(imported.session.sourceSessionId).toBe(firstBody.session.id);
    expect(imported.session.sourceSessionMode).toBe("normal_chat");
    expect(imported.session.handoffPrompt).toContain("Treat the copied conversation in this session as the case to challenge");
    expect(importedSession.messages).toHaveLength(2);
    expect(importedSession.session.sourceSessionId).toBe(firstBody.session.id);
    expect(importedSession.session.sourceSessionMode).toBe("normal_chat");
    expect(importedSession.messages[0]?.role).toBe("user");
    expect(importedSession.messages[0]?.content).toContain("replace meetings with async updates");
  } finally {
    await harness.cleanup();
  }
}, 10_000);