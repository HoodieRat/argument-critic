export interface Logger {
  readonly info: (message: string, detail?: Record<string, unknown>) => void;
  readonly warn: (message: string, detail?: Record<string, unknown>) => void;
  readonly error: (message: string, detail?: Record<string, unknown>) => void;
  readonly debug: (message: string, detail?: Record<string, unknown>) => void;
}

const SECRET_KEY_PATTERN = /(token|secret|password|authorization|cookie|api[-_]?key)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

function sanitizeForLogging(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return value.replace(BEARER_PATTERN, "Bearer [REDACTED]");
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForLogging(entry, key, seen));
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [childKey, sanitizeForLogging(childValue, childKey, seen)])
    );
  }

  return value;
}

function write(level: string, scope: string, message: string, detail?: Record<string, unknown>): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    detail: (sanitizeForLogging(detail ?? {}) as Record<string, unknown>)
  };

  const line = `${JSON.stringify(payload)}\n`;
  if (level === "error") {
    process.stderr.write(line);
    return;
  }

  process.stdout.write(line);
}

export function createLogger(scope: string): Logger {
  return {
    info: (message, detail) => write("info", scope, message, detail),
    warn: (message, detail) => write("warn", scope, message, detail),
    error: (message, detail) => write("error", scope, message, detail),
    debug: (message, detail) => write("debug", scope, message, detail)
  };
}