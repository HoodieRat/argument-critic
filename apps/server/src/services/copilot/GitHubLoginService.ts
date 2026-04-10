import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { Logger } from "../../logger.js";
import type { GitHubModelsTokenStore } from "./GitHubModelsTokenStore.js";

export type GitHubLoginFlowState = "checking" | "waiting" | "importing" | "succeeded" | "failed";
export type GitHubLoginAuthMethod = "oauth-device" | "github-cli";

const GITHUB_DEVICE_CODE_ENDPOINT = "https://github.com/login/device/code";
const GITHUB_OAUTH_ACCESS_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const GITHUB_DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const DEFAULT_VERIFICATION_URI = "https://github.com/login/device";
const DEFAULT_DEVICE_SCOPE = "read:user";

export interface GitHubLoginFlowSnapshot {
  readonly id: string;
  readonly state: GitHubLoginFlowState;
  readonly message: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly authMethod: GitHubLoginAuthMethod;
  readonly userCode: string | null;
  readonly verificationUri: string | null;
  readonly expiresAt: string | null;
  readonly reviewUri: string | null;
  readonly accountLogin: string | null;
}

export interface GitHubLoginService {
  startFlow(): Promise<GitHubLoginFlowSnapshot>;
  getFlow(flowId: string): GitHubLoginFlowSnapshot | null;
}

export interface GitHubLoginAdapter {
  isAvailable(): Promise<boolean>;
  getCurrentToken(): Promise<string | null>;
  launchLogin(): Promise<void>;
}

export interface GitHubDeviceFlowStartResult {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly expiresAt: string;
  readonly intervalSeconds: number;
}

export type GitHubDeviceFlowPollResult =
  | { readonly status: "pending"; readonly intervalSeconds: number | null }
  | { readonly status: "approved"; readonly accessToken: string }
  | { readonly status: "failed"; readonly message: string };

export interface GitHubDeviceFlowClient {
  start(clientId: string): Promise<GitHubDeviceFlowStartResult>;
  poll(clientId: string, deviceCode: string): Promise<GitHubDeviceFlowPollResult>;
  lookupViewerLogin(token: string): Promise<string | null>;
}

export interface DefaultGitHubLoginServiceOptions {
  readonly oauthClientId?: string;
  readonly cliAdapter?: GitHubLoginAdapter;
  readonly deviceFlowClient?: GitHubDeviceFlowClient;
  readonly wait?: (delayMs: number) => Promise<void>;
}

interface MutableGitHubLoginFlow {
  id: string;
  state: GitHubLoginFlowState;
  message: string;
  startedAt: string;
  updatedAt: string;
  authMethod: GitHubLoginAuthMethod;
  userCode: string | null;
  verificationUri: string | null;
  expiresAt: string | null;
  reviewUri: string | null;
  accountLogin: string | null;
}

const FLOW_TIMEOUT_MS = 5 * 60_000;
const FLOW_POLL_INTERVAL_MS = 1_500;

