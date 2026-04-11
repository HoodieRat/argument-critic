import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { GitHubLoginService } from "../../src/services/copilot/GitHubLoginService.js";
import { createTestHarness, parseJson } from "./testHarness.js";

const originalFetch = globalThis.fetch;

const inertGitHubLoginService: GitHubLoginService = {
  async startFlow() {
    return {
      id: "inert-flow",
      state: "failed",
      message: "GitHub login is disabled in this test harness.",
      startedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      authMethod: "github-cli",
      userCode: null,
      verificationUri: null,
      expiresAt: null,
      reviewUri: null,
      accountLogin: null
    };
  },
  getFlow() {
    return null;
  }
};

function toUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function readAuthorization(headers: HeadersInit | undefined): string {
  if (!headers) {
    return "";
  }
  if (headers instanceof Headers) {
    return headers.get("Authorization") ?? "";
  }
  if (Array.isArray(headers)) {
    const entry = headers.find(([key]) => key.toLowerCase() === "authorization");
    return entry?.[1] ?? "";
  }
  return typeof headers.Authorization === "string"
    ? headers.Authorization
    : typeof headers.authorization === "string"
      ? headers.authorization
      : "";
}

function readJsonBody(init: RequestInit | undefined): unknown {
  if (!init?.body || typeof init.body !== "string") {
    return undefined;
  }

  return JSON.parse(init.body);
}

