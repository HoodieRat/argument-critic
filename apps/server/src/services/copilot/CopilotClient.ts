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
  readonly attachmentContext?: string[];
  readonly imageAttachments?: Array<{
    readonly label: string;
    readonly mimeType: string;
    readonly dataUrl: string;
  }>;
  readonly handoffPrompt?: string;
  readonly criticalityMultiplier?: number;
  readonly structuredOutputEnabled?: boolean;
  readonly fallbackText: string;
}

export type CopilotImageAttachment = NonNullable<CopilotCompletionRequest["imageAttachments"]>[number];

interface DirectVisionPromptRequest {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly imageAttachments: CopilotImageAttachment[];
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

  private collectImageAttachments(model: CopilotModelOption | null, request: CopilotCompletionRequest): CopilotCompletionRequest["imageAttachments"] {
    if (!request.imageAttachments || request.imageAttachments.length === 0) {
      return [];
    }

    if (model === null) {
      return request.imageAttachments;
    }

    if (!model.supportsVision) {
      return [];
    }

    return request.imageAttachments;
  }

  private collectExplicitImageAttachments(model: CopilotModelOption | null, imageAttachments: CopilotImageAttachment[]): CopilotImageAttachment[] {
    if (imageAttachments.length === 0) {
      return [];
    }

    if (model === null) {
      return imageAttachments;
    }

    return model.supportsVision ? imageAttachments : [];
  }

  private extractBase64Data(dataUrl: string): string {
    const separator = dataUrl.indexOf(",");
    return separator >= 0 ? dataUrl.slice(separator + 1) : dataUrl;
  }

