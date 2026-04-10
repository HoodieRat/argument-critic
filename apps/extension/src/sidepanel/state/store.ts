import { create } from "zustand";

import { ApiClient } from "../api/client";
import { captureCrop, captureVisible, isCaptureCancellationError, loadPersistedApiBaseUrl, openExternalUrl, persistApiBaseUrl } from "../platform";
import type {
  BackgroundCaptureResult,
  CaptureSubmitResponse,
  DatabaseQueryResponse,
  GitHubLoginFlow,
  MessageRecord,
  QuestionStatus,
  QuestionRecord,
  ReportRecord,
  RuntimeSettings,
  RuntimeStatus,
  SessionMode,
  SessionRecord
} from "../types";

type AuxiliaryPanel = "history" | "database" | "reports" | "capture" | "settings";

const GITHUB_LOGIN_POLL_INTERVAL_MS = 1_500;
const TERMINAL_GITHUB_LOGIN_STATES = new Set<GitHubLoginFlow["state"]>(["succeeded", "failed"]);

let githubLoginPollTimer: ReturnType<typeof setTimeout> | null = null;

interface AppState {
  readonly apiBaseUrl: string;
  readonly runtimeStatus: RuntimeStatus | null;
  readonly settings: RuntimeSettings | null;
  readonly githubLoginFlow: GitHubLoginFlow | null;
  readonly sessions: SessionRecord[];
  readonly currentSession: SessionRecord | null;
  readonly mode: SessionMode;
  readonly messages: MessageRecord[];
  readonly activeQuestions: QuestionRecord[];
  readonly questionHistory: QuestionRecord[];
  readonly reports: ReportRecord[];
  readonly selectedReport: ReportRecord | null;
  readonly databaseResult: DatabaseQueryResponse | null;
  readonly captureResult: CaptureSubmitResponse | null;
  readonly researchRuns: Array<{ id: string; provider: string; createdAt: string }>;
  readonly activePanel: AuxiliaryPanel;
  readonly isBusy: boolean;
  readonly error: string | null;
  readonly initialize: () => Promise<void>;
  readonly setActivePanel: (panel: AuxiliaryPanel) => void;
  readonly setMode: (mode: SessionMode) => Promise<void>;
  readonly setApiBaseUrl: (url: string) => Promise<void>;
  readonly createSession: (title?: string, mode?: SessionMode) => Promise<void>;
  readonly renameCurrentSession: (title: string) => Promise<void>;
  readonly importCurrentSessionToMode: (mode: SessionMode) => Promise<void>;
  readonly quickCaptureCrop: () => Promise<void>;
  readonly captureVisibleArea: (analyze: boolean) => Promise<void>;
  readonly captureCropArea: (analyze: boolean) => Promise<void>;
  readonly selectSession: (sessionId: string) => Promise<void>;
  readonly sendMessage: (message: string) => Promise<void>;
  readonly cancelTurn: () => Promise<void>;
  readonly refreshQuestions: () => Promise<void>;
  readonly loadQuestionHistory: (status?: QuestionStatus) => Promise<void>;
  readonly answerQuestion: (questionId: string, answer: string, resolutionNote?: string) => Promise<void>;
  readonly archiveQuestion: (questionId: string) => Promise<void>;
  readonly resolveQuestion: (questionId: string) => Promise<void>;
  readonly reopenQuestion: (questionId: string) => Promise<void>;
  readonly runDatabaseQuery: (query: string, interpret?: boolean) => Promise<void>;
  readonly generateReport: (reportType: string) => Promise<void>;
  readonly submitCapture: (capture: BackgroundCaptureResult, analyze: boolean) => Promise<void>;
  readonly updateSettings: (patch: Partial<RuntimeSettings>) => Promise<void>;
  readonly startGitHubLogin: () => Promise<void>;
  readonly saveGitHubModelsToken: (token: string) => Promise<void>;
  readonly clearGitHubModelsToken: () => Promise<void>;
  readonly importResearch: (payload: string, enabledForContext: boolean) => Promise<void>;
  readonly shutdownRuntime: () => Promise<void>;
}

