import type { FastifyInstance } from "fastify";

import type { AppServices } from "../app.js";
import type {
  GitHubLoginFlowResponse,
  GitHubModelOptionResponse,
  GitHubModelsTokenStatusResponse,
  RuntimeSettingsResponse,
  RuntimeSettingsUpdateRequest,
  RuntimeStatusResponse,
  RuntimeTokenUpdateRequest
} from "../types/api.js";

async function getRuntimeSettings(services: AppServices, options: { forceRefreshModels?: boolean } = {}): Promise<RuntimeSettingsResponse> {
  const selectedModelSetting = services.settingsRepository.get("runtime.githubModel", services.config.githubModel);
  const modelCatalog = await services.copilotModelCatalog.getSelectedModel(selectedModelSetting, options.forceRefreshModels);
  const selectedModel = modelCatalog.model;
  const storedReasoningEffort = services.settingsRepository.get<string | null>("runtime.githubModelReasoningEffort", null);
  const storedThinkingBudget = services.settingsRepository.get<number | null>("runtime.githubModelThinkingBudget", null);
  const storedThinkingEnabled = services.settingsRepository.get("runtime.githubModelThinkingEnabled", false);
  const normalizedReasoningEffort = typeof storedReasoningEffort === "string" && storedReasoningEffort && selectedModel?.supportsReasoningEffort.includes(storedReasoningEffort)
    ? storedReasoningEffort
    : null;
  const parsedThinkingBudget = typeof storedThinkingBudget === "number" ? storedThinkingBudget : Number.NaN;
  const normalizedThinkingBudget = selectedModel && Number.isFinite(parsedThinkingBudget)
    ? Math.max(selectedModel.minThinkingBudget ?? 0, Math.min(selectedModel.maxThinkingBudget ?? parsedThinkingBudget, parsedThinkingBudget))
    : null;

  return {
    researchEnabled: services.settingsRepository.get("research.enabled", services.config.researchEnabled),
    questionGenerationEnabled: services.settingsRepository.get("questions.generationEnabled", true),
    githubLoginAuthMethod: services.config.githubLoginAuthMethod,
    githubModel: modelCatalog.selectedModelId,
    availableGitHubModels: modelCatalog.availableModels,
    modelAccess: modelCatalog.access,
    githubModelThinkingEnabled: Boolean(storedThinkingEnabled) && Boolean(selectedModel?.supportsThinking || normalizedReasoningEffort || normalizedThinkingBudget),
    githubModelReasoningEffort: normalizedReasoningEffort,
    githubModelThinkingBudget: normalizedThinkingBudget,
    sessionAutoTitleEnabled: services.settingsRepository.get("session.autoTitleEnabled", true),
    githubModelsToken: services.githubModelsTokenStore.getStatus()
  };
}

export async function registerRuntimeRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.get("/runtime/status", async (): Promise<RuntimeStatusResponse> => ({
    ready: true,
    sessionCount: services.sessionsRepository.count(),
    managedProcesses: services.processSupervisor.list().length
  }));

  app.post("/runtime/shutdown", async () => {
    setImmediate(() => {
      void services.shutdownCoordinator.shutdown("ui-request");
    });
    return { accepted: true };
  });

  app.get("/runtime/settings", async (request): Promise<RuntimeSettingsResponse> => {
    const query = (request.query ?? {}) as { refreshModels?: string | boolean | number };
    const refreshModels = query.refreshModels === true || query.refreshModels === 1 || query.refreshModels === "1" || query.refreshModels === "true";
    return await getRuntimeSettings(services, { forceRefreshModels: refreshModels });
  });

  app.put("/runtime/settings", async (request): Promise<RuntimeSettingsResponse> => {
    const body = (request.body ?? {}) as RuntimeSettingsUpdateRequest;
    if (typeof body.researchEnabled === "boolean") {
      services.settingsRepository.set("research.enabled", body.researchEnabled);
    }
    if (typeof body.questionGenerationEnabled === "boolean") {
      services.settingsRepository.set("questions.generationEnabled", body.questionGenerationEnabled);
    }
    if (typeof body.githubModel === "string" && body.githubModel.trim()) {
      services.settingsRepository.set("runtime.githubModel", body.githubModel.trim());
    }
    if (typeof body.githubModelThinkingEnabled === "boolean") {
      services.settingsRepository.set("runtime.githubModelThinkingEnabled", body.githubModelThinkingEnabled);
    }
    if (typeof body.githubModelReasoningEffort === "string") {
      services.settingsRepository.set("runtime.githubModelReasoningEffort", body.githubModelReasoningEffort.trim() || null);
    }
    if (body.githubModelReasoningEffort === null) {
      services.settingsRepository.set("runtime.githubModelReasoningEffort", null);
    }
    if (typeof body.githubModelThinkingBudget === "number" && Number.isFinite(body.githubModelThinkingBudget)) {
      services.settingsRepository.set("runtime.githubModelThinkingBudget", body.githubModelThinkingBudget);
    }
    if (body.githubModelThinkingBudget === null) {
      services.settingsRepository.set("runtime.githubModelThinkingBudget", null);
    }
    if (typeof body.sessionAutoTitleEnabled === "boolean") {
      services.settingsRepository.set("session.autoTitleEnabled", body.sessionAutoTitleEnabled);
    }
    return await getRuntimeSettings(services);
  });

  app.put("/runtime/github-models-token", async (request, reply): Promise<GitHubModelsTokenStatusResponse | string> => {
    const body = (request.body ?? {}) as RuntimeTokenUpdateRequest;
    if (typeof body.token !== "string" || !body.token.trim()) {
      reply.code(400);
      return "A GitHub Models token is required.";
    }

    return await services.githubModelsTokenStore.storeToken(body.token);
  });

  app.delete("/runtime/github-models-token", async (): Promise<GitHubModelsTokenStatusResponse> => services.githubModelsTokenStore.clearStoredToken());

  app.post("/runtime/github-login/start", async (): Promise<GitHubLoginFlowResponse> => await services.githubLoginService.startFlow());

  app.get("/runtime/github-login/:flowId", async (request, reply): Promise<GitHubLoginFlowResponse | string> => {
    const params = request.params as { flowId?: string };
    const flowId = params.flowId?.trim();
    if (!flowId) {
      reply.code(400);
      return "A GitHub login flow id is required.";
    }

    const flow = services.githubLoginService.getFlow(flowId);
    if (!flow) {
      reply.code(404);
      return "GitHub login flow not found.";
    }

    return flow;
  });
}