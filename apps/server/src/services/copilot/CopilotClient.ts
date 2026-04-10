import type { Logger } from "../../logger.js";
import { CopilotAccessTokenBroker } from "./CopilotAccessTokenBroker.js";
import type { SessionMode } from "../../types/domain.js";
import { CopilotModelCatalog, type CopilotModelOption } from "./CopilotModelCatalog.js";
import { GitHubModelsTokenStore } from "./GitHubModelsTokenStore.js";
import { SettingsRepository } from "../db/repositories/SettingsRepository.js";

const GITHUB_MODELS_INFERENCE_ENDPOINT = "https://models.github.ai/inference/chat/completions";
const GITHUB_MODELS_API_VERSION = "2026-03-10";

export interface CopilotCompletionRequest {
  readonly mode: SessionMode;
  readonly prompt: string;
  readonly context: string[];
  readonly fallbackText: string;
}

export interface CopilotCompletionResponse {
  readonly text: string;
  readonly provider: "github-models" | "local-deterministic";
}

export class CopilotClient {
  public constructor(
    private readonly modelCatalog: CopilotModelCatalog,
    private readonly accessTokenBroker: CopilotAccessTokenBroker,
    private readonly tokenStore: GitHubModelsTokenStore,
    private readonly settingsRepository: SettingsRepository,
    private readonly defaultGithubModel: string,
    private readonly logger: Logger
  ) {}

  private resolveGithubModel(): string {
    return this.settingsRepository.get("runtime.githubModel", this.defaultGithubModel).trim() || this.defaultGithubModel;
  }

  private resolveThinkingSettings(model: CopilotModelOption | null): {
    enabled: boolean;
    reasoningEffort: string | undefined;
    thinkingBudget: number | undefined;
  } {
    const enabled = this.settingsRepository.get("runtime.githubModelThinkingEnabled", false);
    const reasoningEffortSetting = this.settingsRepository.get<string | null>("runtime.githubModelReasoningEffort", null);
    const thinkingBudgetSetting = this.settingsRepository.get<number | null>("runtime.githubModelThinkingBudget", null);
    const parsedBudget = typeof thinkingBudgetSetting === "number" ? thinkingBudgetSetting : Number.NaN;
    const reasoningEffort = typeof reasoningEffortSetting === "string" && reasoningEffortSetting && model?.supportsReasoningEffort.includes(reasoningEffortSetting)
      ? reasoningEffortSetting
      : undefined;
    const thinkingBudget = model && Number.isFinite(parsedBudget)
      ? Math.max(model.minThinkingBudget ?? 0, Math.min(model.maxThinkingBudget ?? parsedBudget, parsedBudget))
      : undefined;

    return {
      enabled: Boolean(enabled) && Boolean(model?.supportsThinking || reasoningEffort || thinkingBudget),
      reasoningEffort,
      thinkingBudget
    };
  }

  private buildSystemPrompt(mode: SessionMode): string {
    if (mode === "critic") {
      return "You are a rigorous argument critic. Pressure-test assumptions, expose contradictions, ask precise follow-up questions, and avoid filler.";
    }

    if (mode === "research_import") {
      return "You are a research review assistant. Focus on what the imported evidence changes, what remains uncertain, and what should be verified next.";
    }

    return "You are a practical reasoning assistant. Be direct, useful, and concrete. Surface tradeoffs and unresolved assumptions without filler.";
  }

  private buildUserPrompt(request: CopilotCompletionRequest): string {
    return [request.prompt, request.context.length > 0 ? `Context:\n${request.context.join("\n")}` : ""]
      .filter(Boolean)
      .join("\n\n");
  }

  private async resolveCopilotRequestTokens(token: string, selected: { access: { backend: string; tokenKind: string } }): Promise<string[]> {
    if (selected.access.backend !== "copilot") {
      return [];
    }

    if (selected.access.tokenKind !== "personal_access_token") {
      return [token];
    }

    const exchange = await this.accessTokenBroker.resolve(token, { preferExchange: true });
    const candidates = new Set<string>();

    if (exchange.status === "available") {
      candidates.add(exchange.token.token);
    }

    candidates.add(token);
    return [...candidates];
  }

