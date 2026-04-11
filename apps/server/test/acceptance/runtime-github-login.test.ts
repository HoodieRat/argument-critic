import { expect, test, vi } from "vitest";

import { createLogger } from "../../src/logger.js";
import {
  DefaultGitHubLoginService,
  extractGitHubCliLoginLaunchResult,
  type GitHubLoginAdapter,
  type GitHubDeviceFlowClient,
  type GitHubLoginFlowSnapshot,
  type GitHubLoginService,
  GitHubOAuthDeviceFlowClient
} from "../../src/services/copilot/GitHubLoginService.js";
import { createTestHarness, parseJson } from "./testHarness.js";

async function waitForTerminalFlow(service: GitHubLoginService, flowId: string): Promise<GitHubLoginFlowSnapshot> {
  const deadline = Date.now() + 1_000;

  while (Date.now() < deadline) {
    const flow = service.getFlow(flowId);
    if (flow && ["succeeded", "failed"].includes(flow.state)) {
      return flow;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for the GitHub login flow to finish.");
}

test("runtime GitHub login routes surface the injected login flow", async () => {
  const flow: GitHubLoginFlowSnapshot = {
    id: "flow-1",
    state: "waiting",
    message: "GitHub sign-in was opened in your browser.",
    startedAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    authMethod: "github-cli",
    userCode: null,
    verificationUri: null,
    expiresAt: null,
    reviewUri: null,
    accountLogin: null
  };

  const githubLoginService: GitHubLoginService = {
    startFlow: async () => flow,
    getFlow: (flowId) => (flowId === flow.id ? flow : null)
  };

  const harness = await createTestHarness({ githubLoginService });

  try {
    const startReply = await harness.app.inject({ method: "POST", url: "/runtime/github-login/start" });
    expect(startReply.statusCode).toBe(200);
    expect(parseJson<GitHubLoginFlowSnapshot>(startReply.body)).toEqual(flow);

    const flowReply = await harness.app.inject({ method: "GET", url: `/runtime/github-login/${flow.id}` });
    expect(flowReply.statusCode).toBe(200);
    expect(parseJson<GitHubLoginFlowSnapshot>(flowReply.body)).toEqual(flow);

    const missingReply = await harness.app.inject({ method: "GET", url: "/runtime/github-login/missing" });
    expect(missingReply.statusCode).toBe(404);
    expect(missingReply.body).toBe("GitHub login flow not found.");
  } finally {
    await harness.cleanup();
  }
});

test("GitHub login service imports an existing GitHub CLI login without opening the browser", async () => {
  const tokenStore = {
    storeToken: vi.fn(async () => ({
      configured: true,
      source: "secure_store" as const,
      updatedAt: "2025-01-01T00:00:00.000Z"
    }))
  };
  const adapter: GitHubLoginAdapter = {
    isAvailable: async () => true,
    getCurrentToken: async () => "gho_existing_login",
    launchLogin: async () => {
      throw new Error("launchLogin should not be called when a login already exists.");
    }
  };
  const service = new DefaultGitHubLoginService(tokenStore as never, createLogger("test"), { cliAdapter: adapter });

  const initialFlow = await service.startFlow();
  const finishedFlow = await waitForTerminalFlow(service, initialFlow.id);

  expect(initialFlow.authMethod).toBe("github-cli");
  expect(finishedFlow.state).toBe("succeeded");
  expect(finishedFlow.message).toContain("imported");
  expect(tokenStore.storeToken).toHaveBeenCalledWith("gho_existing_login");
});

test("GitHub login service can hydrate an existing GitHub CLI login during startup", async () => {
  const tokenStore = {
    getStatus: vi.fn(() => ({
      configured: false,
      source: "none" as const,
      updatedAt: null
    })),
    storeToken: vi.fn(async () => ({
      configured: true,
      source: "secure_store" as const,
      updatedAt: "2025-01-01T00:00:00.000Z"
    }))
  };
  const adapter: GitHubLoginAdapter = {
    isAvailable: async () => true,
    getCurrentToken: async () => "gho_existing_login",
    launchLogin: async () => ({ userCode: null, verificationUri: null })
  };
  const service = new DefaultGitHubLoginService(tokenStore as never, createLogger("test"), { cliAdapter: adapter });

  await expect(service.hydrateExistingGitHubCliLogin()).resolves.toBe(true);
  expect(tokenStore.storeToken).toHaveBeenCalledWith("gho_existing_login");
});

test("GitHub login service fails fast when GitHub CLI is unavailable", async () => {
  const tokenStore = {
    storeToken: vi.fn(async () => ({
      configured: true,
      source: "secure_store" as const,
      updatedAt: "2025-01-01T00:00:00.000Z"
    }))
  };
  const adapter: GitHubLoginAdapter = {
    isAvailable: async () => false,
    getCurrentToken: async () => null,
    launchLogin: async () => ({ userCode: null, verificationUri: null })
  };
  const service = new DefaultGitHubLoginService(tokenStore as never, createLogger("test"), { cliAdapter: adapter });

  const initialFlow = await service.startFlow();
  const finishedFlow = await waitForTerminalFlow(service, initialFlow.id);

  expect(finishedFlow.state).toBe("failed");
  expect(finishedFlow.authMethod).toBe("github-cli");
  expect(finishedFlow.message).toContain("GitHub sign-in helper is missing");
  expect(tokenStore.storeToken).not.toHaveBeenCalled();
});

test("GitHub login service completes OAuth device flow and records the GitHub account", async () => {
  const tokenStore = {
    storeToken: vi.fn(async () => ({
      configured: true,
      source: "secure_store" as const,
      updatedAt: "2025-01-01T00:00:00.000Z"
    }))
  };
  const deviceFlowClient: GitHubDeviceFlowClient = {
    start: vi.fn(async () => ({
      deviceCode: "device-code-123",
      userCode: "ABCD-EFGH",
      verificationUri: "https://github.com/login/device",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      intervalSeconds: 0
    })),
    poll: vi.fn(async () => ({
      status: "approved" as const,
      accessToken: "gho_device_login"
    })),
    lookupViewerLogin: vi.fn(async () => "octocat")
  };
  const service = new DefaultGitHubLoginService(tokenStore as never, createLogger("test"), {
    authMethod: "oauth-device",
    oauthClientId: "client-123",
    deviceFlowClient,
    wait: async () => undefined
  });

  const initialFlow = await service.startFlow();
  const finishedFlow = await waitForTerminalFlow(service, initialFlow.id);

  expect(initialFlow.authMethod).toBe("oauth-device");
  expect(initialFlow.state).toBe("waiting");
  expect(initialFlow.userCode).toBe("ABCD-EFGH");
  expect(initialFlow.verificationUri).toBe("https://github.com/login/device");
  expect(finishedFlow.state).toBe("succeeded");
  expect(finishedFlow.accountLogin).toBe("octocat");
  expect(finishedFlow.message).toContain("octocat");
  expect(tokenStore.storeToken).toHaveBeenCalledWith("gho_device_login");
});

test("GitHub OAuth device flow start request omits an explicit scope", async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe("POST");
    expect(String(init?.body ?? "")).toBe("client_id=client-123");

    return new Response(
      JSON.stringify({
        device_code: "device-code-123",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  });

  globalThis.fetch = fetchMock as typeof fetch;

  try {
    const client = new GitHubOAuthDeviceFlowClient();
    const result = await client.start("client-123");

    expect(result.userCode).toBe("ABCD-EFGH");
    expect(fetchMock).toHaveBeenCalledOnce();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("extractGitHubCliLoginLaunchResult parses the real Windows gh device-code output", () => {
  const parsed = extractGitHubCliLoginLaunchResult([
    "? Authenticate Git with your GitHub credentials? Yes",
    "",
    "! One-time code (AC4F-5AB5) copied to clipboard",
    "Press Enter to open https://github.com/login/device in your browser..."
  ].join("\n"));

  expect(parsed).toEqual({
    userCode: "AC4F-5AB5",
    verificationUri: "https://github.com/login/device"
  });
});

test("GitHub login service prefers the configured auth method over OAuth client presence", async () => {
  const tokenStore = {
    storeToken: vi.fn(async () => ({
      configured: true,
      source: "secure_store" as const,
      updatedAt: "2025-01-01T00:00:00.000Z"
    }))
  };
  const adapter: GitHubLoginAdapter = {
    isAvailable: async () => true,
    getCurrentToken: async () => "gho_existing_login",
    launchLogin: async () => ({ userCode: null, verificationUri: null })
  };
  const deviceFlowClient: GitHubDeviceFlowClient = {
    start: vi.fn(async () => {
      throw new Error("device flow should not start when github-cli is preferred");
    }),
    poll: vi.fn(async () => ({
      status: "failed" as const,
      message: "unexpected"
    })),
    lookupViewerLogin: vi.fn(async () => null)
  };
  const service = new DefaultGitHubLoginService(tokenStore as never, createLogger("test"), {
    authMethod: "github-cli",
    oauthClientId: "client-123",
    cliAdapter: adapter,
    deviceFlowClient
  });

  const initialFlow = await service.startFlow();
  const finishedFlow = await waitForTerminalFlow(service, initialFlow.id);

  expect(initialFlow.authMethod).toBe("github-cli");
  expect(finishedFlow.state).toBe("succeeded");
  expect(tokenStore.storeToken).toHaveBeenCalledWith("gho_existing_login");
  expect(deviceFlowClient.start).not.toHaveBeenCalled();
});

test("GitHub login service surfaces the CLI device code in the app instead of a visible terminal flow", async () => {
  const tokenStore = {
    storeToken: vi.fn(async () => ({
      configured: true,
      source: "secure_store" as const,
      updatedAt: "2025-01-01T00:00:00.000Z"
    }))
  };
  let pollCount = 0;
  const adapter: GitHubLoginAdapter = {
    isAvailable: async () => true,
    getCurrentToken: async () => {
      pollCount += 1;
      return pollCount >= 2 ? "gho_cli_login" : null;
    },
    launchLogin: async () => ({
      userCode: "8E4F-7946",
      verificationUri: "https://github.com/login/device"
    })
  };
  const service = new DefaultGitHubLoginService(tokenStore as never, createLogger("test"), {
    cliAdapter: adapter,
    wait: async () => undefined
  });

  const initialFlow = await service.startFlow();
  expect(initialFlow.state).toBe("waiting");
  expect(initialFlow.authMethod).toBe("github-cli");
  expect(initialFlow.userCode).toBe("8E4F-7946");
  expect(initialFlow.verificationUri).toBe("https://github.com/login/device");

  const finishedFlow = await waitForTerminalFlow(service, initialFlow.id);
  expect(finishedFlow.state).toBe("succeeded");
  expect(tokenStore.storeToken).toHaveBeenCalledWith("gho_cli_login");
});
