import { describe, expect, test } from "vitest";

import { MANAGED_EXTENSION_ID } from "../../src/config/constants.js";
import { createTestHarness, parseJson } from "./testHarness.js";

describe("local request security", () => {
  test("rejects untrusted browser origins", async () => {
    const harness = await createTestHarness();

    try {
      const reply = await harness.app.inject({
        method: "GET",
        url: "/runtime/status",
        headers: {
          host: "127.0.0.1:4317",
          origin: "http://attacker.example",
          "user-agent": "Mozilla/5.0"
        }
      });

      expect(reply.statusCode).toBe(403);
      expect(reply.body).toBe("Argument Critic rejected an untrusted browser origin.");
    } finally {
      await harness.cleanup();
    }
  });

  test("accepts trusted loopback origins", async () => {
    const harness = await createTestHarness();

    try {
      const reply = await harness.app.inject({
        method: "GET",
        url: "/runtime/status",
        headers: {
          host: "127.0.0.1:4317",
          origin: "http://127.0.0.1:3000",
          "user-agent": "Mozilla/5.0"
        }
      });

      expect(reply.statusCode).toBe(200);
      expect(parseJson<{ ready: boolean }>(reply.body).ready).toBe(true);
      expect(reply.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3000");
    } finally {
      await harness.cleanup();
    }
  });

  test("accepts the managed extension origin", async () => {
    const harness = await createTestHarness();

    try {
      const reply = await harness.app.inject({
        method: "GET",
        url: "/runtime/status",
        headers: {
          host: "127.0.0.1:4317",
          origin: `chrome-extension://${MANAGED_EXTENSION_ID}`,
          "user-agent": "Mozilla/5.0"
        }
      });

      expect(reply.statusCode).toBe(200);
      expect(reply.headers["access-control-allow-origin"]).toBe(`chrome-extension://${MANAGED_EXTENSION_ID}`);
    } finally {
      await harness.cleanup();
    }
  });

  test("accepts Electron desktop requests with a null origin", async () => {
    const harness = await createTestHarness();

    try {
      const reply = await harness.app.inject({
        method: "GET",
        url: "/runtime/status",
        headers: {
          host: "127.0.0.1:4317",
          origin: "null",
          "user-agent": "Mozilla/5.0 ArgumentCritic Electron/35.2.0"
        }
      });

      expect(reply.statusCode).toBe(200);
      expect(reply.headers["access-control-allow-origin"]).toBe("null");
    } finally {
      await harness.cleanup();
    }
  });

  test("rejects null-origin requests that are not coming from Electron", async () => {
    const harness = await createTestHarness();

    try {
      const reply = await harness.app.inject({
        method: "GET",
        url: "/runtime/status",
        headers: {
          host: "127.0.0.1:4317",
          origin: "null",
          "user-agent": "Mozilla/5.0 Chrome/135.0.0.0"
        }
      });

      expect(reply.statusCode).toBe(403);
      expect(reply.body).toBe("Argument Critic rejected an untrusted browser origin.");
    } finally {
      await harness.cleanup();
    }
  });
});