  private parseChatCompletionsText(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const content = (payload as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> }).choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return content.trim() || null;
    }

    if (Array.isArray(content)) {
      const text = content
        .map((part) => (part && typeof part === "object" && typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim();
      return text || null;
    }

    return null;
  }

  private parseResponsesText(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const outputText = (payload as { output_text?: string }).output_text;
    if (typeof outputText === "string" && outputText.trim()) {
      return outputText.trim();
    }

    const output = (payload as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output;
    if (!Array.isArray(output)) {
      return null;
    }

    const text = output
      .flatMap((item) => item.content ?? [])
      .map((part) => (part.type === "output_text" || part.type === "text") && typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();

    return text || null;
  }

  private parseMessagesText(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const content = (payload as { content?: Array<{ type?: string; text?: string }> }).content;
    if (!Array.isArray(content)) {
      return null;
    }

    const text = content
      .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    return text || null;
  }

  private async completeViaChatCompletions(model: CopilotModelOption | null, token: string, request: CopilotCompletionRequest, signal?: AbortSignal): Promise<string> {
    const thinking = this.resolveThinkingSettings(model);
    const response = await fetch("https://api.githubcopilot.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        model: model?.id ?? this.resolveGithubModel(),
        temperature: 0.2,
        ...(thinking.reasoningEffort ? { reasoning_effort: thinking.reasoningEffort } : {}),
        messages: [
          {
            role: "system",
            content: this.buildSystemPrompt(request.mode)
          },
          {
            role: "user",
            content: this.buildUserPrompt(request)
          }
        ]
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Copilot chat completions request failed with ${response.status}.`);
    }

    const payload = await response.json();
    const content = this.parseChatCompletionsText(payload);
    if (!content) {
      throw new Error("Copilot chat completions returned an empty response.");
    }

    return content;
  }

  private async completeViaGitHubModelsInference(modelId: string, token: string, request: CopilotCompletionRequest, signal?: AbortSignal): Promise<string> {
    const response = await fetch(GITHUB_MODELS_INFERENCE_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": GITHUB_MODELS_API_VERSION
      },
      body: JSON.stringify({
        model: modelId,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: this.buildSystemPrompt(request.mode)
          },
          {
            role: "user",
            content: this.buildUserPrompt(request)
          }
        ]
      }),
      signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub Models inference request failed with ${response.status}: ${text || "Unknown error"}`);
    }

    const payload = await response.json();
    const content = this.parseChatCompletionsText(payload);
    if (!content) {
      throw new Error("GitHub Models inference returned an empty response.");
    }

    return content;
  }

  private async completeViaResponses(model: CopilotModelOption | null, token: string, request: CopilotCompletionRequest, signal?: AbortSignal): Promise<string> {
    const thinking = this.resolveThinkingSettings(model);
    const response = await fetch("https://api.githubcopilot.com/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        model: model?.id ?? this.resolveGithubModel(),
        stream: false,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: this.buildSystemPrompt(request.mode) }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: this.buildUserPrompt(request) }]
          }
        ],
        ...(thinking.enabled && thinking.reasoningEffort ? { reasoning: { effort: thinking.reasoningEffort } } : {})
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Copilot responses request failed with ${response.status}.`);
    }

    const payload = await response.json();
    const content = this.parseResponsesText(payload);
    if (!content) {
      throw new Error("Copilot responses request returned an empty response.");
    }

    return content;
  }

  private async completeViaMessages(model: CopilotModelOption | null, token: string, request: CopilotCompletionRequest, signal?: AbortSignal): Promise<string> {
    const thinking = this.resolveThinkingSettings(model);
    const response = await fetch("https://api.githubcopilot.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        model: model?.id ?? this.resolveGithubModel(),
        max_tokens: model?.maxOutputTokens ?? 4096,
        stream: false,
        system: this.buildSystemPrompt(request.mode),
        messages: [
          {
            role: "user",
            content: this.buildUserPrompt(request)
          }
        ],
        ...(thinking.enabled && model?.supportsAdaptiveThinking ? { thinking: { type: "adaptive" } } : {}),
        ...(thinking.enabled && !model?.supportsAdaptiveThinking && thinking.thinkingBudget ? { thinking: { type: "enabled", budget_tokens: thinking.thinkingBudget } } : {}),
        ...(thinking.enabled && thinking.reasoningEffort && ["low", "medium", "high"].includes(thinking.reasoningEffort)
          ? { output_config: { effort: thinking.reasoningEffort } }
          : {})
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Copilot messages request failed with ${response.status}.`);
    }

    const payload = await response.json();
    const content = this.parseMessagesText(payload);
    if (!content) {
      throw new Error("Copilot messages request returned an empty response.");
    }

    return content;
  }

  public async complete(request: CopilotCompletionRequest, signal?: AbortSignal): Promise<CopilotCompletionResponse> {
    const token = await this.tokenStore.getToken();
    if (!token) {
      return {
        text: request.fallbackText,
        provider: "local-deterministic"
      };
    }

    try {
      const selected = await this.modelCatalog.getSelectedModel(this.resolveGithubModel());
      const resolvedModelId = selected.model?.id ?? selected.selectedModelId ?? this.resolveGithubModel();
      const content = selected.access.backend === "github-models"
        ? await this.completeViaGitHubModelsInference(resolvedModelId, token, request, signal)
        : await (async () => {
            const endpointKind = selected.model ? this.modelCatalog.resolveEndpointKind(selected.model) : "chat/completions";
            const requestTokens = await this.resolveCopilotRequestTokens(token, selected);
            let lastError: Error | null = null;

            for (const requestToken of requestTokens) {
              try {
                if (endpointKind === "messages") {
                  return await this.completeViaMessages(selected.model, requestToken, request, signal);
                }
                if (endpointKind === "responses") {
                  return await this.completeViaResponses(selected.model, requestToken, request, signal);
                }
                return await this.completeViaChatCompletions(selected.model, requestToken, request, signal);
              } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
              }
            }

            throw lastError ?? new Error("Copilot access token could not be resolved.");
          })();

      return {
        text: await content,
        provider: "github-models"
      };
    } catch (error) {
      this.logger.warn("Falling back to deterministic Copilot response", {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        text: request.fallbackText,
        provider: "local-deterministic"
      };
    }
  }
}