import type { Logger } from "../../logger.js";
import { CopilotAccessTokenBroker, type CopilotAccessTokenResolution } from "./CopilotAccessTokenBroker.js";
import type { GitHubModelsTokenStore } from "./GitHubModelsTokenStore.js";

const COPILOT_MODELS_ENDPOINT = "https://api.githubcopilot.com/models";
const GITHUB_MODELS_CATALOG_ENDPOINT = "https://models.github.ai/catalog/models";
const GITHUB_MODELS_API_VERSION = "2026-03-10";
const CACHE_TTL_MS = 60_000;

export type CopilotEndpointKind = "chat/completions" | "responses" | "messages";
export type ModelAccessBackend = "copilot" | "github-models" | "none";
export type ModelAccessTokenKind = "copilot" | "oauth_token" | "personal_access_token" | "unknown" | "none";

export interface CopilotModelOption {
  readonly id: string;
  readonly name: string;
  readonly vendor: string;
  readonly family: string;
  readonly preview: boolean;
  readonly isDefault: boolean;
  readonly isFallback: boolean;
  readonly isPremium: boolean;
  readonly multiplier: number | null;
  readonly degradationReason: string | null;
  readonly supportsVision: boolean;
  readonly supportsToolCalls: boolean;
  readonly supportsThinking: boolean;
  readonly supportsAdaptiveThinking: boolean;
  readonly supportsReasoningEffort: string[];
  readonly minThinkingBudget: number | null;
  readonly maxThinkingBudget: number | null;
  readonly maxInputTokens: number | null;
  readonly maxOutputTokens: number | null;
  readonly supportedEndpoints: string[];
}

export interface ModelAccessStatus {
  readonly backend: ModelAccessBackend;
  readonly tokenKind: ModelAccessTokenKind;
  readonly warning: string | null;
}

export interface ResolvedModelCatalog {
  readonly selectedModelId: string;
  readonly model: CopilotModelOption | null;
  readonly availableModels: CopilotModelOption[];
  readonly access: ModelAccessStatus;
}

interface CopilotModelApiRecord {
  readonly id?: string;
  readonly vendor?: string;
  readonly name?: string;
  readonly preview?: boolean;
  readonly model_picker_enabled?: boolean;
  readonly is_chat_default?: boolean;
  readonly is_chat_fallback?: boolean;
  readonly supported_endpoints?: string[];
  readonly supportsAdaptiveThinking?: boolean;
  readonly minThinkingBudget?: number;
  readonly maxThinkingBudget?: number;
  readonly supportsReasoningEffort?: string[];
  readonly billing?: {
    readonly is_premium?: boolean;
    readonly multiplier?: number;
  };
  readonly warning_messages?: Array<{ readonly message?: string }>;
  readonly info_messages?: Array<{ readonly message?: string }>;
  readonly capabilities?: {
    readonly type?: string;
    readonly family?: string;
    readonly supports?: {
      readonly tool_calls?: boolean;
      readonly vision?: boolean;
      readonly thinking?: boolean;
      readonly adaptive_thinking?: boolean;
      readonly reasoning_effort?: string[];
    };
    readonly limits?: {
      readonly max_prompt_tokens?: number;
      readonly max_context_window_tokens?: number;
      readonly max_output_tokens?: number;
    };
  };
}

interface CopilotModelsResponse {
  readonly data?: CopilotModelApiRecord[];
}

interface GitHubModelsCatalogRecord {
  readonly id?: string;
  readonly name?: string;
  readonly publisher?: string;
  readonly capabilities?: string[];
  readonly limits?: {
    readonly max_input_tokens?: number;
    readonly max_output_tokens?: number | null;
  };
  readonly supported_input_modalities?: string[];
  readonly rate_limit_tier?: string;
}

