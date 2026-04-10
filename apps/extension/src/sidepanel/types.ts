export type SessionMode = "normal_chat" | "critic" | "database" | "report" | "research_import" | "attachment_analysis";
export type ResponseProvenance = "database" | "ai" | "hybrid" | "research";
export type QuestionStatus = "unanswered" | "answered" | "resolved" | "archived" | "dismissed" | "superseded";

export interface SessionRecord {
  readonly id: string;
  readonly title: string;
  readonly mode: SessionMode;
  readonly topic: string | null;
  readonly summary: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MessageRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly provenance: ResponseProvenance;
  readonly createdAt: string;
}

export interface QuestionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly topic: string | null;
  readonly questionText: string;
  readonly whyAsked: string;
  readonly whatItTests: string;
  readonly status: QuestionStatus;
  readonly priority: number;
  readonly sourceTurnId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReportRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly reportType: string;
  readonly title: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface AttachmentRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly type: string;
  readonly path: string;
  readonly mimeType: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly contentHash: string;
  readonly createdAt: string;
}

export interface CaptureRecord {
  readonly id: string;
  readonly attachmentId: string;
  readonly cropX: number;
  readonly cropY: number;
  readonly cropWidth: number;
  readonly cropHeight: number;
  readonly analysisStatus: string;
  readonly createdAt: string;
}

export interface RuntimeStatus {
  readonly ready: boolean;
  readonly sessionCount: number;
  readonly managedProcesses: number;
}

export type GitHubModelsTokenSource = "secure_store" | "environment" | "none";
export type ModelAccessBackend = "copilot" | "github-models" | "none";
export type ModelAccessTokenKind = "copilot" | "oauth_token" | "personal_access_token" | "unknown" | "none";
export type GitHubLoginAuthMethod = "oauth-device" | "github-cli";

export type GitHubLoginFlowState = "checking" | "waiting" | "importing" | "succeeded" | "failed";

export interface GitHubLoginFlow {
  readonly id: string;
  readonly state: GitHubLoginFlowState;
  readonly message: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly authMethod: GitHubLoginAuthMethod;
  readonly userCode: string | null;
  readonly verificationUri: string | null;
  readonly expiresAt: string | null;
  readonly reviewUri: string | null;
  readonly accountLogin: string | null;
}

export interface GitHubModelOption {
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

export interface GitHubModelsTokenStatus {
  readonly configured: boolean;
  readonly source: GitHubModelsTokenSource;
  readonly updatedAt: string | null;
}

export interface ModelAccessStatus {
  readonly backend: ModelAccessBackend;
  readonly tokenKind: ModelAccessTokenKind;
  readonly warning: string | null;
}

export interface RuntimeSettings {
  readonly researchEnabled: boolean;
  readonly githubModel: string;
  readonly availableGitHubModels: GitHubModelOption[];
  readonly modelAccess: ModelAccessStatus;
  readonly githubModelThinkingEnabled: boolean;
  readonly githubModelReasoningEffort: string | null;
  readonly githubModelThinkingBudget: number | null;
  readonly sessionAutoTitleEnabled: boolean;
  readonly githubModelsToken: GitHubModelsTokenStatus;
}

export interface ChatTurnResponse {
  readonly session: SessionRecord;
  readonly answer: string;
  readonly provenance: ResponseProvenance;
  readonly messages: MessageRecord[];
  readonly activeQuestions: QuestionRecord[];
  readonly targetedQuestions: QuestionRecord[];
  readonly route: string;
}

export interface DatabaseQueryResponse {
  readonly answer: string;
  readonly provenance: ResponseProvenance;
  readonly blocks: Array<{ readonly title: string; readonly content: string }>;
}

export interface CaptureSubmitResponse {
  readonly attachment: AttachmentRecord;
  readonly capture: CaptureRecord | null;
  readonly analysis: string | null;
}

export interface ResearchImportResponse {
  readonly imported: boolean;
  readonly runId?: string;
  readonly findingsImported: number;
}

export interface BackgroundCaptureResult {
  readonly dataUrl: string;
  readonly crop?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly tabTitle?: string;
  readonly tabUrl?: string;
}