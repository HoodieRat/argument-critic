import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { startApplication } from "../../../../scripts/start.js";

async function getAvailablePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not determine an available port."));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function waitForFetchFailure(url: string, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
    } catch {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for the app to stop listening.");
}

test.sequential("application serves the startup page and shuts down cleanly", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "argument-critic-startup-"));
  const originalEnv = { ...process.env };
  const port = await getAvailablePort();

  try {
    process.env.ARGUMENT_CRITIC_DATA_DIR = dataDir;
    process.env.ARGUMENT_CRITIC_UI_SHELL = "none";
    process.env.ARGUMENT_CRITIC_PORT = String(port);

    const handle = await startApplication({ shell: "none" });

    const startupResponse = await fetch(handle.readyUrl);
    const startupHtml = await startupResponse.text();
    expect(startupResponse.status).toBe(200);
    expect(startupResponse.headers.get("content-type")).toContain("text/html");
    expect(startupHtml).toContain("The local companion is running.");

    const faviconResponse = await fetch(`${handle.readyUrl}/favicon.ico`);
    expect(faviconResponse.status).toBe(204);

    const shutdownResponse = await fetch(`${handle.readyUrl}/runtime/shutdown`, {
      method: "POST"
    });
    const shutdownBody = (await shutdownResponse.json()) as { accepted: boolean };
    expect(shutdownResponse.status).toBe(200);
    expect(shutdownBody.accepted).toBe(true);

    await waitForFetchFailure(`${handle.readyUrl}/health`);
    await handle.shutdown("test-cleanup");
  } finally {
    process.env = originalEnv;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test.sequential("second startup on the same port reuses the running local companion instead of failing", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "argument-critic-reuse-"));
  const originalEnv = { ...process.env };
  const port = await getAvailablePort();

  try {
    process.env.ARGUMENT_CRITIC_DATA_DIR = dataDir;
    process.env.ARGUMENT_CRITIC_UI_SHELL = "none";
    process.env.ARGUMENT_CRITIC_PORT = String(port);

    const firstHandle = await startApplication({ shell: "none" });
    const secondHandle = await startApplication({ shell: "none" });

    expect(secondHandle.readyUrl).toBe(firstHandle.readyUrl);
    expect(secondHandle.reusedExistingServer).toBe(true);

    const healthWhileAttached = await fetch(`${firstHandle.readyUrl}/health`).then((response) => response.json() as Promise<{ ok: boolean; app: string }>);
    expect(healthWhileAttached.ok).toBe(true);
    expect(healthWhileAttached.app).toBe("argument-critic");

    await secondHandle.shutdown("attached-launcher-cleanup");

    const healthAfterAttachedShutdown = await fetch(`${firstHandle.readyUrl}/health`).then((response) => response.json() as Promise<{ ok: boolean; app: string }>);
    expect(healthAfterAttachedShutdown.ok).toBe(true);
    expect(healthAfterAttachedShutdown.app).toBe("argument-critic");

    await firstHandle.shutdown("primary-launcher-cleanup");
    await waitForFetchFailure(`${firstHandle.readyUrl}/health`);
  } finally {
    process.env = originalEnv;
    await rm(dataDir, { recursive: true, force: true });
  }
});