function titleCaseToken(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveFamily(record: CopilotModelApiRecord): string {
  const explicitFamily = record.capabilities?.family?.trim();
  if (explicitFamily) {
    return explicitFamily;
  }

  const identifier = record.id?.split(/[/:]/).pop()?.trim();
  if (!identifier) {
    return "general";
  }

  const familyToken = identifier.match(/^[a-z0-9.]+(?:-[a-z0-9.]+)?/i)?.[0] ?? identifier;
  return familyToken.toLowerCase();
}

function deriveReasoningEffort(record: CopilotModelApiRecord, family: string, supportsThinking: boolean): string[] {
  const declared = record.supportsReasoningEffort ?? record.capabilities?.supports?.reasoning_effort;
  if (Array.isArray(declared) && declared.length > 0) {
    return declared.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim());
  }

  if (!supportsThinking) {
    return [];
  }

  if (family.startsWith("claude")) {
    return ["low", "medium", "high"];
  }

  if (family.startsWith("gpt-") || family.startsWith("copilot") || family.startsWith("o")) {
    return ["low", "medium", "high", "xhigh"];
  }

  return [];
}

function classifyToken(token: string | undefined): ModelAccessTokenKind {
  if (!token?.trim()) {
    return "none";
  }

  const normalized = token.trim();
  if (/^(gho_|ghu_|ghr_)/i.test(normalized)) {
    return "oauth_token";
  }

  if (/^(github_pat_|ghp_|ght_)/i.test(normalized)) {
    return "personal_access_token";
  }

  if (normalized.startsWith("v1.")) {
    return "copilot";
  }

  return "unknown";
}

function isPersonalAccessTokenUnsupported(message: string): boolean {
  return /personal access tokens are not supported/i.test(message);
}

function resolveEndpointKind(model: CopilotModelOption): CopilotEndpointKind {
  if (model.supportedEndpoints.includes("/v1/messages") || model.family.startsWith("claude")) {
    return "messages";
  }

  if (model.supportedEndpoints.includes("/responses") || model.family.startsWith("gpt-5")) {
    return "responses";
  }

  return "chat/completions";
}

function sortModels(models: CopilotModelOption[]): CopilotModelOption[] {
  const vendorPriority = ["Anthropic", "OpenAI", "Google", "xAI", "Meta", "Mistral", "DeepSeek", "Cohere"];

  return [...models].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    if (left.vendor !== right.vendor) {
      const leftVendorIndex = vendorPriority.indexOf(left.vendor);
      const rightVendorIndex = vendorPriority.indexOf(right.vendor);
      if (leftVendorIndex !== rightVendorIndex) {
        if (leftVendorIndex === -1) {
          return 1;
        }
        if (rightVendorIndex === -1) {
          return -1;
        }
        return leftVendorIndex - rightVendorIndex;
      }
    }

    if (left.isPremium !== right.isPremium) {
      return left.isPremium ? -1 : 1;
    }

    const leftMultiplier = left.multiplier ?? 0;
    const rightMultiplier = right.multiplier ?? 0;
    if (leftMultiplier !== rightMultiplier) {
      return rightMultiplier - leftMultiplier;
    }

    const vendorComparison = left.vendor.localeCompare(right.vendor);
    if (vendorComparison !== 0) {
      return vendorComparison;
    }

    return left.name.localeCompare(right.name);
  });
}

function describeGitHubModelsFallback(access: CopilotAccessTokenResolution): string {
  if (access.status === "available") {
    return "This token unlocked Copilot access, but the Copilot model list could not be loaded right now. GitHub Models are active instead.";
  }

  if (access.reason === "not_authorized") {
    return "This saved token worked as a GitHub token, but GitHub did not unlock Copilot's separate model catalog for it. GitHub Models are active instead.";
  }

  if (access.reason === "invalid_response") {
    return "GitHub returned an unreadable Copilot access response for this token. GitHub Models are active instead.";
  }

  return "The app could not refresh Copilot access for this token right now. GitHub Models are active instead.";
}

function looksLikeLimitedOAuthCatalog(records: CopilotModelApiRecord[], mapped: CopilotModelOption[], tokenKind: ModelAccessTokenKind): boolean {
  if (tokenKind !== "oauth_token") {
    return false;
  }

  if (records.length < 2 || mapped.length > 1) {
    return false;
  }

  const pickerEnabledCount = records.filter((record) => (record.model_picker_enabled ?? true) !== false).length;
  if (pickerEnabledCount > 1) {
    return false;
  }

  const hasRichEndpointMetadata = records.some((record) => Array.isArray(record.supported_endpoints) && record.supported_endpoints.length > 0);
  const hasThinkingMetadata = records.some((record) => Boolean(record.capabilities?.supports?.thinking));
  const hasModernFamilies = records.some((record) => {
    const family = deriveFamily(record);
    return family.startsWith("claude") || family.startsWith("gpt-5") || family.startsWith("o1") || family.startsWith("o3") || family.startsWith("o4");
  });
  const hasUnexpectedVendor = records.some((record) => {
    const vendor = record.vendor?.trim();
    return Boolean(vendor) && vendor !== "Azure OpenAI" && vendor !== "OpenAI";
  });

  return !hasRichEndpointMetadata && !hasThinkingMetadata && !hasModernFamilies && !hasUnexpectedVendor;
}