function resolvePowerShellExecutable(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (systemRoot) {
    return join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  }

  return "powershell.exe";
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function snapshot(flow: MutableGitHubLoginFlow): GitHubLoginFlowSnapshot {
  return {
    id: flow.id,
    state: flow.state,
    message: flow.message,
    startedAt: flow.startedAt,
    updatedAt: flow.updatedAt,
    authMethod: flow.authMethod,
    userCode: flow.userCode,
    verificationUri: flow.verificationUri,
    expiresAt: flow.expiresAt,
    reviewUri: flow.reviewUri,
    accountLogin: flow.accountLogin
  };
}

function buildUrlEncodedBody(values: Record<string, string>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    body.set(key, value);
  }
  return body.toString();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function readMessage(payload: unknown): string | null {
  if (!isObjectRecord(payload)) {
    return null;
  }

  return typeof payload.error_description === "string"
    ? payload.error_description
    : typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string"
        ? payload.error
        : null;
}

export class GitHubOAuthDeviceFlowClient implements GitHubDeviceFlowClient {
  public async start(clientId: string): Promise<GitHubDeviceFlowStartResult> {
    const response = await fetch(GITHUB_DEVICE_CODE_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ArgumentCritic/1.0.0"
      },
      body: buildUrlEncodedBody({
        client_id: clientId,
        scope: DEFAULT_DEVICE_SCOPE
      }),
      signal: AbortSignal.timeout(10_000)
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "GitHub sign-in returned unreadable JSON.");
    }

    if (!response.ok) {
      throw new Error(readMessage(payload) ?? `GitHub sign-in setup failed with ${response.status}.`);
    }

    if (!isObjectRecord(payload)) {
      throw new Error("GitHub sign-in setup returned an unexpected response.");
    }

    const deviceCode = typeof payload.device_code === "string" ? payload.device_code.trim() : "";
    const userCode = typeof payload.user_code === "string" ? payload.user_code.trim() : "";
    const verificationUri = typeof payload.verification_uri === "string" && payload.verification_uri.trim()
      ? payload.verification_uri.trim()
      : DEFAULT_VERIFICATION_URI;
    const expiresInSeconds = parsePositiveInteger(payload.expires_in, 900);
    const intervalSeconds = parsePositiveInteger(payload.interval, 5);

    if (!deviceCode || !userCode) {
      throw new Error("GitHub sign-in did not return a device code.");
    }

    return {
      deviceCode,
      userCode,
      verificationUri,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000).toISOString(),
      intervalSeconds
    };
  }

  public async poll(clientId: string, deviceCode: string): Promise<GitHubDeviceFlowPollResult> {
    const response = await fetch(GITHUB_OAUTH_ACCESS_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ArgumentCritic/1.0.0"
      },
      body: buildUrlEncodedBody({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: GITHUB_DEVICE_GRANT_TYPE
      }),
      signal: AbortSignal.timeout(10_000)
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : "GitHub sign-in returned unreadable JSON."
      };
    }

    if (response.ok && isObjectRecord(payload) && typeof payload.access_token === "string" && payload.access_token.trim()) {
      return {
        status: "approved",
        accessToken: payload.access_token.trim()
      };
    }

    const errorCode = isObjectRecord(payload) && typeof payload.error === "string" ? payload.error.trim().toLowerCase() : "";
    const nextInterval = isObjectRecord(payload) ? parsePositiveInteger(payload.interval, 5) : 5;

    if (errorCode === "authorization_pending") {
      return {
        status: "pending",
        intervalSeconds: nextInterval
      };
    }

    if (errorCode === "slow_down") {
      return {
        status: "pending",
        intervalSeconds: Math.max(nextInterval, 5)
      };
    }

    if (errorCode === "access_denied") {
      return {
        status: "failed",
        message: "GitHub sign-in was cancelled. Start sign-in again when you're ready."
      };
    }

    if (errorCode === "expired_token" || errorCode === "token_expired") {
      return {
        status: "failed",
        message: "That GitHub sign-in code expired. Start sign-in again to get a new code."
      };
    }

    if (errorCode === "incorrect_client_credentials") {
      return {
        status: "failed",
        message: "This build is using an invalid GitHub OAuth client ID."
      };
    }

    if (errorCode === "device_flow_disabled") {
      return {
        status: "failed",
        message: "Device flow is not enabled for this GitHub OAuth app configuration."
      };
    }

    if (errorCode === "incorrect_device_code") {
      return {
        status: "failed",
        message: "GitHub rejected the device code. Start sign-in again."
      };
    }

    if (errorCode === "unsupported_grant_type") {
      return {
        status: "failed",
        message: "GitHub rejected the device-flow grant type for this sign-in request."
      };
    }

    return {
      status: "failed",
      message: readMessage(payload) ?? `GitHub sign-in polling failed with ${response.status}.`
    };
  }

  public async lookupViewerLogin(token: string): Promise<string | null> {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "ArgumentCritic/1.0.0"
      },
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    return payload && typeof payload.login === "string" && payload.login.trim() ? payload.login.trim() : null;
  }
}