function buildCopilotModelsResponse(): Response {
  return new Response(
    JSON.stringify({
      data: [
        {
          id: "claude-opus-4.6",
          vendor: "Anthropic",
          name: "Claude Opus 4.6",
          preview: false,
          model_picker_enabled: true,
          is_chat_default: false,
          is_chat_fallback: false,
          supported_endpoints: ["/v1/messages"],
          supportsAdaptiveThinking: true,
          supportsReasoningEffort: ["low", "medium", "high"],
          capabilities: {
            type: "chat",
            family: "claude-4.6-opus",
            supports: {
              tool_calls: true,
              vision: true,
              thinking: true,
              adaptive_thinking: true,
              reasoning_effort: ["low", "medium", "high"]
            },
            limits: {
              max_prompt_tokens: 200000,
              max_output_tokens: 64000
            }
          },
          billing: {
            is_premium: true,
            multiplier: 3
          }
        },
        {
          id: "claude-sonnet-4.6",
          vendor: "Anthropic",
          name: "Claude Sonnet 4.6",
          preview: false,
          model_picker_enabled: true,
          is_chat_default: false,
          is_chat_fallback: false,
          supported_endpoints: ["/v1/messages"],
          supportsAdaptiveThinking: true,
          supportsReasoningEffort: ["low", "medium", "high"],
          capabilities: {
            type: "chat",
            family: "claude-4.6-sonnet",
            supports: {
              tool_calls: true,
              vision: true,
              thinking: true,
              adaptive_thinking: true,
              reasoning_effort: ["low", "medium", "high"]
            },
            limits: {
              max_prompt_tokens: 200000,
              max_output_tokens: 32000
            }
          },
          billing: {
            is_premium: true,
            multiplier: 1
          }
        },
        {
          id: "gpt-5.4",
          vendor: "OpenAI",
          name: "GPT-5.4",
          preview: false,
          model_picker_enabled: true,
          is_chat_default: true,
          is_chat_fallback: false,
          supported_endpoints: ["/chat/completions", "/responses"],
          supportsReasoningEffort: ["low", "medium", "high", "xhigh"],
          capabilities: {
            type: "chat",
            family: "gpt-5",
            supports: {
              tool_calls: true,
              vision: true,
              thinking: true,
              reasoning_effort: ["low", "medium", "high", "xhigh"]
            },
            limits: {
              max_prompt_tokens: 200000,
              max_output_tokens: 100000
            }
          },
          billing: {
            is_premium: true,
            multiplier: 1
          }
        },
        {
          id: "gpt-4.1",
          vendor: "OpenAI",
          name: "GPT-4.1",
          preview: false,
          model_picker_enabled: true,
          is_chat_default: false,
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
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

function buildLimitedOAuthCopilotModelsResponse(): Response {
  return new Response(
    JSON.stringify({
      data: [
        {
          id: "gpt-4o-mini-2024-07-18",
          vendor: "Azure OpenAI",
          name: "GPT-4o mini",
          preview: false,
          model_picker_enabled: false,
          capabilities: {
            type: "chat",
            family: "gpt-4o-mini",
            supports: {
              tool_calls: true,
              vision: true,
              thinking: false
            },
            limits: {
              max_prompt_tokens: 64000,
              max_output_tokens: 4096
            }
          }
        },
        {
          id: "gpt-4o",
          vendor: "Azure OpenAI",
          name: "GPT-4o",
          preview: false,
          model_picker_enabled: true,
          capabilities: {
            type: "chat",
            family: "gpt-4o",
            supports: {
              tool_calls: true,
              vision: true,
              thinking: false
            },
            limits: {
              max_prompt_tokens: 64000,
              max_output_tokens: 4096
            }
          }
        },
        {
          id: "gpt-3.5-turbo",
          vendor: "Azure OpenAI",
          name: "GPT 3.5 Turbo",
          preview: false,
          model_picker_enabled: false,
          capabilities: {
            type: "chat",
            family: "gpt-3.5-turbo",
            supports: {
              tool_calls: true,
              vision: false,
              thinking: false
            },
            limits: {
              max_prompt_tokens: 16000,
              max_output_tokens: 4096
            }
          }
        }
      ]
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = toUrl(input);
    const authorization = readAuthorization(init?.headers);
    const body = readJsonBody(init);

    if (url === "https://api.github.com/copilot_internal/v2/token") {
      if (/(token|Bearer) ghp_test_secret/i.test(authorization)) {
        return new Response(
          JSON.stringify({
            token: "v1.minted_token",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_in: 300
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (/(token|Bearer) ghp_no_copilot/i.test(authorization)) {
        return new Response(
          JSON.stringify({
            message: "Not Found"
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (/(token|Bearer) ghu_direct_copilot/i.test(authorization)) {
        return new Response(
          JSON.stringify({
            message: "Not Found"
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (/(token|Bearer) gho_limited_catalog/i.test(authorization)) {
        return new Response(
          JSON.stringify({
            message: "Not Found"
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      return new Response("Unauthorized", { status: 401 });
    }

    if (url === "https://api.githubcopilot.com/models") {
      if (/Bearer ghp_/i.test(authorization)) {
        return new Response("checking third-party user token: bad request: Personal Access Tokens are not supported for this endpoint", {
          status: 400,
          headers: { "Content-Type": "text/plain" }
        });
      }

      if (/Bearer (v1\.(minted_token|env_token)|ghu_direct_copilot)/i.test(authorization)) {
        return buildCopilotModelsResponse();
      }

      if (/Bearer gho_limited_catalog/i.test(authorization)) {
        return buildLimitedOAuthCopilotModelsResponse();
      }

      return new Response("Unauthorized", { status: 401 });
    }

    if (url === "https://api.githubcopilot.com/responses") {
      if (/Bearer v1\.minted_token/i.test(authorization)) {
        return new Response(
          JSON.stringify({
            output_text: `Richer Copilot response for ${(body as { model?: string } | undefined)?.model ?? "unknown model"}`
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      if (/Bearer ghu_direct_copilot/i.test(authorization)) {
        return new Response(
          JSON.stringify({
            output_text: `Direct Copilot token response for ${(body as { model?: string } | undefined)?.model ?? "unknown model"}`
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      return new Response("Unauthorized", { status: 401 });
    }

    if (url === "https://models.github.ai/catalog/models") {
      if (/Bearer (ghp_(test_secret|no_copilot)|gho_limited_catalog)/i.test(authorization)) {
        return new Response(
          JSON.stringify([
            {
              id: "openai/gpt-4.1",
              name: "OpenAI GPT-4.1",
              publisher: "OpenAI",
              capabilities: ["streaming", "tool-calling"],
              limits: {
                max_input_tokens: 1048576,
                max_output_tokens: 32768
              },
              supported_input_modalities: ["text", "image"],
              rate_limit_tier: "high"
            },
            {
              id: "openai/gpt-5-mini",
              name: "OpenAI GPT-5 mini",
              publisher: "OpenAI",
              capabilities: ["streaming", "tool-calling"],
              limits: {
                max_input_tokens: 200000,
                max_output_tokens: 100000
              },
              supported_input_modalities: ["text", "image"],
              rate_limit_tier: "custom"
            }
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      return new Response("Unauthorized", { status: 401 });
    }

    return await originalFetch(input, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

test.skipIf(process.platform !== "win32")("runtime settings store tokens encrypted and unlock Copilot models through GitHub token exchange", async () => {
  const harness = await createTestHarness({ githubLoginService: inertGitHubLoginService });

  try {
    const initialReply = await harness.app.inject({ method: "GET", url: "/runtime/settings" });
    const initialSettings = parseJson<{
      githubModel: string;
      availableGitHubModels: Array<{ id: string; name: string }>;
      modelAccess: { backend: "copilot" | "github-models" | "none"; tokenKind: "copilot" | "oauth_token" | "personal_access_token" | "unknown" | "none"; warning: string | null };
      githubModelThinkingEnabled: boolean;
      githubModelReasoningEffort: string | null;
      githubModelThinkingBudget: number | null;
      sessionAutoTitleEnabled: boolean;
      githubModelsToken: { configured: boolean; source: "secure_store" | "environment" | "none"; updatedAt: string | null };
    }>(initialReply.body);

    expect(initialSettings.githubModel).toBe("gpt-4.1");
    expect(initialSettings.availableGitHubModels).toEqual([]);
    expect(initialSettings.modelAccess).toEqual({ backend: "none", tokenKind: "none", warning: null });
    expect(initialSettings.githubModelThinkingEnabled).toBe(false);
    expect(initialSettings.githubModelReasoningEffort).toBeNull();
    expect(initialSettings.githubModelThinkingBudget).toBeNull();
    expect(initialSettings.sessionAutoTitleEnabled).toBe(true);
    expect(initialSettings.githubModelsToken.configured).toBe(false);
    expect(initialSettings.githubModelsToken.source).toBe("none");
    expect(initialReply.body).not.toContain("ghp_test_secret");

    await harness.app.inject({
      method: "PUT",
      url: "/runtime/settings",
      payload: {
        researchEnabled: true,
        githubModel: "gpt-5.4",
        githubModelThinkingEnabled: true,
        githubModelReasoningEffort: "high",
        sessionAutoTitleEnabled: false
      }
    });

    const saveReply = await harness.app.inject({
      method: "PUT",
      url: "/runtime/github-models-token",
      payload: { token: "ghp_test_secret" }
    });
    const savedStatus = parseJson<{ configured: boolean; source: "secure_store" | "environment" | "none"; updatedAt: string | null }>(saveReply.body);

    expect(saveReply.statusCode).toBe(200);
    expect(savedStatus.configured).toBe(true);
    expect(savedStatus.source).toBe("secure_store");
    expect(saveReply.body).not.toContain("ghp_test_secret");

    const settingsReply = await harness.app.inject({ method: "GET", url: "/runtime/settings" });
    const settings = parseJson<{
      githubModel: string;
      availableGitHubModels: Array<{ id: string; name: string; vendor: string; supportsThinking: boolean; supportedEndpoints: string[] }>;
      modelAccess: { backend: "copilot" | "github-models" | "none"; tokenKind: "copilot" | "oauth_token" | "personal_access_token" | "unknown" | "none"; warning: string | null };
      githubModelThinkingEnabled: boolean;
      githubModelReasoningEffort: string | null;
      sessionAutoTitleEnabled: boolean;
      githubModelsToken: { configured: boolean; source: "secure_store" | "environment" | "none"; updatedAt: string | null };
    }>(settingsReply.body);

    expect(settings.githubModel).toBe("gpt-5.4");
    expect(settings.availableGitHubModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "claude-opus-4.6", name: "Claude Opus 4.6", vendor: "Anthropic", supportedEndpoints: ["/v1/messages"], supportsThinking: true }),
        expect.objectContaining({ id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", vendor: "Anthropic", supportedEndpoints: ["/v1/messages"], supportsThinking: true }),
        expect.objectContaining({ id: "gpt-5.4", name: "GPT-5.4", vendor: "OpenAI", supportedEndpoints: ["/chat/completions", "/responses"], supportsThinking: true })
      ])
    );
    expect(settings.modelAccess.backend).toBe("copilot");
    expect(settings.modelAccess.tokenKind).toBe("personal_access_token");
    expect(settings.modelAccess.warning).toBeNull();
    expect(settings.githubModelThinkingEnabled).toBe(true);
    expect(settings.githubModelReasoningEffort).toBe("high");
    expect(settings.sessionAutoTitleEnabled).toBe(false);
    expect(settings.githubModelsToken.configured).toBe(true);
    expect(settings.githubModelsToken.source).toBe("secure_store");
    expect(settingsReply.body).not.toContain("ghp_test_secret");

    const turnReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        mode: "normal_chat",
        message: "Explain why queueing disciplines matter in a distributed system."
      }
    });

    expect(turnReply.statusCode).toBe(200);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const responsesCall = fetchMock.mock.calls.find(([input]) => toUrl(input as RequestInfo | URL) === "https://api.githubcopilot.com/responses");
    expect(responsesCall).toBeDefined();
    expect(readAuthorization(responsesCall?.[1]?.headers)).toBe("Bearer v1.minted_token");
    expect(readJsonBody(responsesCall?.[1]) as { model?: string }).toEqual(expect.objectContaining({ model: "gpt-5.4" }));

    const row = harness.server.services.databaseService.connection
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get("secrets.githubModelsToken") as { value_json: string } | undefined;

    expect(row).toBeDefined();
    expect(row?.value_json).toContain("windows-dpapi");
    expect(row?.value_json).not.toContain("ghp_test_secret");
  } finally {
    await harness.cleanup();
  }
});

test.skipIf(process.platform !== "win32")("PAT tokens without Copilot entitlement fall back to GitHub Models", async () => {
  const harness = await createTestHarness();

  try {
    await harness.app.inject({
      method: "PUT",
      url: "/runtime/github-models-token",
      payload: { token: "ghp_no_copilot" }
    });

    const settingsReply = await harness.app.inject({ method: "GET", url: "/runtime/settings" });
    const settings = parseJson<{
      githubModel: string;
      availableGitHubModels: Array<{ id: string; name: string }>;
      modelAccess: { backend: "copilot" | "github-models" | "none"; tokenKind: "copilot" | "oauth_token" | "personal_access_token" | "unknown" | "none"; warning: string | null };
    }>(settingsReply.body);

    expect(settings.githubModel).toBe("openai/gpt-4.1");
    expect(settings.availableGitHubModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "openai/gpt-4.1", name: "OpenAI GPT-4.1" }),
        expect.objectContaining({ id: "openai/gpt-5-mini", name: "OpenAI GPT-5 mini" })
      ])
    );
    expect(settings.modelAccess.backend).toBe("github-models");
    expect(settings.modelAccess.tokenKind).toBe("personal_access_token");
    expect(settings.modelAccess.warning).toBe("This saved token worked as a GitHub token, but GitHub did not unlock Copilot's separate model catalog for it. GitHub Models are active instead.");
  } finally {
    await harness.cleanup();
  }
});

test.skipIf(process.platform !== "win32")("PAT-like direct tokens can still use Copilot models when the raw token works without exchange", async () => {
  const harness = await createTestHarness();

  try {
    await harness.app.inject({
      method: "PUT",
      url: "/runtime/github-models-token",
      payload: { token: "ghu_direct_copilot" }
    });

    const settingsReply = await harness.app.inject({ method: "GET", url: "/runtime/settings" });
    const settings = parseJson<{
      githubModel: string;
      availableGitHubModels: Array<{ id: string; name: string }>;
      modelAccess: { backend: "copilot" | "github-models" | "none"; tokenKind: "copilot" | "oauth_token" | "personal_access_token" | "unknown" | "none"; warning: string | null };
    }>(settingsReply.body);

    expect(settings.availableGitHubModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "claude-opus-4.6", name: "Claude Opus 4.6" }),
        expect.objectContaining({ id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6" }),
        expect.objectContaining({ id: "gpt-5.4", name: "GPT-5.4" })
      ])
    );
    expect(settings.modelAccess.backend).toBe("copilot");
    expect(settings.modelAccess.tokenKind).toBe("oauth_token");
    expect(settings.modelAccess.warning).toBeNull();

    await harness.app.inject({
      method: "PUT",
      url: "/runtime/settings",
      payload: {
        githubModel: "gpt-5.4"
      }
    });

    const turnReply = await harness.app.inject({
      method: "POST",
      url: "/chat/turn",
      payload: {
        mode: "normal_chat",
        message: "Summarize the strongest objection to this plan."
      }
    });

    expect(turnReply.statusCode).toBe(200);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const responsesCall = fetchMock.mock.calls.find(([input, init]) => toUrl(input as RequestInfo | URL) === "https://api.githubcopilot.com/responses" && /Bearer ghu_direct_copilot/i.test(readAuthorization(init?.headers)));
    expect(responsesCall).toBeDefined();
  } finally {
    await harness.cleanup();
  }
});

test.skipIf(process.platform !== "win32")("OAuth sign-in tokens fall back to GitHub Models when the raw Copilot catalog is limited", async () => {
  const harness = await createTestHarness();

  try {
    await harness.app.inject({
      method: "PUT",
      url: "/runtime/github-models-token",
      payload: { token: "gho_limited_catalog" }
    });

    const settingsReply = await harness.app.inject({ method: "GET", url: "/runtime/settings?refreshModels=1" });
    const settings = parseJson<{
      githubModel: string;
      availableGitHubModels: Array<{ id: string; name: string }>;
      modelAccess: { backend: "copilot" | "github-models" | "none"; tokenKind: "copilot" | "oauth_token" | "personal_access_token" | "unknown" | "none"; warning: string | null };
    }>(settingsReply.body);

    expect(settings.githubModel).toBe("openai/gpt-4.1");
    expect(settings.availableGitHubModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "openai/gpt-4.1", name: "OpenAI GPT-4.1" }),
        expect.objectContaining({ id: "openai/gpt-5-mini", name: "OpenAI GPT-5 mini" })
      ])
    );
    expect(settings.modelAccess.backend).toBe("github-models");
    expect(settings.modelAccess.tokenKind).toBe("oauth_token");
  } finally {
    await harness.cleanup();
  }
});

test.skipIf(process.platform !== "win32")("runtime settings refresh query bypasses the cached model catalog", async () => {
  let dynamicModelsResponse = buildCopilotModelsResponse();

  const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = toUrl(input);
    const authorization = readAuthorization(init?.headers);
    const body = readJsonBody(init);

    if (url === "https://api.github.com/copilot_internal/v2/token") {
      if (/(token|Bearer) ghp_test_secret/i.test(authorization)) {
        return new Response(
          JSON.stringify({
            token: "v1.minted_token",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_in: 300
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      return new Response("Unauthorized", { status: 401 });
    }

    if (url === "https://api.githubcopilot.com/models" && /Bearer v1\.minted_token/i.test(authorization)) {
      return dynamicModelsResponse;
    }

    if (url === "https://api.githubcopilot.com/responses" && /Bearer v1\.minted_token/i.test(authorization)) {
      return new Response(
        JSON.stringify({
          output_text: `Richer Copilot response for ${(body as { model?: string } | undefined)?.model ?? "unknown model"}`
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    return await originalFetch(input, init);
  });

  const harness = await createTestHarness();

  try {
    await harness.app.inject({
      method: "PUT",
      url: "/runtime/github-models-token",
      payload: { token: "ghp_test_secret" }
    });

    const initialReply = await harness.app.inject({ method: "GET", url: "/runtime/settings" });
    const initialSettings = parseJson<{ availableGitHubModels: Array<{ id: string }> }>(initialReply.body);
    expect(initialSettings.availableGitHubModels).toEqual(expect.arrayContaining([expect.objectContaining({ id: "gpt-5.4" })]));

    dynamicModelsResponse = new Response(
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
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const cachedReply = await harness.app.inject({ method: "GET", url: "/runtime/settings" });
    const cachedSettings = parseJson<{ availableGitHubModels: Array<{ id: string }> }>(cachedReply.body);
    expect(cachedSettings.availableGitHubModels).toEqual(expect.arrayContaining([expect.objectContaining({ id: "gpt-5.4" })]));

    const refreshedReply = await harness.app.inject({ method: "GET", url: "/runtime/settings?refreshModels=1" });
    const refreshedSettings = parseJson<{ availableGitHubModels: Array<{ id: string }> }>(refreshedReply.body);
    expect(refreshedSettings.availableGitHubModels).toEqual([expect.objectContaining({ id: "gpt-4.1" })]);
  } finally {
    await harness.cleanup();
  }
});

test.skipIf(process.platform !== "win32")("clearing a stored token falls back to a Copilot environment token", async () => {
  const harness = await createTestHarness({ githubModelsToken: "v1.env_token" });

  try {
    const initialReply = await harness.app.inject({ method: "GET", url: "/runtime/settings" });
    const initialSettings = parseJson<{
      availableGitHubModels: Array<{ id: string; name: string }>;
      modelAccess: { backend: "copilot" | "github-models" | "none"; tokenKind: "copilot" | "oauth_token" | "personal_access_token" | "unknown" | "none"; warning: string | null };
      githubModelsToken: { configured: boolean; source: "secure_store" | "environment" | "none"; updatedAt: string | null };
    }>(initialReply.body);

    expect(initialSettings.githubModelsToken.configured).toBe(true);
    expect(initialSettings.githubModelsToken.source).toBe("environment");
    expect(initialSettings.modelAccess.backend).toBe("copilot");
    expect(initialSettings.modelAccess.tokenKind).toBe("copilot");
    expect(initialSettings.availableGitHubModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "claude-opus-4.6", name: "Claude Opus 4.6" }),
        expect.objectContaining({ id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6" }),
        expect.objectContaining({ id: "gpt-5.4", name: "GPT-5.4" })
      ])
    );

    await harness.app.inject({
      method: "PUT",
      url: "/runtime/github-models-token",
      payload: { token: "ghp_override_token" }
    });

    const clearedReply = await harness.app.inject({
      method: "DELETE",
      url: "/runtime/github-models-token"
    });
    const clearedStatus = parseJson<{ configured: boolean; source: "secure_store" | "environment" | "none"; updatedAt: string | null }>(clearedReply.body);

    expect(clearedStatus.configured).toBe(true);
    expect(clearedStatus.source).toBe("environment");
    expect(clearedReply.body).not.toContain("ghp_override_token");
    expect(clearedReply.body).not.toContain("v1.env_token");
  } finally {
    await harness.cleanup();
  }
});