function mapGitHubCatalogRecord(record: GitHubModelsCatalogRecord): CopilotModelOption | null {
  if (typeof record.id !== "string" || !record.id.trim()) {
    return null;
  }

  const capabilities = Array.isArray(record.capabilities) ? record.capabilities : [];
  const modalities = Array.isArray(record.supported_input_modalities) ? record.supported_input_modalities : [];
  const family = record.id.split("/").pop()?.trim().toLowerCase() || "general";
  const name = record.name?.trim() || record.id.trim();

  return {
    id: record.id.trim(),
    name,
    vendor: record.publisher?.trim() || titleCaseToken(record.id.split("/")[0] ?? "github"),
    family,
    preview: /preview/i.test(name),
    isDefault: record.id.trim() === "openai/gpt-4.1",
    isFallback: false,
    isPremium: record.rate_limit_tier === "custom",
    multiplier: null,
    degradationReason: null,
    supportsVision: modalities.includes("image"),
    supportsToolCalls: capabilities.includes("tool-calling"),
    supportsThinking: false,
    supportsAdaptiveThinking: false,
    supportsReasoningEffort: [],
    minThinkingBudget: null,
    maxThinkingBudget: null,
    maxInputTokens: typeof record.limits?.max_input_tokens === "number" ? record.limits.max_input_tokens : null,
    maxOutputTokens: typeof record.limits?.max_output_tokens === "number" ? record.limits.max_output_tokens : null,
    supportedEndpoints: ["/chat/completions"]
  } satisfies CopilotModelOption;
}

export class CopilotModelCatalog {
  private cachedAt = 0;
  private cachedModels: CopilotModelOption[] = [];
  private cachedAccess: ModelAccessStatus = { backend: "none", tokenKind: "none", warning: null };
  private cachedTokenKey = "";

  public constructor(
    private readonly tokenStore: GitHubModelsTokenStore,
    private readonly accessTokenBroker: CopilotAccessTokenBroker,
    private readonly logger: Logger
  ) {}

  public resolveEndpointKind(model: CopilotModelOption): CopilotEndpointKind {
    return resolveEndpointKind(model);
  }

  public async listAvailableModels(forceRefresh = false): Promise<CopilotModelOption[]> {
    const catalog = await this.getCatalog(forceRefresh);
    return catalog.availableModels;
  }

  public resolveSelectedModelId(selectedModel: string, availableModels: CopilotModelOption[]): string {
    const normalized = selectedModel.trim();
    if (!normalized) {
      return availableModels.find((model) => model.isDefault)?.id ?? availableModels[0]?.id ?? normalized;
    }

    const exactMatch = availableModels.find((model) => model.id === normalized);
    if (exactMatch) {
      return exactMatch.id;
    }

    const normalizedSuffix = normalized.includes("/") ? normalized.split("/").pop() ?? normalized : normalized;
    const suffixMatch = availableModels.find((model) => model.id === normalizedSuffix || model.id.endsWith(`/${normalizedSuffix}`));
    if (suffixMatch) {
      return suffixMatch.id;
    }

    return availableModels.find((model) => model.isDefault)?.id ?? availableModels[0]?.id ?? normalized;
  }

  public async getSelectedModel(selectedModel: string, forceRefresh = false): Promise<ResolvedModelCatalog> {
    const catalog = await this.getCatalog(forceRefresh);
    const selectedModelId = this.resolveSelectedModelId(selectedModel, catalog.availableModels);

    return {
      selectedModelId,
      model: catalog.availableModels.find((item) => item.id === selectedModelId) ?? null,
      availableModels: catalog.availableModels,
      access: catalog.access
    };
  }

