export type SessionMode = "normal_chat" | "critic" | "database" | "report" | "research_import" | "attachment_analysis";
export type MessageRole = "user" | "assistant" | "system";
export type ResponseProvenance = "database" | "ai" | "hybrid" | "research";
export type QuestionStatus = "unanswered" | "answered" | "resolved" | "archived" | "dismissed" | "superseded";
export type ContradictionStatus = "open" | "reviewed" | "resolved" | "downgraded";

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
  readonly role: MessageRole;
  readonly content: string;
  readonly provenance: ResponseProvenance;
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

export interface ClaimRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly text: string;
  readonly claimType: string;
  readonly confidence: number;
  readonly sourceMessageId: string;
  readonly createdAt: string;
}

export interface DefinitionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly term: string;
  readonly definitionText: string;
  readonly sourceMessageId: string;
  readonly createdAt: string;
}

export interface AssumptionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly text: string;
  readonly sourceMessageId: string;
  readonly createdAt: string;
}

export interface ObjectionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly claimId: string;
  readonly text: string;
  readonly severity: string;
  readonly createdAt: string;
}

export interface ContradictionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly claimAId: string;
  readonly claimBId: string;
  readonly status: ContradictionStatus;
  readonly explanation: string;
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

export interface QuestionAnswerRecord {
  readonly id: string;
  readonly questionId: string;
  readonly messageId: string;
  readonly resolutionNote: string | null;
  readonly createdAt: string;
}

export interface ReportRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly reportType: string;
  readonly title: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface ResearchRunRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly provider: string;
  readonly importMode: string;
  readonly enabledForContext: boolean;
  readonly createdAt: string;
}

export interface ResearchSourceRecord {
  readonly id: string;
  readonly researchRunId: string;
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly sourceHash: string;
  readonly createdAt: string;
}

export interface ResearchFindingRecord {
  readonly id: string;
  readonly researchRunId: string;
  readonly findingText: string;
  readonly category: string;
  readonly createdAt: string;
}

export interface AuditLogRecord {
  readonly id: string;
  readonly sessionId: string | null;
  readonly turnId: string | null;
  readonly route: string;
  readonly action: string;
  readonly detailJson: string;
  readonly createdAt: string;
}

export interface QueueCard extends QuestionRecord {
  readonly sessionTitle: string;
}

export interface ParsedArgument {
  readonly claims: Array<Pick<ClaimRecord, "text" | "claimType" | "confidence">>;
  readonly definitions: Array<Pick<DefinitionRecord, "term" | "definitionText">>;
  readonly assumptions: Array<Pick<AssumptionRecord, "text">>;
}

export interface CriticFinding {
  readonly type: "unsupported_premise" | "definition_drift" | "contradiction" | "ambiguity";
  readonly detail: string;
  readonly evidence: string[];
}

export interface GeneratedQuestion {
  readonly questionText: string;
  readonly whyAsked: string;
  readonly whatItTests: string;
  readonly priority: number;
}

export interface DatabaseAnswerBlock {
  readonly title: string;
  readonly content: string;
}