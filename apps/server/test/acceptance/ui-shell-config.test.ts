import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { afterEach, expect, test } from "vitest";

import { getEnvironmentConfig } from "../../src/config/env.js";

const rootDir = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

test("defaults to the desktop shell when no legacy browser flag is set", () => {
  delete process.env.ARGUMENT_CRITIC_UI_SHELL;
  delete process.env.ARGUMENT_CRITIC_LAUNCH_CHROME;

  const config = getEnvironmentConfig(rootDir);
  expect(config.uiShell).toBe("desktop");
});

test("maps the legacy browser flag to the extension shell", () => {
  delete process.env.ARGUMENT_CRITIC_UI_SHELL;
  process.env.ARGUMENT_CRITIC_LAUNCH_CHROME = "true";

  const config = getEnvironmentConfig(rootDir);
  expect(config.uiShell).toBe("extension");
});

test("lets the explicit shell override the legacy browser flag", () => {
  process.env.ARGUMENT_CRITIC_UI_SHELL = "none";
  process.env.ARGUMENT_CRITIC_LAUNCH_CHROME = "true";

  const config = getEnvironmentConfig(rootDir);
  expect(config.uiShell).toBe("none");
});

test("loads maintainer overrides from .env.local", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "argument-critic-env-"));

  try {
    await writeFile(
      join(tempRoot, ".env.local"),
      "ARGUMENT_CRITIC_GITHUB_OAUTH_CLIENT_ID=client-123\nARGUMENT_CRITIC_UI_SHELL=none\n",
      "utf8"
    );

    const config = getEnvironmentConfig(tempRoot);
    expect(config.githubLoginAuthMethod).toBe("github-cli");
    expect(config.githubOAuthClientId).toBe("client-123");
    expect(config.uiShell).toBe("none");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("lets maintainers explicitly opt back into OAuth device flow", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "argument-critic-env-"));

  try {
    await writeFile(
      join(tempRoot, ".env.local"),
      "ARGUMENT_CRITIC_GITHUB_LOGIN_AUTH_METHOD=oauth-device\nARGUMENT_CRITIC_GITHUB_OAUTH_CLIENT_ID=client-123\n",
      "utf8"
    );

    const config = getEnvironmentConfig(tempRoot);
    expect(config.githubLoginAuthMethod).toBe("oauth-device");
    expect(config.githubOAuthClientId).toBe("client-123");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});