  private async getCatalog(forceRefresh = false): Promise<{ availableModels: CopilotModelOption[]; access: ModelAccessStatus }> {
    const tokenStatus = this.tokenStore.getStatus();
    if (!tokenStatus.configured) {
      this.cachedModels = [];
      this.cachedAccess = { backend: "none", tokenKind: "none", warning: null };
      this.cachedAt = Date.now();
      this.cachedTokenKey = "none";
      return { availableModels: [], access: this.cachedAccess };
    }

    const token = await this.tokenStore.getToken();
    const tokenKind = classifyToken(token);
    const tokenKey = `${tokenStatus.source}:${tokenStatus.updatedAt ?? "none"}:${tokenKind}`;
    if (!forceRefresh && this.cachedModels.length > 0 && this.cachedTokenKey === tokenKey && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return { availableModels: this.cachedModels, access: this.cachedAccess };
    }

    if (!token) {
      const access: ModelAccessStatus = {
        backend: "none",
        tokenKind,
        warning: "The saved token could not be read for this Windows user profile. Re-save it in Settings to restore model access."
      };
      this.cachedModels = [];
      this.cachedAccess = access;
      this.cachedAt = Date.now();
      this.cachedTokenKey = tokenKey;
      return { availableModels: [], access };
    }

    try {
      const result = await this.fetchCatalogForToken(token, tokenKind);
      this.cachedModels = result.availableModels;
      this.cachedAccess = result.access;
      this.cachedAt = Date.now();
      this.cachedTokenKey = tokenKey;
      return result;
    } catch (error) {
      this.logger.warn("Model list could not be loaded.", {
        error: error instanceof Error ? error.message : String(error)
      });

      if (this.cachedModels.length > 0) {
        return {
          availableModels: this.cachedModels,
          access: {
            ...this.cachedAccess,
            warning: error instanceof Error ? error.message : String(error)
          }
        };
      }

      const access: ModelAccessStatus = {
        backend: "none",
        tokenKind,
        warning: error instanceof Error ? error.message : String(error)
      };
      this.cachedModels = [];
      this.cachedAccess = access;
      this.cachedAt = Date.now();
      this.cachedTokenKey = tokenKey;
      return { availableModels: [], access };
    }
  }