export class GitHubCliLoginAdapter implements GitHubLoginAdapter {
  public async isAvailable(): Promise<boolean> {
    const result = spawnSync("gh", ["--version"], {
      windowsHide: true,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    return result.status === 0;
  }

  public async getCurrentToken(): Promise<string | null> {
    return await new Promise<string | null>((resolve) => {
      const child = spawn("gh", ["auth", "token", "--hostname", "github.com"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });

      child.once("error", () => resolve(null));
      child.once("close", (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }

        const normalized = stdout.trim();
        resolve(normalized ? normalized : null);
      });
    });
  }

  public async launchLogin(): Promise<void> {
    const argumentsList = "'auth','login','--hostname','github.com','--git-protocol','https','--web','--skip-ssh-key'";

    if (process.platform === "win32") {
      await new Promise<void>((resolve, reject) => {
        const launcher = spawn(resolvePowerShellExecutable(), [
          "-NoLogo",
          "-NoProfile",
          "-Command",
          `Start-Process -FilePath 'gh' -ArgumentList ${argumentsList} -WindowStyle Normal`
        ], {
          windowsHide: true,
          stdio: "ignore"
        });

        launcher.once("error", reject);
        launcher.once("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(`GitHub login launcher failed with exit code ${code ?? -1}.`));
        });
      });

      return;
    }

    const child = spawn("gh", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--skip-ssh-key"], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
  }
}

export class DefaultGitHubLoginService implements GitHubLoginService {
  private readonly flows = new Map<string, MutableGitHubLoginFlow>();
  private runningFlowId: string | null = null;
  private readonly oauthClientId?: string;
  private readonly cliAdapter: GitHubLoginAdapter;
  private readonly deviceFlowClient: GitHubDeviceFlowClient;
  private readonly wait: (delayMs: number) => Promise<void>;

  public constructor(
    private readonly tokenStore: GitHubModelsTokenStore,
    private readonly logger: Logger,
    options: DefaultGitHubLoginServiceOptions = {}
  ) {
    this.oauthClientId = options.oauthClientId?.trim() || undefined;
    this.cliAdapter = options.cliAdapter ?? new GitHubCliLoginAdapter();
    this.deviceFlowClient = options.deviceFlowClient ?? new GitHubOAuthDeviceFlowClient();
    this.wait = options.wait ?? wait;
  }

  public async startFlow(): Promise<GitHubLoginFlowSnapshot> {
    if (this.runningFlowId) {
      const existing = this.flows.get(this.runningFlowId);
      if (existing && ["checking", "waiting", "importing"].includes(existing.state)) {
        return snapshot(existing);
      }
    }

    const flow: MutableGitHubLoginFlow = {
      id: randomUUID(),
      state: "checking",
      message: this.oauthClientId ? "Preparing GitHub sign-in." : "Checking GitHub sign-in on this machine.",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      authMethod: this.oauthClientId ? "oauth-device" : "github-cli",
      userCode: null,
      verificationUri: null,
      expiresAt: null,
      reviewUri: this.oauthClientId ? `https://github.com/settings/connections/applications/${encodeURIComponent(this.oauthClientId)}` : null,
      accountLogin: null
    };

    this.flows.set(flow.id, flow);
    this.runningFlowId = flow.id;

    if (this.oauthClientId) {
      try {
        const deviceFlow = await this.deviceFlowClient.start(this.oauthClientId);
        this.update(flow, {
          state: "waiting",
          message: "GitHub sign-in is ready. Paste the one-time code into GitHub to finish connecting.",
          userCode: deviceFlow.userCode,
          verificationUri: deviceFlow.verificationUri,
          expiresAt: deviceFlow.expiresAt
        });
        void this.completeDeviceFlow(flow, deviceFlow);
      } catch (error) {
        this.update(flow, {
          state: "failed",
          message: error instanceof Error ? error.message : "GitHub sign-in could not be started."
        });
        this.runningFlowId = null;
      }

      return snapshot(flow);
    }

    void this.runCliFlow(flow);
    return snapshot(flow);
  }

  public getFlow(flowId: string): GitHubLoginFlowSnapshot | null {
    const flow = this.flows.get(flowId);
    return flow ? snapshot(flow) : null;
  }

  private update(flow: MutableGitHubLoginFlow, patch: Partial<Omit<MutableGitHubLoginFlow, "id" | "startedAt">>): void {
    if (patch.state) {
      flow.state = patch.state;
    }
    if (typeof patch.message === "string") {
      flow.message = patch.message;
    }
    if (typeof patch.authMethod === "string") {
      flow.authMethod = patch.authMethod;
    }
    if (patch.userCode !== undefined) {
      flow.userCode = patch.userCode;
    }
    if (patch.verificationUri !== undefined) {
      flow.verificationUri = patch.verificationUri;
    }
    if (patch.expiresAt !== undefined) {
      flow.expiresAt = patch.expiresAt;
    }
    if (patch.reviewUri !== undefined) {
      flow.reviewUri = patch.reviewUri;
    }
    if (patch.accountLogin !== undefined) {
      flow.accountLogin = patch.accountLogin;
    }
    flow.updatedAt = new Date().toISOString();
  }