const client = new ApiClient();

function readLaunchApiBaseUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = new URLSearchParams(window.location.search).get("apiBaseUrl");
  return typeof value === "string" && value.trim() ? value.trim().replace(/\/$/, "") : null;
}

async function loadPersistedBaseUrl(): Promise<string> {
  const launchApiBaseUrl = readLaunchApiBaseUrl();
  if (launchApiBaseUrl) {
    return launchApiBaseUrl;
  }

  return await loadPersistedApiBaseUrl(client.getBaseUrl());
}

async function ensureSession(get: () => AppState): Promise<SessionRecord> {
  const state = get();
  if (state.currentSession) {
    return state.currentSession;
  }

  const result = await client.createSession({ title: "Untitled Session", mode: state.mode });
  return result.session;
}

function buildCaptureFailureState(error: unknown): Pick<AppState, "error" | "activePanel" | "isBusy"> | Pick<AppState, "isBusy"> {
  if (isCaptureCancellationError(error)) {
    return { isBusy: false };
  }

  return {
    error: error instanceof Error ? error.message : String(error),
    activePanel: "capture",
    isBusy: false
  };
}

function stopGitHubLoginPolling(): void {
  if (githubLoginPollTimer !== null) {
    clearTimeout(githubLoginPollTimer);
    githubLoginPollTimer = null;
  }
}

function createLocalGitHubLoginFailure(message: string, currentFlow: GitHubLoginFlow | null): GitHubLoginFlow {
  const timestamp = new Date().toISOString();

  return {
    id: currentFlow?.id ?? "local-error",
    state: "failed",
    message,
    startedAt: currentFlow?.startedAt ?? timestamp,
    updatedAt: timestamp,
    authMethod: currentFlow?.authMethod ?? "github-cli",
    userCode: currentFlow?.userCode ?? null,
    verificationUri: currentFlow?.verificationUri ?? null,
    expiresAt: currentFlow?.expiresAt ?? null,
    reviewUri: currentFlow?.reviewUri ?? null,
    accountLogin: currentFlow?.accountLogin ?? null
  };
}