  private async fetchCatalogForToken(token: string, tokenKind: ModelAccessTokenKind): Promise<{ availableModels: CopilotModelOption[]; access: ModelAccessStatus }> {
    if (tokenKind === "copilot") {
      return await this.fetchCopilotModels(token, tokenKind);
    }

    if (tokenKind === "personal_access_token" || tokenKind === "oauth_token") {
      const exchanged = await this.accessTokenBroker.resolve(token, { preferExchange: true });
      const fallbackWarning = describeGitHubModelsFallback(exchanged);
      if (exchanged.status === "available") {
        try {
          return await this.fetchCopilotModels(exchanged.token.token, tokenKind);
        } catch (error) {
          this.logger.warn("Falling back to GitHub Models after Copilot catalog fetch failed.", {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      try {
        return await this.fetchCopilotModels(token, tokenKind, fallbackWarning, token);
      } catch (error) {
        this.logger.warn("Direct Copilot catalog lookup failed for the saved token.", {
          error: error instanceof Error ? error.message : String(error)
        });
      }

      return await this.fetchGitHubModelsCatalog(token, tokenKind, fallbackWarning);
    }

    return await this.fetchCopilotModels(token, tokenKind);
  }

  private async fetchCopilotModels(
    token: string,
    tokenKind: ModelAccessTokenKind,
    fallbackWarning: string | null = null,
    fallbackGitHubModelsToken: string | null = null
  ): Promise<{ availableModels: CopilotModelOption[]; access: ModelAccessStatus }> {
    const response = await fetch(COPILOT_MODELS_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      const responseText = await response.text();
      if (isPersonalAccessTokenUnsupported(responseText)) {
        if (fallbackGitHubModelsToken) {
          return await this.fetchGitHubModelsCatalog(fallbackGitHubModelsToken, tokenKind, fallbackWarning);
        }
        throw new Error(`Copilot model list request failed with ${response.status}: ${responseText || "Unknown error"}`);
      }
      throw new Error(`Copilot model list request failed with ${response.status}: ${responseText || "Unknown error"}`);
    }

    const payload = (await response.json()) as CopilotModelsResponse | CopilotModelApiRecord[];
    const records = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];

    const mapped = sortModels(
      records
        .filter((record): record is CopilotModelApiRecord & { id: string } => typeof record.id === "string" && record.id.trim().length > 0)
        .filter((record) => (record.model_picker_enabled ?? true) !== false)
        .filter((record) => !record.capabilities?.type || record.capabilities.type === "chat")
        .map((record) => {
          const family = deriveFamily(record);
          const supportsThinking = Boolean(record.capabilities?.supports?.thinking);
          const reasoningEffort = deriveReasoningEffort(record, family, supportsThinking);
          const vendor = record.vendor?.trim() || titleCaseToken(record.id.split(/[/:]/, 1)[0] ?? "copilot");
          const maxPromptTokens = record.capabilities?.limits?.max_prompt_tokens ?? record.capabilities?.limits?.max_context_window_tokens ?? null;

          return {
            id: record.id.trim(),
            name: record.name?.trim() || record.id.trim(),
            vendor,
            family,
            preview: Boolean(record.preview),
            isDefault: Boolean(record.is_chat_default),
            isFallback: Boolean(record.is_chat_fallback),
            isPremium: Boolean(record.billing?.is_premium),
            multiplier: typeof record.billing?.multiplier === "number" ? record.billing.multiplier : null,
            degradationReason: record.warning_messages?.[0]?.message?.trim() || record.info_messages?.[0]?.message?.trim() || null,
            supportsVision: Boolean(record.capabilities?.supports?.vision),
            supportsToolCalls: Boolean(record.capabilities?.supports?.tool_calls),
            supportsThinking,
            supportsAdaptiveThinking: Boolean(record.supportsAdaptiveThinking ?? record.capabilities?.supports?.adaptive_thinking ?? (family.startsWith("claude") && supportsThinking)),
            supportsReasoningEffort: reasoningEffort,
            minThinkingBudget: typeof record.minThinkingBudget === "number" ? record.minThinkingBudget : null,
            maxThinkingBudget: typeof record.maxThinkingBudget === "number" ? record.maxThinkingBudget : null,
            maxInputTokens: typeof maxPromptTokens === "number" ? maxPromptTokens : null,
            maxOutputTokens: typeof record.capabilities?.limits?.max_output_tokens === "number" ? record.capabilities.limits.max_output_tokens : null,
            supportedEndpoints: Array.isArray(record.supported_endpoints) ? record.supported_endpoints.filter((value): value is string => typeof value === "string") : []
          } satisfies CopilotModelOption;
        })
    );

    if (fallbackGitHubModelsToken && looksLikeLimitedOAuthCatalog(records, mapped, tokenKind)) {
      return await this.fetchGitHubModelsCatalog(fallbackGitHubModelsToken, tokenKind, fallbackWarning);
    }

    return {
      availableModels: mapped,
      access: {
        backend: "copilot",
        tokenKind,
        warning: mapped.length === 0 ? "This Copilot token did not return any selectable chat models for the current account." : null
      }
    };
  }

  private async fetchGitHubModelsCatalog(
    token: string,
    tokenKind: ModelAccessTokenKind,
    warning: string | null = null
  ): Promise<{ availableModels: CopilotModelOption[]; access: ModelAccessStatus }> {
    const response = await fetch(GITHUB_MODELS_CATALOG_ENDPOINT, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": GITHUB_MODELS_API_VERSION
      },
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`GitHub Models catalog request failed with ${response.status}: ${responseText || "Unknown error"}`);
    }

    const payload = (await response.json()) as GitHubModelsCatalogRecord[];
    const availableModels = sortModels(
      payload
        .map((record) => mapGitHubCatalogRecord(record))
        .filter((record): record is CopilotModelOption => record !== null)
    );

    return {
      availableModels,
      access: {
        backend: "github-models",
        tokenKind,
        warning: warning ?? "Using GitHub Models with the saved GitHub token. Copilot-only models are unavailable for this token or account."
      }
    };
  }
}