  private async runCliFlow(flow: MutableGitHubLoginFlow): Promise<void> {
    try {
      const available = await this.cliAdapter.isAvailable();
      if (!available) {
        this.update(flow, {
          state: "failed",
          message: "This build does not support direct GitHub browser sign-in yet. Install GitHub CLI from cli.github.com, or ask the app maintainer to enable built-in browser sign-in."
        });
        return;
      }

      const existingToken = await this.cliAdapter.getCurrentToken();
      if (existingToken) {
        this.update(flow, {
          state: "importing",
          message: "Importing your existing GitHub login."
        });
        await this.tokenStore.storeToken(existingToken);
        this.update(flow, {
          state: "succeeded",
          message: "GitHub sign-in imported. Refreshing models now."
        });
        return;
      }

      this.update(flow, {
        state: "waiting",
        message: "GitHub sign-in was opened in your browser. Finish signing in there."
      });
      await this.cliAdapter.launchLogin();

      const deadline = Date.now() + FLOW_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await this.wait(FLOW_POLL_INTERVAL_MS);
        const token = await this.cliAdapter.getCurrentToken();
        if (!token) {
          continue;
        }

        this.update(flow, {
          state: "importing",
          message: "Importing your GitHub login."
        });
        await this.tokenStore.storeToken(token);
        this.update(flow, {
          state: "succeeded",
          message: "GitHub sign-in complete. Refreshing models now."
        });
        return;
      }

      this.update(flow, {
        state: "failed",
        message: "GitHub sign-in did not finish in time. Try Sign in with GitHub again."
      });
    } catch (error) {
      this.logger.warn("GitHub sign-in flow failed.", {
        error: error instanceof Error ? error.message : String(error)
      });
      this.update(flow, {
        state: "failed",
        message: error instanceof Error ? error.message : "GitHub sign-in failed."
      });
    } finally {
      if (this.runningFlowId === flow.id) {
        this.runningFlowId = null;
      }
    }
  }

  private async completeDeviceFlow(flow: MutableGitHubLoginFlow, deviceFlow: GitHubDeviceFlowStartResult): Promise<void> {
    try {
      if (!this.oauthClientId) {
        this.update(flow, {
          state: "failed",
          message: "GitHub sign-in is not configured for this build."
        });
        return;
      }

      let nextPollMs = Math.max(deviceFlow.intervalSeconds, 1) * 1_000;
      const deadline = Date.parse(deviceFlow.expiresAt);

      while (!Number.isNaN(deadline) && Date.now() < deadline) {
        await this.wait(nextPollMs);
        const result = await this.deviceFlowClient.poll(this.oauthClientId, deviceFlow.deviceCode);

        if (result.status === "pending") {
          nextPollMs = Math.max(result.intervalSeconds ?? deviceFlow.intervalSeconds, 1) * 1_000;
          continue;
        }

        if (result.status === "failed") {
          this.update(flow, {
            state: "failed",
            message: result.message
          });
          return;
        }

        this.update(flow, {
          state: "importing",
          message: "Importing your GitHub sign-in."
        });
        await this.tokenStore.storeToken(result.accessToken);
        const accountLogin = await this.deviceFlowClient.lookupViewerLogin(result.accessToken);
        this.update(flow, {
          state: "succeeded",
          message: accountLogin ? `GitHub sign-in complete for ${accountLogin}. Refreshing models now.` : "GitHub sign-in complete. Refreshing models now.",
          accountLogin
        });
        return;
      }

      this.update(flow, {
        state: "failed",
        message: "That GitHub sign-in code expired. Start sign-in again to get a new code."
      });
    } catch (error) {
      this.logger.warn("GitHub device sign-in flow failed.", {
        error: error instanceof Error ? error.message : String(error)
      });
      this.update(flow, {
        state: "failed",
        message: error instanceof Error ? error.message : "GitHub sign-in failed."
      });
    } finally {
      if (this.runningFlowId === flow.id) {
        this.runningFlowId = null;
      }
    }
  }
}