export const useAppStore = create<AppState>((set, get) => {
  async function refreshRuntimeSettingsOnly(): Promise<RuntimeSettings> {
    const settings = await client.getRuntimeSettings();
    set({ settings });
    return settings;
  }

  function scheduleGitHubLoginPoll(flowId: string): void {
    stopGitHubLoginPolling();
    githubLoginPollTimer = setTimeout(() => {
      void pollGitHubLoginFlow(flowId);
    }, GITHUB_LOGIN_POLL_INTERVAL_MS);
  }

  async function pollGitHubLoginFlow(flowId: string): Promise<void> {
    if (get().githubLoginFlow?.id !== flowId) {
      return;
    }

    try {
      const flow = await client.getGitHubLoginFlow(flowId);
      if (get().githubLoginFlow?.id !== flowId) {
        return;
      }

      set({ githubLoginFlow: flow });

      if (TERMINAL_GITHUB_LOGIN_STATES.has(flow.state)) {
        stopGitHubLoginPolling();
        if (flow.state === "succeeded") {
          try {
            await refreshRuntimeSettingsOnly();
          } catch (error) {
            set({
              githubLoginFlow: {
                ...flow,
                message: `${flow.message} The login was stored, but refreshing models failed: ${error instanceof Error ? error.message : String(error)}`,
                updatedAt: new Date().toISOString()
              }
            });
          }
        }
        return;
      }

      scheduleGitHubLoginPoll(flowId);
    } catch (error) {
      stopGitHubLoginPolling();
      if (get().githubLoginFlow?.id !== flowId) {
        return;
      }

      set({
        githubLoginFlow: createLocalGitHubLoginFailure(error instanceof Error ? error.message : String(error), get().githubLoginFlow)
      });
    }
  }

  return {
  apiBaseUrl: client.getBaseUrl(),
  runtimeStatus: null,
  settings: null,
  githubLoginFlow: null,
  sessions: [],
  currentSession: null,
  mode: "normal_chat",
  messages: [],
  activeQuestions: [],
  questionHistory: [],
  reports: [],
  selectedReport: null,
  databaseResult: null,
  captureResult: null,
  researchRuns: [],
  activePanel: "history",
  isBusy: false,
  error: null,
  initialize: async () => {
    stopGitHubLoginPolling();
    set({ isBusy: true, error: null });
    try {
      const apiBaseUrl = await loadPersistedBaseUrl();
      client.setBaseUrl(apiBaseUrl);
      const [runtimeStatus, settings, sessionsResponse] = await Promise.all([
        client.getRuntimeStatus(),
        client.getRuntimeSettings(),
        client.listSessions()
      ]);
      let currentSession = sessionsResponse.sessions[0] ?? null;
      if (!currentSession) {
        currentSession = (await client.createSession({ title: "Untitled Session", mode: get().mode })).session;
      }
      const [sessionDetail, questionHistory, reports, researchRuns] = await Promise.all([
        client.getSession(currentSession.id),
        client.getQuestionHistory(currentSession.id),
        client.listReports(currentSession.id),
        client.listResearchRuns(currentSession.id)
      ]);
      set({
        apiBaseUrl,
        runtimeStatus,
        settings,
        githubLoginFlow: null,
        sessions: currentSession ? [currentSession, ...sessionsResponse.sessions.filter((session) => session.id !== currentSession.id)] : sessionsResponse.sessions,
        currentSession,
        mode: currentSession.mode,
        messages: sessionDetail.messages,
        activeQuestions: sessionDetail.activeQuestions,
        questionHistory: questionHistory.questions,
        reports: reports.reports,
        selectedReport: reports.reports[0] ?? null,
        researchRuns: researchRuns.runs,
        isBusy: false
      });
    } catch (error) {
      set({
        isBusy: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },
  setActivePanel: (panel) => set({ activePanel: panel }),
  setMode: async (mode) => {
    const current = get().currentSession;
    if (current?.mode === mode) {
      set({ mode });
      return;
    }

    const existing = get().sessions.find((session) => session.mode === mode);
    if (existing) {
      await get().selectSession(existing.id);
      return;
    }

    await get().createSession(undefined, mode);
  },
  setApiBaseUrl: async (url) => {
    stopGitHubLoginPolling();
    client.setBaseUrl(url);
    await persistApiBaseUrl(url);
    set({ apiBaseUrl: url, githubLoginFlow: null });
    await get().initialize();
  },
  createSession: async (title, mode = get().mode) => {
    set({ isBusy: true, error: null });
    try {
      const session = (await client.createSession({ title, mode })).session;
      set((state) => ({ sessions: [session, ...state.sessions], currentSession: session, mode: session.mode }));
      await get().selectSession(session.id);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  renameCurrentSession: async (title) => {
    const session = get().currentSession;
    const normalized = title.trim();
    if (!session || !normalized) {
      return;
    }

    set({ isBusy: true, error: null });
    try {
      const updated = (await client.updateSession(session.id, { title: normalized })).session;
      set((state) => ({
        currentSession: updated,
        sessions: [updated, ...state.sessions.filter((item) => item.id !== updated.id)],
        isBusy: false
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  importCurrentSessionToMode: async (mode) => {
    const source = get().currentSession;
    if (!source) {
      return;
    }

    set({ isBusy: true, error: null });
    try {
      const imported = await client.importSession({ sourceSessionId: source.id, mode });
      set((state) => ({
        sessions: [imported.session, ...state.sessions.filter((session) => session.id !== imported.session.id)],
        currentSession: imported.session,
        mode: imported.session.mode
      }));
      await get().selectSession(imported.session.id);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  quickCaptureCrop: async () => {
    await get().captureCropArea(true);
  },
  captureVisibleArea: async (analyze) => {
    try {
      const capture = await captureVisible();
      await get().submitCapture(capture, analyze);
    } catch (error) {
      set(buildCaptureFailureState(error));
    }
  },
  captureCropArea: async (analyze) => {
    try {
      const capture = await captureCrop();
      await get().submitCapture(capture, analyze);
    } catch (error) {
      set(buildCaptureFailureState(error));
    }
  },
  selectSession: async (sessionId) => {
    set({ isBusy: true, error: null });
    try {
      const [sessionDetail, questionHistory, reports, researchRuns] = await Promise.all([
        client.getSession(sessionId),
        client.getQuestionHistory(sessionId),
        client.listReports(sessionId),
        client.listResearchRuns(sessionId)
      ]);
      set({
        currentSession: sessionDetail.session,
        sessions: [sessionDetail.session, ...get().sessions.filter((session) => session.id !== sessionDetail.session.id)],
        mode: sessionDetail.session.mode,
        messages: sessionDetail.messages,
        activeQuestions: sessionDetail.activeQuestions,
        questionHistory: questionHistory.questions,
        reports: reports.reports,
        selectedReport: reports.reports[0] ?? null,
        researchRuns: researchRuns.runs,
        databaseResult: null,
        captureResult: null,
        isBusy: false
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  sendMessage: async (message) => {
    const session = await ensureSession(get);
    set({ isBusy: true, error: null });
    try {
      const response = await client.sendTurn({
        sessionId: session.id,
        mode: get().mode,
        message,
        topic: session.topic ?? undefined,
        includeResearch: get().settings?.researchEnabled ?? false
      });
      const history = await client.getQuestionHistory(response.session.id);
      set((state) => ({
        currentSession: response.session,
        sessions: [response.session, ...state.sessions.filter((item) => item.id !== response.session.id)],
        mode: response.session.mode,
        messages: response.messages,
        activeQuestions: response.activeQuestions,
        questionHistory: history.questions,
        activePanel: response.activeQuestions.length > 0 ? "history" : state.activePanel,
        runtimeStatus: state.runtimeStatus
          ? { ...state.runtimeStatus, sessionCount: Math.max(state.runtimeStatus.sessionCount, state.sessions.length) }
          : state.runtimeStatus,
        isBusy: false
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  cancelTurn: async () => {
    const session = get().currentSession;
    if (!session) {
      return;
    }

    await client.cancelTurn(session.id);
  },
  refreshQuestions: async () => {
    const session = get().currentSession;
    if (!session) {
      return;
    }

    const [active, history] = await Promise.all([client.getActiveQuestions(session.id), client.getQuestionHistory(session.id)]);
    set({ activeQuestions: active.questions, questionHistory: history.questions });
  },
  loadQuestionHistory: async (status) => {
    const session = get().currentSession;
    if (!session) {
      return;
    }

    const history = await client.getQuestionHistory(session.id, status);
    set({ questionHistory: history.questions });
  },
  answerQuestion: async (questionId, answer, resolutionNote) => {
    const session = get().currentSession;
    if (!session) {
      return;
    }

    set({ isBusy: true, error: null });
    try {
      const response = await client.answerQuestion({ sessionId: session.id, questionId, answer, resolutionNote });
      const history = await client.getQuestionHistory(session.id);
      set({ activeQuestions: response.activeQuestions, questionHistory: history.questions, isBusy: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  archiveQuestion: async (questionId) => {
    const session = get().currentSession;
    if (!session) {
      return;
    }
    const response = await client.archiveQuestion(session.id, questionId);
    const history = await client.getQuestionHistory(session.id);
    set({ activeQuestions: response.activeQuestions, questionHistory: history.questions });
  },
  resolveQuestion: async (questionId) => {
    const session = get().currentSession;
    if (!session) {
      return;
    }
    const response = await client.resolveQuestion(session.id, questionId);
    const history = await client.getQuestionHistory(session.id);
    set({ activeQuestions: response.activeQuestions, questionHistory: history.questions });
  },
  reopenQuestion: async (questionId) => {
    const session = get().currentSession;
    if (!session) {
      return;
    }
    const response = await client.reopenQuestion(session.id, questionId);
    const history = await client.getQuestionHistory(session.id);
    set({ activeQuestions: response.activeQuestions, questionHistory: history.questions });
  },
  runDatabaseQuery: async (query, interpret) => {
    const session = await ensureSession(get);
    set({ isBusy: true, error: null });
    try {
      const result = await client.queryDatabase({ sessionId: session.id, query, interpret });
      set({ databaseResult: result, isBusy: false, activePanel: "database" });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  generateReport: async (reportType) => {
    const session = await ensureSession(get);
    set({ isBusy: true, error: null });
    try {
      const { report } = await client.generateReport(session.id, reportType);
      set((state) => ({
        reports: [report, ...state.reports.filter((item) => item.id !== report.id)],
        selectedReport: report,
        activePanel: "reports",
        isBusy: false
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  submitCapture: async (capture, analyze) => {
    const session = await ensureSession(get);
    set({ isBusy: true, error: null, activePanel: "capture" });
    try {
      const result = await client.submitCapture({
        sessionId: session.id,
        dataUrl: capture.dataUrl,
        mimeType: "image/png",
        analyze,
        crop: capture.crop
      });
      set({ captureResult: result, isBusy: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  updateSettings: async (patch) => {
    set({ isBusy: true, error: null });
    try {
      const settings = await client.updateRuntimeSettings(patch);
      set({ settings, isBusy: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  startGitHubLogin: async () => {
    stopGitHubLoginPolling();

    try {
      const flow = await client.startGitHubLogin();
      set({ githubLoginFlow: flow, error: null });

       if (flow.verificationUri && flow.state === "waiting") {
        try {
          await openExternalUrl(flow.verificationUri);
        } catch {
          // Keep the flow active even if opening the external browser fails.
        }
      }

      if (!TERMINAL_GITHUB_LOGIN_STATES.has(flow.state)) {
        scheduleGitHubLoginPoll(flow.id);
      } else if (flow.state === "succeeded") {
        try {
          await refreshRuntimeSettingsOnly();
        } catch (error) {
          set({
            githubLoginFlow: {
              ...flow,
              message: `${flow.message} The login was stored, but refreshing models failed: ${error instanceof Error ? error.message : String(error)}`,
              updatedAt: new Date().toISOString()
            }
          });
        }
      }
    } catch (error) {
      set({
        githubLoginFlow: createLocalGitHubLoginFailure(error instanceof Error ? error.message : String(error), get().githubLoginFlow)
      });
    }
  },
  saveGitHubModelsToken: async (token) => {
    stopGitHubLoginPolling();
    set({ isBusy: true, error: null, githubLoginFlow: null });
    try {
      await client.setGitHubModelsToken(token);
      const settings = await refreshRuntimeSettingsOnly();
      set({ settings, isBusy: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  clearGitHubModelsToken: async () => {
    stopGitHubLoginPolling();
    set({ isBusy: true, error: null, githubLoginFlow: null });
    try {
      await client.clearGitHubModelsToken();
      const settings = await refreshRuntimeSettingsOnly();
      set({ settings, isBusy: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  importResearch: async (payload, enabledForContext) => {
    const session = await ensureSession(get);
    set({ isBusy: true, error: null, activePanel: "settings" });
    try {
      await client.importResearch({ sessionId: session.id, payload, enabledForContext });
      const researchRuns = await client.listResearchRuns(session.id);
      set({ researchRuns: researchRuns.runs, isBusy: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  },
  shutdownRuntime: async () => {
    set({ isBusy: true, error: null });
    try {
      await client.shutdownRuntime();
      set({ isBusy: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isBusy: false });
    }
  }
  };
});