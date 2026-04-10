import type {
  CaptureSubmitResponse,
  ChatTurnResponse,
  DatabaseQueryResponse,
  GitHubLoginFlow,
  GitHubModelsTokenStatus,
  MessageRecord,
  QuestionRecord,
  ReportRecord,
  ResearchImportResponse,
  RuntimeSettings,
  RuntimeStatus,
  SessionMode,
  SessionRecord
} from "../types";

export class ApiClient {
  private baseUrl = "http://127.0.0.1:4317";

  public setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getRuntimeStatus(): Promise<RuntimeStatus> {
    return this.request("/runtime/status");
  }

  public getRuntimeSettings(): Promise<RuntimeSettings> {
    return this.request("/runtime/settings");
  }

  public updateRuntimeSettings(input: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
    return this.request("/runtime/settings", {
      method: "PUT",
      body: JSON.stringify(input)
    });
  }

  public setGitHubModelsToken(token: string): Promise<GitHubModelsTokenStatus> {
    return this.request("/runtime/github-models-token", {
      method: "PUT",
      body: JSON.stringify({ token })
    });
  }

  public clearGitHubModelsToken(): Promise<GitHubModelsTokenStatus> {
    return this.request("/runtime/github-models-token", {
      method: "DELETE"
    });
  }

  public startGitHubLogin(): Promise<GitHubLoginFlow> {
    return this.request("/runtime/github-login/start", {
      method: "POST"
    });
  }

  public getGitHubLoginFlow(flowId: string): Promise<GitHubLoginFlow> {
    return this.request(`/runtime/github-login/${encodeURIComponent(flowId)}`);
  }

  public shutdownRuntime(): Promise<{ accepted: boolean }> {
    return this.request("/runtime/shutdown", { method: "POST" });
  }

  public listSessions(): Promise<{ sessions: SessionRecord[] }> {
    return this.request("/sessions");
  }

  public createSession(input: { title?: string; topic?: string; mode?: SessionMode }): Promise<{ session: SessionRecord }> {
    return this.request("/sessions", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  public importSession(input: { sourceSessionId: string; mode?: SessionMode; title?: string }): Promise<{ session: SessionRecord }> {
    return this.request("/sessions/import", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  public updateSession(sessionId: string, input: { title?: string }): Promise<{ session: SessionRecord }> {
    return this.request(`/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  public getSession(sessionId: string): Promise<{ session: SessionRecord; messages: MessageRecord[]; activeQuestions: QuestionRecord[] }> {
    return this.request(`/sessions/${sessionId}`);
  }

  public sendTurn(input: { sessionId?: string; mode: SessionMode; message: string; topic?: string; includeResearch?: boolean }): Promise<ChatTurnResponse> {
    return this.request("/chat/turn", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  public cancelTurn(sessionId: string): Promise<{ cancelled: boolean }> {
    return this.request("/chat/cancel", {
      method: "POST",
      body: JSON.stringify({ sessionId })
    });
  }

  public queryDatabase(input: { sessionId: string; query: string; interpret?: boolean }): Promise<DatabaseQueryResponse> {
    return this.request("/database/query", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  public getActiveQuestions(sessionId: string): Promise<{ questions: QuestionRecord[] }> {
    return this.request(`/questions/active?sessionId=${encodeURIComponent(sessionId)}`);
  }

  public getQuestionHistory(sessionId: string, status?: string): Promise<{ questions: QuestionRecord[] }> {
    const suffix = status ? `&status=${encodeURIComponent(status)}` : "";
    return this.request(`/questions/history?sessionId=${encodeURIComponent(sessionId)}${suffix}`);
  }

  public answerQuestion(input: { sessionId: string; questionId: string; answer: string; resolutionNote?: string }): Promise<{ question: QuestionRecord; activeQuestions: QuestionRecord[] }> {
    return this.request(`/questions/${input.questionId}/answer`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  public archiveQuestion(sessionId: string, questionId: string): Promise<{ question: QuestionRecord; activeQuestions: QuestionRecord[] }> {
    return this.request(`/questions/${questionId}/archive`, {
      method: "POST",
      body: JSON.stringify({ sessionId })
    });
  }

  public resolveQuestion(sessionId: string, questionId: string): Promise<{ question: QuestionRecord; activeQuestions: QuestionRecord[] }> {
    return this.request(`/questions/${questionId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ sessionId })
    });
  }

  public reopenQuestion(sessionId: string, questionId: string): Promise<{ question: QuestionRecord; activeQuestions: QuestionRecord[] }> {
    return this.request(`/questions/${questionId}/reopen`, {
      method: "POST",
      body: JSON.stringify({ sessionId })
    });
  }

  public listReports(sessionId: string): Promise<{ reports: ReportRecord[] }> {
    return this.request(`/reports?sessionId=${encodeURIComponent(sessionId)}`);
  }

  public generateReport(sessionId: string, reportType: string): Promise<{ report: ReportRecord }> {
    return this.request("/reports/generate", {
      method: "POST",
      body: JSON.stringify({ sessionId, reportType })
    });
  }

  public submitCapture(input: {
    sessionId: string;
    dataUrl: string;
    mimeType: string;
    analyze: boolean;
    crop?: { x: number; y: number; width: number; height: number };
  }): Promise<CaptureSubmitResponse> {
    return this.request("/capture/submit", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  public importResearch(input: { sessionId: string; payload: string; provider?: string; enabledForContext: boolean }): Promise<ResearchImportResponse> {
    return this.request("/research/import", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  public listResearchRuns(sessionId: string): Promise<{ runs: Array<{ id: string; provider: string; createdAt: string }> }> {
    return this.request(`/research?sessionId=${encodeURIComponent(sessionId)}`);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers ?? undefined);
    if (init?.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed with ${response.status}`);
    }

    return (await response.json()) as T;
  }
}