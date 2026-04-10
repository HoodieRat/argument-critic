import type { Logger } from "../../logger.js";

const COPILOT_TOKEN_EXCHANGE_ENDPOINT = "https://api.github.com/copilot_internal/v2/token";
const COPILOT_TOKEN_API_VERSION = "2025-04-01";
const DIRECT_TOKEN_REFRESH_BUFFER_SECONDS = 60 * 5;

export type CopilotAccessTokenSource = "direct" | "github-token-exchange";

export interface CopilotAccessTokenRecord {
  readonly token: string;
  readonly source: CopilotAccessTokenSource;
  readonly expiresAt: number | null;
}

export interface ResolvedCopilotAccessToken {
  readonly status: "available";
  readonly token: CopilotAccessTokenRecord;
}

export interface UnavailableCopilotAccessToken {
  readonly status: "unavailable";
  readonly message: string;
  readonly reason: "not_authorized" | "request_failed" | "invalid_response";
}

export type CopilotAccessTokenResolution = ResolvedCopilotAccessToken | UnavailableCopilotAccessToken;

interface CopilotTokenEnvelope {
  readonly token: string;
  readonly expires_at: number;
  readonly refresh_in: number;
}

interface CopilotErrorEnvelope {
  readonly message?: string;
  readonly error_details?: {
    readonly message?: string;
    readonly title?: string;
    readonly url?: string;
  };
}

interface CachedGitHubTokenExchange {
  readonly githubToken: string;
  readonly token: CopilotAccessTokenRecord;
}

type GitHubAuthScheme = "token" | "Bearer";

function isTokenEnvelope(payload: unknown): payload is CopilotTokenEnvelope {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as CopilotTokenEnvelope;
  return typeof candidate.token === "string"
    && typeof candidate.expires_at === "number"
    && typeof candidate.refresh_in === "number";
}

function isErrorEnvelope(payload: unknown): payload is CopilotErrorEnvelope {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as CopilotErrorEnvelope;
  return typeof candidate.message === "string" || typeof candidate.error_details?.message === "string";
}

function isTokenStillFresh(token: CopilotAccessTokenRecord): boolean {
  if (typeof token.expiresAt !== "number") {
    return true;
  }

  return token.expiresAt > Math.floor(Date.now() / 1000) + DIRECT_TOKEN_REFRESH_BUFFER_SECONDS;
}

export class CopilotAccessTokenBroker {
  private cachedExchange: CachedGitHubTokenExchange | null = null;
  private pendingExchange: Promise<CopilotAccessTokenResolution> | null = null;

  public constructor(private readonly logger: Logger) {}

  public async resolve(rawToken: string, options?: { forceRefresh?: boolean; preferExchange?: boolean }): Promise<CopilotAccessTokenResolution> {
    const trimmedToken = rawToken.trim();
    if (!trimmedToken) {
      return {
        status: "unavailable",
        reason: "request_failed",
        message: "A token is required before Copilot access can be resolved."
      };
    }

    if (!options?.preferExchange) {
      return {
        status: "available",
        token: {
          token: trimmedToken,
          source: "direct",
          expiresAt: null
        }
      };
    }

    if (!options?.forceRefresh && this.cachedExchange?.githubToken === trimmedToken && isTokenStillFresh(this.cachedExchange.token)) {
      return {
        status: "available",
        token: this.cachedExchange.token
      };
    }

    if (!options?.forceRefresh && this.pendingExchange) {
      return await this.pendingExchange;
    }

    this.pendingExchange = this.exchangeGitHubToken(trimmedToken);

    try {
      return await this.pendingExchange;
    } finally {
      this.pendingExchange = null;
    }
  }

  private async exchangeGitHubToken(githubToken: string): Promise<CopilotAccessTokenResolution> {
    const schemes: GitHubAuthScheme[] = ["token", "Bearer"];
    let lastFailure: CopilotAccessTokenResolution | null = null;

    for (const scheme of schemes) {
      const attempt = await this.exchangeGitHubTokenWithScheme(githubToken, scheme);
      if (attempt.status === "available") {
        return attempt;
      }

      lastFailure = attempt;

      if (attempt.reason === "request_failed") {
        break;
      }
    }

    return lastFailure ?? {
      status: "unavailable",
      reason: "request_failed",
      message: "Copilot token exchange could not be completed."
    };
  }

  private async exchangeGitHubTokenWithScheme(githubToken: string, authorizationScheme: GitHubAuthScheme): Promise<CopilotAccessTokenResolution> {
    let response: Response;

    try {
      response = await fetch(COPILOT_TOKEN_EXCHANGE_ENDPOINT, {
        headers: {
          Accept: "application/json",
          Authorization: `${authorizationScheme} ${githubToken}`,
          "X-GitHub-Api-Version": COPILOT_TOKEN_API_VERSION,
          "Editor-Version": "vscode/1.100.0",
          "Editor-Plugin-Version": "copilot-chat/1.0.0",
          "Copilot-Language-Server-Version": "1.0.0",
          "User-Agent": "ArgumentCritic/1.0.0"
        },
        signal: AbortSignal.timeout(10_000)
      });
    } catch (error) {
      return {
        status: "unavailable",
        reason: "request_failed",
        message: error instanceof Error ? error.message : String(error)
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      return {
        status: "unavailable",
        reason: "invalid_response",
        message: error instanceof Error ? error.message : "Copilot token exchange returned unreadable JSON."
      };
    }

    if (!response.ok) {
      if (response.status === 401) {
        return {
          status: "unavailable",
          reason: "not_authorized",
          message: "The saved GitHub token could not be authorized for Copilot access."
        };
      }

      if (isErrorEnvelope(payload)) {
        return {
          status: "unavailable",
          reason: "not_authorized",
          message: payload.error_details?.message ?? payload.message ?? "The saved GitHub token does not have Copilot access."
        };
      }

      return {
        status: "unavailable",
        reason: "request_failed",
        message: `Copilot token exchange failed with ${response.status}.`
      };
    }

    if (!isTokenEnvelope(payload)) {
      return {
        status: "unavailable",
        reason: "invalid_response",
        message: "Copilot token exchange returned an unexpected payload."
      };
    }

    const token: CopilotAccessTokenRecord = {
      token: payload.token.trim(),
      source: "github-token-exchange",
      expiresAt: payload.expires_at
    };

    this.cachedExchange = {
      githubToken,
      token
    };

    this.logger.info("Resolved Copilot access token from saved GitHub token.", {
      tokenSource: token.source
    });

    return {
      status: "available",
      token
    };
  }
}