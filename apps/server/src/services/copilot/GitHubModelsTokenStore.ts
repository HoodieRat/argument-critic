import { spawn } from "node:child_process";
import { join } from "node:path";

import type { Logger } from "../../logger.js";
import { nowIso } from "../../utils/time.js";
import { SettingsRepository } from "../db/repositories/SettingsRepository.js";

const TOKEN_KEY = "secrets.githubModelsToken";
const REDACTED_MESSAGE = "[REDACTED]";

const ENCRYPT_SCRIPT = [
  "$payload = [Console]::In.ReadToEnd()",
  "if ([string]::IsNullOrWhiteSpace($payload)) { throw 'Token input was empty.' }",
  "$secure = ConvertTo-SecureString $payload -AsPlainText -Force",
  "$encrypted = ConvertFrom-SecureString $secure",
  "[Console]::Out.Write($encrypted)"
].join("; ");

const DECRYPT_SCRIPT = [
  "$payload = [Console]::In.ReadToEnd()",
  "if ([string]::IsNullOrWhiteSpace($payload)) { throw 'Encrypted token payload was empty.' }",
  "$secure = ConvertTo-SecureString $payload",
  "$plain = [System.Net.NetworkCredential]::new('', $secure).Password",
  "[Console]::Out.Write($plain)"
].join("; ");

export type GitHubModelsTokenSource = "secure_store" | "environment" | "none";

export interface GitHubModelsTokenStatus {
  readonly configured: boolean;
  readonly source: GitHubModelsTokenSource;
  readonly updatedAt: string | null;
}

interface StoredTokenRecord {
  readonly scheme: "windows-dpapi";
  readonly cipherText: string;
  readonly updatedAt: string;
}

function isStoredTokenRecord(value: unknown): value is StoredTokenRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredTokenRecord>;
  return candidate.scheme === "windows-dpapi" && typeof candidate.cipherText === "string" && typeof candidate.updatedAt === "string";
}

function resolvePowerShellExecutable(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (systemRoot) {
    return join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  }

  return "powershell.exe";
}

async function runPowerShell(script: string, stdinPayload: string): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("Secure token storage is currently supported only on Windows."));
      return;
    }

    resolve();
  });

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(resolvePowerShellExecutable(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}.`));
        return;
      }

      resolve(stdout);
    });

    child.stdin.end(stdinPayload);
  });
}

export class GitHubModelsTokenStore {
  public constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly logger: Logger,
    private readonly environmentToken?: string
  ) {}

  public getStatus(): GitHubModelsTokenStatus {
    const stored = this.readStoredRecord();
    if (stored) {
      return {
        configured: true,
        source: "secure_store",
        updatedAt: stored.updatedAt
      };
    }

    if (this.environmentToken) {
      return {
        configured: true,
        source: "environment",
        updatedAt: null
      };
    }

    return {
      configured: false,
      source: "none",
      updatedAt: null
    };
  }

  public async getToken(): Promise<string | undefined> {
    const stored = this.readStoredRecord();
    if (stored) {
      try {
        return await runPowerShell(DECRYPT_SCRIPT, stored.cipherText);
      } catch (error) {
        this.logger.error("Stored GitHub Models token could not be decrypted.", {
          error: error instanceof Error ? error.message : String(error),
          token: REDACTED_MESSAGE
        });
      }
    }

    return this.environmentToken;
  }

  public async storeToken(token: string): Promise<GitHubModelsTokenStatus> {
    const normalized = token.trim();
    if (!normalized) {
      throw new Error("A GitHub Models token is required.");
    }

    const cipherText = await runPowerShell(ENCRYPT_SCRIPT, normalized);
    this.settingsRepository.set(TOKEN_KEY, {
      scheme: "windows-dpapi",
      cipherText,
      updatedAt: nowIso()
    } satisfies StoredTokenRecord);

    return this.getStatus();
  }

  public clearStoredToken(): GitHubModelsTokenStatus {
    this.settingsRepository.delete(TOKEN_KEY);
    return this.getStatus();
  }

  private readStoredRecord(): StoredTokenRecord | undefined {
    const stored = this.settingsRepository.get<StoredTokenRecord | null>(TOKEN_KEY, null);
    if (stored === null) {
      return undefined;
    }

    if (!isStoredTokenRecord(stored)) {
      this.logger.warn("Ignoring invalid stored GitHub Models token metadata.");
      return undefined;
    }

    return stored;
  }
}