export const APP_NAME = "Argument Critic";
export const DEFAULT_PORT = 4317;
export const DEFAULT_HOST = "127.0.0.1";
export const ACTIVE_QUESTION_LIMIT = 5;
export const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 2_500;
export const PROCESS_REGISTRY_FILE = "process-registry.json";
export const MANAGED_CHROME_MARKER = "managed-chrome.json";
export const MANAGED_EXTENSION_ID = "lihkenmbjimknbadoamjgpfpmfapmdkh";
export const DEFAULT_CRITICALITY_MULTIPLIER = 1;
export const MIN_CRITICALITY_MULTIPLIER = 0.1;
export const MAX_CRITICALITY_MULTIPLIER = 10;
export const DEFAULT_STRUCTURED_OUTPUT_ENABLED = true;
export const DEFAULT_IMAGE_TEXT_EXTRACTION_ENABLED = true;

export const QUESTION_STATUSES = [
  "unanswered",
  "answered",
  "resolved",
  "archived",
  "dismissed",
  "superseded"
] as const;

export const CONTRADICTION_STATUSES = [
  "open",
  "reviewed",
  "resolved",
  "downgraded"
] as const;

export const RESPONSE_PROVENANCE = [
  "database",
  "ai",
  "hybrid",
  "research"
] as const;

export const VAGUE_TERMS = [
  "better",
  "good",
  "bad",
  "effective",
  "efficient",
  "fair",
  "reasonable",
  "strong",
  "weak",
  "optimal"
] as const;