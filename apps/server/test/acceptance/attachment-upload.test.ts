import { Buffer } from "node:buffer";

import { expect, test } from "vitest";

import type { ChatTurnResponse } from "../../src/types/api.js";
import { createTestHarness, parseJson } from "./testHarness.js";

function buildMultipartUpload(fileName: string, mimeType: string, content: string): { payload: Buffer; boundary: string } {
  const boundary = "----argument-critic-test-boundary";
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    "utf8"
  );
  const body = Buffer.from(content, "utf8");
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    payload: Buffer.concat([header, body, footer]),
    boundary
  };
}

test("uploaded files can be attached to a chat turn and served back", async () => {
  const harness = await createTestHarness();

  try {
    const sessionReply = await harness.app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Upload Session", mode: "normal_chat" }
    });
    const sessionId = parseJson<{ session: { id: string } }>(sessionReply.body).session.id;

    const upload = buildMultipartUpload("notes.txt", "text/plain", "A short reference file about the current argument.");
    const uploadReply = await harness.app.inject({
      method: "POST",
      url: `/attachments/upload?sessionId=${sessionId}`,
      payload: upload.payload,
      headers: {
        "content-type": `multipart/form-data; boundary=${upload.boundary}`
      }
    });
    const uploadBody = parseJson<{ attachment: { id: string; displayName: string | null; mimeType: string } }>(uploadReply.body);

    expect(uploadReply.statusCode).toBe(200);
    expect(uploadBody.attachment.displayName).toBe("notes.txt");
    expect(uploadBody.attachment.mimeType).toBe("text/plain");

    const chatReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        sessionId,
        mode: "normal_chat",
        message: "Use the attachment.",
        attachmentIds: [uploadBody.attachment.id]
      }
    });
    const chatBody = parseJson<ChatTurnResponse>(chatReply.body);

    expect(chatReply.statusCode).toBe(200);
    expect(chatBody.answer.trim().length).toBeGreaterThan(0);
    expect(chatBody.messages[0]?.attachments?.[0]?.displayName).toBe("notes.txt");

    const contentReply = await harness.app.inject({
      method: "GET",
      url: `/attachments/${uploadBody.attachment.id}/content`
    });

    expect(contentReply.statusCode).toBe(200);
    expect(contentReply.headers["content-type"]).toContain("text/plain");
    expect(contentReply.body).toContain("reference file about the current argument");
  } finally {
    await harness.cleanup();
  }
}, 20_000);