import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import type { ChatTurnResponse } from "../../src/types/api.js";
import { createTestHarness, parseJson } from "./testHarness.js";

test("normal chat stores messages and survives restart", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "argument-critic-normal-"));
  const first = await createTestHarness({ dataDir });

  try {
    const reply = await first.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        mode: "normal_chat",
        message: "Remote work improves focus because commuting time is removed and the day has fewer interruptions."
      }
    });

    const body = parseJson<ChatTurnResponse>(reply.body);
    expect(reply.statusCode).toBe(200);
    expect(body.messages).toHaveLength(2);
    expect(body.activeQuestions.length).toBeGreaterThan(0);
    expect(body.targetedQuestions.length).toBeGreaterThan(0);
    expect(body.session.summary).toContain("unresolved question(s)");

    await first.close();

    const second = await createTestHarness({ dataDir });
    try {
      const resumed = await second.app.inject({
        method: "GET",
        url: `/sessions/${body.session.id}`
      });
      const resumedBody = parseJson<{ messages: Array<{ content: string }> }>(resumed.body);

      expect(resumed.statusCode).toBe(200);
      expect(resumedBody.messages).toHaveLength(2);
      expect(resumedBody.messages[0]?.content).toContain("Remote work improves focus");
    } finally {
      await second.close();
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});