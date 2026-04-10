import { expect, test, vi } from "vitest";

import { createLogger } from "../../src/logger.js";
import {
  DefaultGitHubLoginService,
  type GitHubLoginAdapter,
  type GitHubDeviceFlowClient,
  type GitHubLoginFlowSnapshot,
  type GitHubLoginService
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
    launchLogin: async () => undefined
  };
  const service = new DefaultGitHubLoginService(tokenStore as never, createLogger("test"), { cliAdapter: adapter });

  const initialFlow = await service.startFlow();
  const finishedFlow = await waitForTerminalFlow(service, initialFlow.id);

  expect(finishedFlow.state).toBe("failed");
  expect(finishedFlow.authMethod).toBe("github-cli");
  expect(finishedFlow.message).toContain("direct GitHub browser sign-in");
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