  private buildUserPrompt(request: CopilotCompletionRequest, options: { directImageInspection: boolean } = { directImageInspection: false }): string {
    const responseSettings = [
      `Criticality level: ${typeof request.criticalityMultiplier === "number" && Number.isFinite(request.criticalityMultiplier) ? request.criticalityMultiplier.toFixed(2) : "1.00"}x relative to default.`,
      `Highly structured output: ${request.structuredOutputEnabled === true ? "enabled" : "disabled"}.`
    ].join("\n");

    const directImageNote = options.directImageInspection && request.imageAttachments && request.imageAttachments.length > 0
      ? `Attached images available for direct inspection:\n${request.imageAttachments.map((attachment) => `- ${attachment.label} (${attachment.mimeType})`).join("\n")}`
      : "";

    return [
      request.handoffPrompt ? `Lane handoff:\n${request.handoffPrompt}` : "",
      `Response settings:\n${responseSettings}`,
      request.prompt,
      directImageNote,
      request.attachmentContext && request.attachmentContext.length > 0 ? `Attachments:\n${request.attachmentContext.join("\n\n")}` : "",
      request.context.length > 0 ? `Context:\n${request.context.join("\n")}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private buildChatCompletionsUserContent(model: CopilotModelOption | null, request: CopilotCompletionRequest): string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> {
    const images = this.collectImageAttachments(model, request) ?? [];
    const text = this.buildUserPrompt(request, { directImageInspection: images.length > 0 });
    if (images.length === 0) {
      return text;
    }

    return [
      { type: "text", text },
      ...images.map((attachment) => ({
        type: "image_url" as const,
        image_url: { url: attachment.dataUrl }
      }))
    ];
  }

  private buildResponsesUserContent(model: CopilotModelOption | null, request: CopilotCompletionRequest): Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> {
    const images = this.collectImageAttachments(model, request) ?? [];
    const text = this.buildUserPrompt(request, { directImageInspection: images.length > 0 });

    return [
      { type: "input_text", text },
      ...images.map((attachment) => ({
        type: "input_image" as const,
        image_url: attachment.dataUrl
      }))
    ];
  }

  private buildMessagesUserContent(model: CopilotModelOption | null, request: CopilotCompletionRequest): Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }> {
    const images = this.collectImageAttachments(model, request) ?? [];
    const text = this.buildUserPrompt(request, { directImageInspection: images.length > 0 });

    return [
      { type: "text", text },
      ...images.map((attachment) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: attachment.mimeType,
          data: this.extractBase64Data(attachment.dataUrl)
        }
      }))
    ];
  }

  private buildDirectChatCompletionsUserContent(model: CopilotModelOption | null, request: DirectVisionPromptRequest): string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> {
    const images = this.collectExplicitImageAttachments(model, request.imageAttachments);
    if (images.length === 0) {
      return request.userPrompt;
    }

    return [
      { type: "text", text: request.userPrompt },
      ...images.map((attachment) => ({
        type: "image_url" as const,
        image_url: { url: attachment.dataUrl }
      }))
    ];
  }

  private buildDirectResponsesUserContent(model: CopilotModelOption | null, request: DirectVisionPromptRequest): Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> {
    const images = this.collectExplicitImageAttachments(model, request.imageAttachments);

    return [
      { type: "input_text", text: request.userPrompt },
      ...images.map((attachment) => ({
        type: "input_image" as const,
        image_url: attachment.dataUrl
      }))
    ];
  }

  private buildDirectMessagesUserContent(model: CopilotModelOption | null, request: DirectVisionPromptRequest): Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }> {
    const images = this.collectExplicitImageAttachments(model, request.imageAttachments);

    return [
      { type: "text", text: request.userPrompt },
      ...images.map((attachment) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: attachment.mimeType,
          data: this.extractBase64Data(attachment.dataUrl)
        }
      }))
    ];
  }

  private buildSystemPrompt(request: CopilotCompletionRequest): string {
    const criticalityMultiplier = typeof request.criticalityMultiplier === "number" && Number.isFinite(request.criticalityMultiplier)
      ? Math.min(10, Math.max(0.1, request.criticalityMultiplier))
      : 1;
    const structuredOutputEnabled = request.structuredOutputEnabled === true;

    const basePrompt = (() => {
      if (request.mode === "critic") {
        return "You are a rigorous argument critic. Pressure-test assumptions, expose contradictions, ask precise follow-up questions, and avoid filler.";
      }

      if (request.mode === "research_import") {
        return "You are a rigorous reviewer. Assess imported evidence, state what it supports, state what it does not prove, identify what remains uncertain, and say what should be verified next.";
      }

      return "You are a practical reasoning assistant. Be direct, useful, and concrete. Surface tradeoffs and unresolved assumptions without filler.";
    })();

    const criticalityInstruction = (() => {
      if (criticalityMultiplier <= 0.35) {
        return "Be much less aggressive than the default critic setting. Focus only on the single most material weakness and keep the tone collaborative.";
      }

      if (criticalityMultiplier < 1) {
        return "Be somewhat gentler than the default critic setting. Focus on the main issue or two without piling on minor objections.";
      }

      if (criticalityMultiplier >= 7) {
        return "Apply extremely high scrutiny. Stress-test every important leap, overclaim, vague standard, and missing mechanism.";
      }

      if (criticalityMultiplier >= 3) {
        return "Apply high scrutiny. Hunt for weak assumptions, vague standards, overclaiming, and unsupported causal jumps.";
      }

      if (criticalityMultiplier >= 1.5) {
        return "Increase scrutiny above the default. Probe for weaker assumptions and hidden leaps rather than staying charitable.";
      }

      return "Use the default critique intensity.";
    })();

    const structureInstruction = structuredOutputEnabled
      ? "Respond with highly structured, succinct output. Use short headings and concise bullet points or very short sections. Stay direct and to the point."
      : "Use compact natural prose when that is clearer than headings or bullets.";

    return [basePrompt, criticalityInstruction, structureInstruction].join(" ");
  }

  private async resolveCopilotRequestTokens(token: string, selected: { access: { backend: string; tokenKind: string } }): Promise<string[]> {
    if (selected.access.backend !== "copilot") {
      return [];
    }

    if (selected.access.tokenKind !== "personal_access_token" && selected.access.tokenKind !== "oauth_token") {
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
            content: this.buildSystemPrompt(request)
          },
          {
            role: "user",
            content: this.buildChatCompletionsUserContent(model, request)
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

  private async completeViaGitHubModelsInference(model: CopilotModelOption | null, modelId: string, token: string, request: CopilotCompletionRequest, signal?: AbortSignal): Promise<string> {
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
            content: this.buildSystemPrompt(request)
          },
          {
            role: "user",
            content: this.buildChatCompletionsUserContent(model, request)
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

  private async promptViaChatCompletions(model: CopilotModelOption, token: string, request: DirectVisionPromptRequest, signal?: AbortSignal): Promise<string> {
    const response = await fetch("https://api.githubcopilot.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        model: model.id,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: request.systemPrompt
          },
          {
            role: "user",
            content: this.buildDirectChatCompletionsUserContent(model, request)
          }
        ]
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Copilot OCR chat completions request failed with ${response.status}.`);
    }

    const payload = await response.json();
    const content = this.parseChatCompletionsText(payload);
    if (!content) {
      throw new Error("Copilot OCR chat completions returned an empty response.");
    }

