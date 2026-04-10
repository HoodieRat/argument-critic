import { expect, test, vi } from "vitest";

import { createLogger } from "../../src/logger.js";

test("structured logs redact token-like values", () => {
  let output = "";
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    return true;
  }) as typeof process.stdout.write);

  try {
    const logger = createLogger("redaction-test");
    logger.info("testing redaction", {
      token: "ghp_super_secret",
      nested: {
        authorization: "Bearer ghp_super_secret",
        apiKey: "abc123",
        safe: "visible"
      }
    });
  } finally {
    writeSpy.mockRestore();
  }

  expect(output).toContain("[REDACTED]");
  expect(output).toContain("visible");
  expect(output).not.toContain("ghp_super_secret");
  expect(output).not.toContain("abc123");
});