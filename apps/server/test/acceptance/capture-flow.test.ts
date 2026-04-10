import { expect, test } from "vitest";

import { createTestHarness, parseJson } from "./testHarness.js";

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9XG4sAAAAASUVORK5CYII=";

test("capture flow stores metadata and avoids redundant analysis for the same image region", async () => {
  const harness = await createTestHarness();

  try {
    const sessionReply = await harness.app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Capture Session", mode: "attachment_analysis" }
    });
    const sessionId = parseJson<{ session: { id: string } }>(sessionReply.body).session.id;

    const firstReply = await harness.app.inject({
      method: "POST",
      url: "/capture/submit",
      payload: {
        sessionId,
        dataUrl: tinyPng,
        mimeType: "image/png",
        analyze: true,
        crop: { x: 4, y: 8, width: 22, height: 18 }
      }
    });
    const firstBody = parseJson<{ attachment: { id: string; contentHash: string }; capture: { id: string }; analysis: string }>(firstReply.body);

    expect(firstBody.attachment.contentHash).toBeTruthy();
    expect(firstBody.capture.id).toBeTruthy();
    expect(firstBody.analysis).toContain("Saved a 22 x 18 crop to this session.");

    const secondReply = await harness.app.inject({
      method: "POST",
      url: "/capture/submit",
      payload: {
        sessionId,
        dataUrl: tinyPng,
        mimeType: "image/png",
        analyze: true,
        crop: { x: 4, y: 8, width: 22, height: 18 }
      }
    });
    const secondBody = parseJson<{ attachment: { id: string }; analysis: string }>(secondReply.body);

    expect(secondBody.attachment.id).toBe(firstBody.attachment.id);
    expect(secondBody.analysis).toBe(firstBody.analysis);
  } finally {
    await harness.cleanup();
  }
});