    return content;
  }

  private async promptViaGitHubModelsInference(model: CopilotModelOption, token: string, request: DirectVisionPromptRequest, signal?: AbortSignal): Promise<string> {
    const response = await fetch(GITHUB_MODELS_INFERENCE_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": GITHUB_MODELS_API_VERSION
      },
      body: JSON.stringify({
        model: model.id,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: request.systemPrompt
          },
          {
            role: "user",
            content: this.buildDirectChatCompletionsUserContent(model, request)
          }
        ]
      }),
      signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub Models OCR inference request failed with ${response.status}: ${text || "Unknown error"}`);
    }

    const payload = await response.json();
    const content = this.parseChatCompletionsText(payload);
    if (!content) {
      throw new Error("GitHub Models OCR inference returned an empty response.");
    }

    return content;
  }

  private async promptViaResponses(model: CopilotModelOption, token: string, request: DirectVisionPromptRequest, signal?: AbortSignal): Promise<string> {
    const response = await fetch("https://api.githubcopilot.com/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        model: model.id,
        stream: false,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: request.systemPrompt }]
          },
          {
            role: "user",
            content: this.buildDirectResponsesUserContent(model, request)
          }
        ]
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Copilot OCR responses request failed with ${response.status}.`);
    }

    const payload = await response.json();
    const content = this.parseResponsesText(payload);
    if (!content) {
      throw new Error("Copilot OCR responses request returned an empty response.");
    }

    return content;
  }

  private async promptViaMessages(model: CopilotModelOption, token: string, request: DirectVisionPromptRequest, signal?: AbortSignal): Promise<string> {
    const response = await fetch("https://api.githubcopilot.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        model: model.id,
        max_tokens: model.maxOutputTokens ?? 4096,
        stream: false,
        system: request.systemPrompt,
        messages: [
          {
            role: "user",
            content: this.buildDirectMessagesUserContent(model, request)
          }
        ]
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Copilot OCR messages request failed with ${response.status}.`);
    }

    const payload = await response.json();
    const content = this.parseMessagesText(payload);
    if (!content) {
      throw new Error("Copilot OCR messages request returned an empty response.");
    }

    return content;
  }

  private async promptVisionModel(
    model: CopilotModelOption,
    access: { backend: string; tokenKind: string },
    token: string,
    request: DirectVisionPromptRequest,
    signal?: AbortSignal
  ): Promise<string> {
    if (access.backend === "github-models") {
      return await this.promptViaGitHubModelsInference(model, token, request, signal);
    }

    const endpointKind = this.modelCatalog.resolveEndpointKind(model);
    const requestTokens = await this.resolveCopilotRequestTokens(token, { access });
    let lastError: Error | null = null;

    for (const requestToken of requestTokens) {
      try {
        if (endpointKind === "messages") {
          return await this.promptViaMessages(model, requestToken, request, signal);
        }
        if (endpointKind === "responses") {
          return await this.promptViaResponses(model, requestToken, request, signal);
        }
        return await this.promptViaChatCompletions(model, requestToken, request, signal);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error("Copilot OCR access token could not be resolved.");
  }

  public async transcribeImageAttachment(imageAttachment: CopilotImageAttachment, signal?: AbortSignal): Promise<{ text: string; modelId: string } | null> {
    const token = await this.tokenStore.getToken();
    if (!token) {
      return null;
    }

    try {
      const selected = await this.modelCatalog.getSelectedModel(this.resolveGithubModel());
      const visionModel = selected.model?.supportsVision
        ? selected.model
        : selected.availableModels.find((candidate) => candidate.supportsVision) ?? null;

      if (!visionModel) {
        return null;
      }

      const text = await this.promptVisionModel(
        visionModel,
        selected.access,
        token,
        {
          systemPrompt: "You are an OCR transcription engine. Extract the visible text exactly as shown. Do not summarize, interpret, normalize, or explain anything. Preserve obvious line breaks. If a span is unreadable, write [unclear]. If the image has no meaningful readable text, return exactly [no readable text].",
          userPrompt: "Transcribe the attached image. Return only the extracted text.",
          imageAttachments: [imageAttachment]
        },
        signal
      );

      const normalized = text.trim();
      if (!normalized) {
        return null;
      }

      return {
        text: normalized,
        modelId: visionModel.id
      };
    } catch (error) {
      this.logger.warn("Image text extraction failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
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
            content: [{ type: "input_text", text: this.buildSystemPrompt(request) }]
          },
          {
            role: "user",
            content: this.buildResponsesUserContent(model, request)
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
        system: this.buildSystemPrompt(request),
        messages: [
          {
            role: "user",
            content: this.buildMessagesUserContent(model, request)
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
        ? await this.completeViaGitHubModelsInference(selected.model, resolvedModelId, token, request, signal)
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