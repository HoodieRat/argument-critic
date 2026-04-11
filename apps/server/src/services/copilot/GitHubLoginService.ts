import { existsSync } from "node:fs";
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
  launchLogin(): Promise<GitHubCliLoginLaunchResult>;
}

export interface GitHubCliLoginLaunchResult {
  readonly userCode: string | null;
  readonly verificationUri: string | null;
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
  readonly authMethod?: GitHubLoginAuthMethod;
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
const CLI_LOGIN_LAUNCH_TIMEOUT_MS = 20_000;

function getElectronResourcesPath(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return typeof resourcesPath === "string" ? resourcesPath.trim() : "";
}

function resolveGitHubCliExecutable(): string {
  const explicit = process.env.GH_PATH?.trim();
  if (explicit) {
    return explicit;
  }

  const resourcesPath = getElectronResourcesPath();

  const bundledCandidates = [
    resourcesPath
      ? join(resourcesPath, "github-cli", process.platform === "win32" ? "gh.exe" : "gh")
      : "",
    resourcesPath
      ? join(resourcesPath, "app.asar.unpacked", "github-cli", process.platform === "win32" ? "gh.exe" : "gh")
      : "",
    join(process.cwd(), "vendor", "github-cli", process.platform === "win32" ? "gh.exe" : "gh"),
    join(process.cwd(), "build", "vendor", "github-cli", process.platform === "win32" ? "gh.exe" : "gh")
  ].filter((candidate) => candidate.length > 0);

  for (const candidate of bundledCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const onPath = spawnSync(process.platform === "win32" ? "where" : "which", ["gh"], {
    windowsHide: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (onPath.status === 0) {
    return process.platform === "win32" ? "gh.exe" : "gh";
  }

  const candidates = [
    join(process.env.ProgramFiles ?? "", "GitHub CLI", "gh.exe"),
    join(process.env.ProgramFiles ?? "", "GitHub CLI", "bin", "gh.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Programs", "GitHub CLI", "gh.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Programs", "GitHub CLI", "bin", "gh.exe")
  ].filter((candidate) => candidate.length > 0);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return process.platform === "win32" ? "gh.exe" : "gh";
}

export function extractGitHubCliLoginLaunchResult(output: string): GitHubCliLoginLaunchResult | null {
  const codeMatch = output.match(/one-time code(?:\s*\(|:\s*)([A-Z0-9-]{4,})\)?/i);
  const uriMatch = output.match(/https:\/\/github\.com\/login\/device\S*/i);
  if (!codeMatch && !uriMatch) {
    return null;
  }

  return {
    userCode: codeMatch?.[1]?.trim() ?? null,
    verificationUri: uriMatch?.[0]?.trim() ?? DEFAULT_VERIFICATION_URI
  };
}

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

function buildUrlEncodedBody(values: Record<string, string | null | undefined>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && value.length > 0) {
      body.set(key, value);
    }
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
        // Do not constrain the device-flow token to a narrow OAuth scope here.
        // GitHub's device-flow guidance does not require an explicit scope just
        // to authenticate a CLI-style app, and a stored read:user token only
        // unlocked a severely reduced model catalog in live testing.
        client_id: clientId
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
  private readonly executable = resolveGitHubCliExecutable();

  public async isAvailable(): Promise<boolean> {
    const result = spawnSync(this.executable, ["--version"], {
      windowsHide: true,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    return result.status === 0;
  }

  public async getCurrentToken(): Promise<string | null> {
    return await new Promise<string | null>((resolve) => {
      const child = spawn(this.executable, ["auth", "token", "--hostname", "github.com"], {
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

  public async launchLogin(): Promise<GitHubCliLoginLaunchResult> {
    const child = spawn(this.executable, ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--clipboard", "--skip-ssh-key"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    return await new Promise<GitHubCliLoginLaunchResult>((resolve, reject) => {
      let combinedOutput = "";
      let answeredGitPrompt = false;
      let confirmedBrowserOpen = false;
      let resolved = false;

      const finish = (result: GitHubCliLoginLaunchResult): void => {
        if (resolved) {
          return;
        }

        resolved = true;
        clearTimeout(timeout);
        resolve(result);
      };

      const fail = (message: string): void => {
        if (resolved) {
          return;
        }

        resolved = true;
        clearTimeout(timeout);
        reject(new Error(message));
      };

      const readLaunchResult = (): GitHubCliLoginLaunchResult | null => extractGitHubCliLoginLaunchResult(combinedOutput);

      const handleChunk = (chunk: string): void => {
        combinedOutput += chunk;

        if (!answeredGitPrompt && /Authenticate Git with your GitHub credentials\?/i.test(combinedOutput)) {
          answeredGitPrompt = true;
          child.stdin.write("Y\n");
        }

        if (!confirmedBrowserOpen) {
          const openPrompt = combinedOutput.match(/Press Enter to open\s+(https:\/\/github\.com\/login\/device\S*)\s+in your browser/i);
          if (openPrompt) {
            confirmedBrowserOpen = true;
            child.stdin.write("\n");
            finish({
                userCode: extractGitHubCliLoginLaunchResult(combinedOutput)?.userCode ?? null,
              verificationUri: openPrompt[1]?.trim() ?? DEFAULT_VERIFICATION_URI
            });
            return;
          }
        }

        const launchResult = readLaunchResult();
        if (launchResult) {
          finish(launchResult);
        }
      };

      const timeout = setTimeout(() => {
        const launchResult = readLaunchResult();
        if (launchResult) {
          finish(launchResult);
          return;
        }

        child.kill();
        fail("GitHub sign-in did not start correctly. Try Sign in with GitHub again.");
      }, CLI_LOGIN_LAUNCH_TIMEOUT_MS);

      child.stdout.on("data", handleChunk);
      child.stderr.on("data", handleChunk);

      child.once("error", (error) => {
        fail(error.message);
      });

      child.once("close", (code) => {
        if (resolved) {
          return;
        }

        const launchResult = readLaunchResult();
        if (launchResult) {
          finish(launchResult);
          return;
        }

        const normalized = combinedOutput.trim();
        fail(normalized || `GitHub login launcher failed with exit code ${code ?? -1}.`);
      });
    });
  }
}

export class DefaultGitHubLoginService implements GitHubLoginService {
  private readonly flows = new Map<string, MutableGitHubLoginFlow>();
  private runningFlowId: string | null = null;
  private readonly authMethod: GitHubLoginAuthMethod;
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
    this.authMethod = options.authMethod === "oauth-device" && this.oauthClientId ? "oauth-device" : options.authMethod ?? (this.oauthClientId ? "oauth-device" : "github-cli");
    this.cliAdapter = options.cliAdapter ?? new GitHubCliLoginAdapter();
    this.deviceFlowClient = options.deviceFlowClient ?? new GitHubOAuthDeviceFlowClient();
    this.wait = options.wait ?? wait;
  }

  public async hydrateExistingGitHubCliLogin(): Promise<boolean> {
    if (this.authMethod !== "github-cli") {
      return false;
    }

    if (this.tokenStore.getStatus().configured) {
      return false;
    }

    try {
      const available = await this.cliAdapter.isAvailable();
      if (!available) {
        return false;
      }

      const token = await this.cliAdapter.getCurrentToken();
      if (!token) {
        return false;
      }

      await this.tokenStore.storeToken(token);
      return true;
    } catch (error) {
      this.logger.warn("Could not recover an existing GitHub CLI login during startup.", {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
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
      message: "Preparing GitHub sign-in.",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      authMethod: this.authMethod,
      userCode: null,
      verificationUri: null,
      expiresAt: null,
      reviewUri: this.authMethod === "oauth-device" && this.oauthClientId ? `https://github.com/settings/connections/applications/${encodeURIComponent(this.oauthClientId)}` : null,
      accountLogin: null
    };

    this.flows.set(flow.id, flow);
    this.runningFlowId = flow.id;

    if (this.authMethod === "oauth-device") {
      try {
        const deviceFlow = await this.deviceFlowClient.start(this.oauthClientId!);
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

    try {
      const available = await this.cliAdapter.isAvailable();
      if (!available) {
        this.update(flow, {
          state: "failed",
          message: "The GitHub sign-in helper is missing on this build. If this is a source checkout, re-run Install Argument Critic.cmd. If this is an installed build, reinstall Argument Critic from the latest release."
        });
        this.runningFlowId = null;
        return snapshot(flow);
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
        this.runningFlowId = null;
        return snapshot(flow);
      }

      const launch = await this.cliAdapter.launchLogin();
      this.update(flow, {
        state: "waiting",
        message: launch.userCode
          ? "GitHub sign-in is ready. Your browser should open automatically. If GitHub asks for a code, use the one below."
          : "GitHub sign-in was opened in your browser. Finish signing in there.",
        userCode: launch.userCode,
        verificationUri: launch.verificationUri
      });

      void this.completeCliFlow(flow);
      return snapshot(flow);
    } catch (error) {
      this.update(flow, {
        state: "failed",
        message: error instanceof Error ? error.message : "GitHub sign-in could not be started."
      });
      this.runningFlowId = null;
      return snapshot(flow);
    }
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

  private async completeCliFlow(flow: MutableGitHubLoginFlow): Promise<void> {
    try {
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