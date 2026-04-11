import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import { DEFAULT_HOST, DEFAULT_PORT } from "./constants.js";

export type UiShell = "desktop" | "extension" | "none";
export type GitHubLoginAuthMethod = "oauth-device" | "github-cli";

const envSchema = z.object({
  ARGUMENT_CRITIC_HOST: z.string().default(DEFAULT_HOST),
  ARGUMENT_CRITIC_PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  ARGUMENT_CRITIC_DATA_DIR: z.string().optional(),
  ARGUMENT_CRITIC_UI_SHELL: z.enum(["desktop", "extension", "none"]).optional(),
  ARGUMENT_CRITIC_LAUNCH_CHROME: z.enum(["true", "false"]).optional(),
  ARGUMENT_CRITIC_CHROME_EXECUTABLE: z.string().optional(),
  ARGUMENT_CRITIC_GITHUB_MODELS_TOKEN: z.string().optional(),
  ARGUMENT_CRITIC_GITHUB_LOGIN_AUTH_METHOD: z.enum(["github-cli", "oauth-device"]).optional(),
  ARGUMENT_CRITIC_GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
  ARGUMENT_CRITIC_GITHUB_MODEL: z.string().default("gpt-4.1"),
  ARGUMENT_CRITIC_RESEARCH_ENABLED: z.enum(["true", "false"]).default("false")
});

export interface EnvironmentConfig {
  readonly host: string;
  readonly port: number;
  readonly dataDir: string;
  readonly uiShell: UiShell;
  readonly chromeExecutable?: string;
  readonly githubLoginAuthMethod: GitHubLoginAuthMethod;
  readonly githubOAuthClientId?: string;
  readonly githubModel: string;
  readonly researchEnabled: boolean;
}

export interface EnvironmentSecrets {
  readonly githubModelsToken?: string;
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed: Record<string, string> = {};
  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const line = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function parseEnvironment(rootDir: string) {
  const baseEnv = parseEnvFile(resolve(rootDir, ".env"));
  const localEnv = parseEnvFile(resolve(rootDir, ".env.local"));
  return envSchema.parse({
    ...baseEnv,
    ...localEnv,
    ...process.env
  });
}

function resolveUiShell(parsed: ReturnType<typeof parseEnvironment>): UiShell {
  if (parsed.ARGUMENT_CRITIC_UI_SHELL) {
    return parsed.ARGUMENT_CRITIC_UI_SHELL;
  }

  if (parsed.ARGUMENT_CRITIC_LAUNCH_CHROME === "true") {
    return "extension";
  }

  if (parsed.ARGUMENT_CRITIC_LAUNCH_CHROME === "false") {
    return "none";
  }

  return "desktop";
}

function resolveGitHubLoginAuthMethod(parsed: ReturnType<typeof parseEnvironment>): GitHubLoginAuthMethod {
  if (parsed.ARGUMENT_CRITIC_GITHUB_LOGIN_AUTH_METHOD === "oauth-device" && parsed.ARGUMENT_CRITIC_GITHUB_OAUTH_CLIENT_ID) {
    return "oauth-device";
  }

  return "github-cli";
}

export function getEnvironmentConfig(rootDir: string): EnvironmentConfig {
  const parsed = parseEnvironment(rootDir);

  return {
    host: parsed.ARGUMENT_CRITIC_HOST,
    port: parsed.ARGUMENT_CRITIC_PORT,
    dataDir: resolve(rootDir, parsed.ARGUMENT_CRITIC_DATA_DIR ?? "data"),
    uiShell: resolveUiShell(parsed),
    chromeExecutable: parsed.ARGUMENT_CRITIC_CHROME_EXECUTABLE,
    githubLoginAuthMethod: resolveGitHubLoginAuthMethod(parsed),
    githubOAuthClientId: parsed.ARGUMENT_CRITIC_GITHUB_OAUTH_CLIENT_ID,
    githubModel: parsed.ARGUMENT_CRITIC_GITHUB_MODEL,
    researchEnabled: parsed.ARGUMENT_CRITIC_RESEARCH_ENABLED === "true"
  };
}

export function getEnvironmentSecrets(rootDir: string): EnvironmentSecrets {
  const parsed = parseEnvironment(rootDir);

  return {
    githubModelsToken: parsed.ARGUMENT_CRITIC_GITHUB_MODELS_TOKEN
  };
}