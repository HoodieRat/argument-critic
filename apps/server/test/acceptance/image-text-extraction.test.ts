import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { ChatTurnResponse } from "../../src/types/api.js";
import { createTestHarness, parseJson } from "./testHarness.js";

const originalFetch = globalThis.fetch;
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9XG4sAAAAASUVORK5CYII=";

function toUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function readJsonBody(init: RequestInit | undefined): unknown {
  if (!init?.body || typeof init.body !== "string") {
    return undefined;
  }

  return JSON.parse(init.body);
}

function readUserText(body: unknown): string {
  const messages = (body as { messages?: Array<{ role?: string; content?: string | Array<{ type?: string; text?: string }> }> }).messages ?? [];
  const userMessage = messages.find((message) => message.role === "user");
  if (!userMessage) {
    return "";
  }

  if (typeof userMessage.content === "string") {
    return userMessage.content;
  }

  if (Array.isArray(userMessage.content)) {
    return userMessage.content
      .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
      .join("\n");
  }

  return "";
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = toUrl(input);

    if (url === "https://api.githubcopilot.com/models") {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "gpt-4.1",
              vendor: "OpenAI",
              name: "GPT-4.1",
              preview: false,
              model_picker_enabled: true,
              is_chat_default: true,
              is_chat_fallback: false,
              supported_endpoints: ["/chat/completions"],
              capabilities: {
                type: "chat",
                family: "gpt-4.1",
                supports: {
                  tool_calls: true,
                  vision: true,
                  thinking: false
                },
                limits: {
                  max_prompt_tokens: 1048576,
                  max_output_tokens: 32768
                }
              },
              billing: {
                is_premium: false,
                multiplier: 0
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (url === "https://api.githubcopilot.com/chat/completions") {
      const body = readJsonBody(init);
      const userText = readUserText(body);

      if (userText.includes("Transcribe the attached image.")) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Quarterly revenue increased 18% year over year. Profit margin held at 22%."
                }
              }
            ]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Used extracted text."
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    throw new Error(`Unexpected fetch: ${url} with body ${JSON.stringify(readJsonBody(init))}`);
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("default image handling extracts visible text before the final reply", async () => {
  const harness = await createTestHarness({ githubModelsToken: "v1.env_token" });

  try {
    const sessionReply = await harness.app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "OCR Session", mode: "normal_chat" }
    });
    const sessionId = parseJson<{ session: { id: string; imageTextExtractionEnabled: boolean } }>(sessionReply.body).session.id;

    const captureReply = await harness.app.inject({
      method: "POST",
      url: "/capture/submit",
      payload: {
        sessionId,
        dataUrl: tinyPng,
        mimeType: "image/png",
        analyze: true,
        crop: { x: 10, y: 12, width: 40, height: 14 }
      }
    });
    const captureBody = parseJson<{ attachment: { id: string } }>(captureReply.body);

    expect(captureReply.statusCode).toBe(200);

    const chatReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        sessionId,
        mode: "normal_chat",
        message: "Use the screenshot.",
        attachmentIds: [captureBody.attachment.id]
      }
    });
    const chatBody = parseJson<ChatTurnResponse>(chatReply.body);

    expect(chatReply.statusCode).toBe(200);
    expect(chatBody.answer).toBe("Used extracted text.");

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const completionsCalls = fetchMock.mock.calls.filter(([input]) => toUrl(input as RequestInfo | URL) === "https://api.githubcopilot.com/chat/completions");
    expect(completionsCalls).toHaveLength(2);

    const ocrRequestBody = readJsonBody(completionsCalls[0]?.[1]) as {
      messages?: Array<{ role?: string; content?: string | Array<{ type?: string; text?: string; image_url?: { url?: string } }> }>;
    };
    const finalRequestBody = readJsonBody(completionsCalls[1]?.[1]) as {
      messages?: Array<{ role?: string; content?: string | Array<{ type?: string; text?: string; image_url?: { url?: string } }> }>;
    };
    const ocrUserMessage = ocrRequestBody.messages?.find((message) => message.role === "user");
    const finalUserMessage = finalRequestBody.messages?.find((message) => message.role === "user");

    expect(Array.isArray(ocrUserMessage?.content)).toBe(true);
    expect(ocrUserMessage?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
        expect.objectContaining({
          type: "image_url",
          image_url: expect.objectContaining({
            url: expect.stringMatching(/^data:image\/png;base64,/) 
          })
        })
      ])
    );

    expect(typeof finalUserMessage?.content).toBe("string");
    expect(finalUserMessage?.content).toContain("Quarterly revenue increased 18% year over year.");
  } finally {
    await harness.cleanup();
  }
});