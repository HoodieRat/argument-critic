import { useEffect, useRef, useState } from "react";

import { AttachmentStrip } from "./AttachmentStrip";
import { MODE_METADATA } from "../modeMetadata";
import type { AttachmentRecord, MessageRecord, RuntimeSettings, SessionMode, SessionRecord } from "../types";

interface ChatViewProps {
  readonly messages: MessageRecord[];
  readonly sessions: SessionRecord[];
  readonly currentSession: SessionRecord | null;
  readonly mode: SessionMode;
  readonly apiBaseUrl: string;
  readonly busy: boolean;
  readonly githubModel: string | null;
  readonly availableGitHubModels: RuntimeSettings["availableGitHubModels"];
  readonly modelAccess: RuntimeSettings["modelAccess"];
  readonly githubModelThinkingEnabled: boolean;
  readonly githubModelReasoningEffort: string | null;
  readonly githubModelThinkingBudget: number | null;
  readonly tokenConfigured: boolean;
  readonly pendingAttachments: AttachmentRecord[];
  readonly onSend: (message: string) => Promise<void>;
  readonly onUploadFiles: (files: File[]) => Promise<void>;
  readonly onRemovePendingAttachment: (attachmentId: string) => void;
  readonly onCancel: () => Promise<void>;
  readonly onCreateSession: (mode?: SessionMode) => void;
  readonly onRenameSession: (title: string) => void;
  readonly onUpdateSessionSettings: (patch: { criticalityMultiplier?: number; structuredOutputEnabled?: boolean; imageTextExtractionEnabled?: boolean }) => Promise<void>;
  readonly onSelectSession: (sessionId: string) => void;
  readonly onImportSessionToMode: (mode: SessionMode) => void;
  readonly onOpenSettings: () => void;
  readonly onUpdateSettings: (patch: Partial<RuntimeSettings>) => Promise<void>;
}

const DEFAULT_CRITICALITY_MULTIPLIER = 1;
const MIN_CRITICALITY_MULTIPLIER = 0.1;
const MAX_CRITICALITY_MULTIPLIER = 10;

function clampCriticalityMultiplier(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CRITICALITY_MULTIPLIER;
  }

  return Math.min(MAX_CRITICALITY_MULTIPLIER, Math.max(MIN_CRITICALITY_MULTIPLIER, value));
}

function sliderValueToCriticalityMultiplier(value: number): number {
  return Number(clampCriticalityMultiplier(10 ** value).toFixed(2));
}

function criticalityMultiplierToSliderValue(value: number): number {
  return Number(Math.log10(clampCriticalityMultiplier(value)).toFixed(2));
}

function formatCriticalityMultiplier(value: number): string {
  const normalized = clampCriticalityMultiplier(value);
  const precision = normalized >= 1 ? 1 : 2;
  return `${Number(normalized.toFixed(precision))}x`;
}

function describeCriticalityTone(value: number): string {
  const normalized = clampCriticalityMultiplier(value);
  if (Math.abs(normalized - DEFAULT_CRITICALITY_MULTIPLIER) < 0.05) {
    return "Default";
  }

  if (normalized <= 0.2) {
    return "Very soft";
  }

  if (normalized < 0.65) {
    return "Soft";
  }

  if (normalized < DEFAULT_CRITICALITY_MULTIPLIER) {
    return "Lighter";
  }

  if (normalized >= 5) {
    return "Maximum";
  }

  if (normalized >= 2) {
    return "Harsh";
  }

  return "Sharper";
}

function describeComposerAction(mode: SessionMode): string {
  switch (mode) {
    case "critic":
      return "Challenge it";
    case "research_import":
      return "Interrogate evidence";
    default:
      return "Continue chat";
  }
}

function describeSpeaker(role: MessageRecord["role"]): string {
  if (role === "user") {
    return "You";
  }
  if (role === "assistant") {
    return "Assistant";
  }
  return "System";
}

function describeTransferActions(mode: SessionMode): Array<{ label: string; target: SessionMode; title: string }> {
  if (mode === "critic") {
    return [{
      label: "To Reviewer",
      target: "research_import",
      title: "Send this critic session to Reviewer"
    }];
  }

  if (mode === "research_import") {
    return [{
      label: "To Critic",
      target: "critic",
      title: "Send this reviewer session to Critic"
    }];
  }

  return [
    {
      label: "To Critic",
      target: "critic",
      title: "Send this chat session to Critic"
    },
    {
      label: "To Reviewer",
      target: "research_import",
      title: "Send this chat session to Reviewer"
    }
  ];
}

function formatModelOptionLabel(model: RuntimeSettings["availableGitHubModels"][number]): string {
  const suffixes: string[] = [];
  if (typeof model.multiplier === "number" && model.multiplier > 0 && model.isPremium) {
    suffixes.push(`Usage x${model.multiplier}`);
  }
  if (model.preview) {
    suffixes.push("Preview");
  }

  return suffixes.length > 0 ? `${model.name} · ${suffixes.join(" · ")}` : model.name;
}

export function ChatView(props: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState(props.currentSession?.title ?? "");
  const [isRenamingSession, setIsRenamingSession] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [criticalitySliderValue, setCriticalitySliderValue] = useState(() => criticalityMultiplierToSliderValue(props.currentSession?.criticalityMultiplier ?? DEFAULT_CRITICALITY_MULTIPLIER));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mode = MODE_METADATA[props.mode];
  const laneSessions = props.sessions.filter((session) => session.mode === props.mode);
  const selectedModel = props.availableGitHubModels.find((model) => model.id === props.githubModel) ?? null;
  const effortOptions = selectedModel?.supportsReasoningEffort ?? [];
  const effortValue = props.githubModelReasoningEffort ?? (effortOptions.includes("medium") ? "medium" : effortOptions[0] ?? "");
  const canEditThinkingBudget = Boolean(props.githubModelThinkingEnabled && selectedModel?.maxThinkingBudget && !selectedModel.supportsAdaptiveThinking);
  const modelSelectValue = selectedModel?.id ?? props.githubModel ?? "";
  const sessionSelectValue = props.currentSession?.mode === props.mode ? props.currentSession.id : laneSessions[0]?.id ?? "";
  const canRenameSession = Boolean(props.currentSession && titleDraft.trim() && titleDraft.trim() !== props.currentSession.title);
  const transferActions = describeTransferActions(props.mode);
  const laneSessionCountLabel = `${laneSessions.length} ${laneSessions.length === 1 ? "session" : "sessions"}`;
  const currentCriticalityMultiplier = props.currentSession?.criticalityMultiplier ?? DEFAULT_CRITICALITY_MULTIPLIER;
  const previewCriticalityMultiplier = sliderValueToCriticalityMultiplier(criticalitySliderValue);
  const structuredOutputEnabled = props.currentSession?.structuredOutputEnabled ?? true;
  const imageTextExtractionEnabled = props.currentSession?.imageTextExtractionEnabled ?? true;
  const canResetCriticality = Math.abs(currentCriticalityMultiplier - DEFAULT_CRITICALITY_MULTIPLIER) >= 0.01;

  useEffect(() => {
    setTitleDraft(props.currentSession?.title ?? "");
    setIsRenamingSession(false);
  }, [props.currentSession?.id, props.currentSession?.title]);

  useEffect(() => {
    setCriticalitySliderValue(criticalityMultiplierToSliderValue(props.currentSession?.criticalityMultiplier ?? DEFAULT_CRITICALITY_MULTIPLIER));
  }, [props.currentSession?.id, props.currentSession?.criticalityMultiplier]);

  async function handleFiles(files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    await props.onUploadFiles(files);
  }

  function commitCriticalitySliderValue(nextSliderValue: number): void {
    const nextCriticalityMultiplier = sliderValueToCriticalityMultiplier(nextSliderValue);
    if (!props.currentSession || Math.abs(nextCriticalityMultiplier - currentCriticalityMultiplier) < 0.01) {
      return;
    }

    void props.onUpdateSessionSettings({ criticalityMultiplier: nextCriticalityMultiplier });
  }

  return (
    <section className="chat">
      <div className="chat__header">
        <div className="chat__heading">
          <span className="eyebrow">{mode.label}</span>
          <h2>{mode.channelTitle}</h2>
          <p className="chat__heading-meta">{laneSessionCountLabel}</p>
        </div>

        <div className="chat-session-toolbar">
          <span className="chat-session-toolbar__label">Session</span>

          {isRenamingSession ? (
            <div className="session-menu__rename-row chat-session-toolbar__row chat-session-toolbar__rename">
              <input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (canRenameSession) {
                      props.onRenameSession(titleDraft);
                      setIsRenamingSession(false);
                    }
                  }

                  if (event.key === "Escape") {
                    setTitleDraft(props.currentSession?.title ?? "");
                    setIsRenamingSession(false);
                  }
                }}
                placeholder="Rename this session"
                disabled={!props.currentSession || props.busy}
              />
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  props.onRenameSession(titleDraft);
                  setIsRenamingSession(false);
                }}
                disabled={!canRenameSession || props.busy}
              >
                Save
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setTitleDraft(props.currentSession?.title ?? "");
                  setIsRenamingSession(false);
                }}
                disabled={props.busy}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="chat-session-toolbar__row">
              <select className="chat-session-toolbar__select" value={sessionSelectValue} onChange={(event) => props.onSelectSession(event.target.value)}>
                {laneSessions.length === 0 ? <option value="">No sessions yet</option> : null}
                {laneSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title}
                  </option>
                ))}
              </select>
              <button className="ghost-button chat-session-toolbar__icon-button" type="button" onClick={() => props.onCreateSession(props.mode)} disabled={props.busy} title="New session">
                +
              </button>
              <button className="ghost-button chat-session-toolbar__compact-button" type="button" onClick={() => setIsRenamingSession(true)} disabled={!props.currentSession || props.busy}>
                Rename
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="chat-transcript card compact-card">
        <div className={`message-list message-list--transcript ${props.messages.length === 0 ? "message-list--empty" : ""}`}>
          {props.messages.length === 0 ? (
            <div className="empty-state">{mode.emptyState}</div>
          ) : (
            props.messages.map((message) => (
              <article key={message.id} className={`message-row message-row--${message.role}`}>
                <div className="message-row__meta">
                  <span className="message-row__speaker">{describeSpeaker(message.role)}</span>
                  {message.role !== "user" || message.provenance !== "ai" ? (
                    <span className={`provenance provenance--${message.provenance}`}>{message.provenance}</span>
                  ) : null}
                </div>
                <div className="message-row__body">
                  <p>{message.content}</p>
                  {message.attachments && message.attachments.length > 0 ? <AttachmentStrip attachments={message.attachments} apiBaseUrl={props.apiBaseUrl} /> : null}
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <form
        className={`composer ${dragActive ? "composer--dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          void handleFiles(Array.from(event.dataTransfer.files ?? []));
        }}
        onSubmit={async (event) => {
          event.preventDefault();
          const message = draft.trim();
          if (!message && props.pendingAttachments.length === 0) {
            return;
          }
          setDraft("");
          await props.onSend(message);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="composer__file-input"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            void handleFiles(files);
            event.currentTarget.value = "";
          }}
        />

        {props.pendingAttachments.length > 0 ? (
          <div className="composer__attachments">
            <p className="eyebrow">Ready to send</p>
            <AttachmentStrip
              attachments={props.pendingAttachments}
              apiBaseUrl={props.apiBaseUrl}
              removable
              onRemove={props.onRemovePendingAttachment}
            />
          </div>
        ) : null}

        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={mode.prompt} rows={3} />
        <div className="composer__actions">
          <div className="composer__actions-primary">
            <button className="primary-button" type="submit" disabled={props.busy}>
              {describeComposerAction(props.mode)}
            </button>
            <button className="ghost-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={props.busy}>
              Attach files
            </button>
            <button className="ghost-button" type="button" onClick={() => void props.onCancel()} disabled={!props.busy}>
              Stop
            </button>
            {transferActions.map((action) => (
              <button
                key={action.target}
                className="ghost-button"
                type="button"
                onClick={() => props.onImportSessionToMode(action.target)}
                disabled={!props.currentSession || props.busy}
                title={action.title}
              >
                {action.label}
              </button>
            ))}
          </div>
          <p className="composer__session-note">Drop files here or use Attach files. Cropshots land here automatically.</p>
        </div>
      </form>

      <div className="chat-post-composer">
        <div className={`chat-model-inline ${props.tokenConfigured ? "" : "chat-model-inline--signed-out"}`}>
          <span className="eyebrow">Model</span>
          {props.tokenConfigured ? (
            <select
              value={modelSelectValue}
              onChange={(event) => void props.onUpdateSettings({ githubModel: event.target.value })}
              disabled={props.busy || props.availableGitHubModels.length === 0}
            >
              {props.availableGitHubModels.length === 0 ? <option value="">No models loaded yet</option> : null}
              {Object.entries(
                props.availableGitHubModels.reduce<Record<string, RuntimeSettings["availableGitHubModels"]>>((groups, model) => {
                  groups[model.vendor] ??= [];
                  groups[model.vendor].push(model);
                  return groups;
                }, {})
              ).map(([vendor, models]) => (
                <optgroup key={vendor} label={vendor}>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {formatModelOptionLabel(model)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : (
            <button className="ghost-button chat-model-inline__sign-in-button" type="button" onClick={props.onOpenSettings}>
              Sign in with GitHub
            </button>
          )}
        </div>

        <div className="chat-inline-tools">
        <div className="chat-response-controls">
          <div className="chat-response-controls__header">
            <div className="chat-response-controls__summary">
              <strong>Criticality</strong>
            </div>

            <div className="chat-response-controls__status">
              <span className="chat-response-controls__value">{formatCriticalityMultiplier(previewCriticalityMultiplier)}</span>
              <span className="detail-line">{describeCriticalityTone(previewCriticalityMultiplier)}</span>
            </div>

            <button
              className="ghost-button chat-response-controls__reset"
              type="button"
              onClick={() => {
                const defaultSliderValue = criticalityMultiplierToSliderValue(DEFAULT_CRITICALITY_MULTIPLIER);
                setCriticalitySliderValue(defaultSliderValue);
                void props.onUpdateSessionSettings({ criticalityMultiplier: DEFAULT_CRITICALITY_MULTIPLIER });
              }}
              disabled={!props.currentSession || props.busy || !canResetCriticality}
            >
              Reset
            </button>

            <label className="chat-compact-toggle" title="Keep answers short, organized, and direct in this chat.">
              <input
                type="checkbox"
                checked={structuredOutputEnabled}
                onChange={(event) => void props.onUpdateSessionSettings({ structuredOutputEnabled: event.target.checked })}
                disabled={!props.currentSession || props.busy}
              />
              <span>Structured</span>
            </label>

            <label className="chat-compact-toggle" title="Extract visible text from screenshots and image attachments before the reply. Turn this off for full visual inspection instead.">
              <input
                type="checkbox"
                checked={imageTextExtractionEnabled}
                onChange={(event) => void props.onUpdateSessionSettings({ imageTextExtractionEnabled: event.target.checked })}
                disabled={!props.currentSession || props.busy}
              />
              <span>Images as text</span>
            </label>
          </div>

          <div className="chat-response-controls__meter">
            <span className="chat-response-controls__edge-label">0.1x</span>

            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={criticalitySliderValue}
              onChange={(event) => setCriticalitySliderValue(Number(event.target.value))}
              onMouseUp={(event) => commitCriticalitySliderValue(Number(event.currentTarget.value))}
              onTouchEnd={(event) => commitCriticalitySliderValue(Number(event.currentTarget.value))}
              onKeyUp={(event) => commitCriticalitySliderValue(Number(event.currentTarget.value))}
              onBlur={(event) => commitCriticalitySliderValue(Number(event.currentTarget.value))}
              disabled={!props.currentSession || props.busy}
            />
            <span className="chat-response-controls__edge-label">10x</span>
          </div>

          <div className="chat-response-controls__labels">
            <span>gentle</span>
            <span>1x default</span>
            <span>harsh</span>
          </div>
        </div>

        {selectedModel?.supportsThinking && props.modelAccess.backend === "copilot" ? (
          <details className="chat-inline-tools__advanced">
            <summary>Thinking</summary>
            <div className="chat-inline-tools__advanced-body">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={props.githubModelThinkingEnabled}
                  onChange={(event) => void props.onUpdateSettings({ githubModelThinkingEnabled: event.target.checked })}
                />
                <span>
                  <strong>Extra reasoning</strong>
                </span>
              </label>

              {props.githubModelThinkingEnabled && effortOptions.length > 0 ? (
                <label className="field">
                  <span>Effort</span>
                  <select value={effortValue} onChange={(event) => void props.onUpdateSettings({ githubModelReasoningEffort: event.target.value || null })}>
                    {effortOptions.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {canEditThinkingBudget ? (
                <label className="field">
                  <span>Budget</span>
                  <input
                    type="number"
                    min={selectedModel?.minThinkingBudget ?? 0}
                    max={selectedModel?.maxThinkingBudget ?? 0}
                    step={256}
                    value={props.githubModelThinkingBudget ?? selectedModel?.minThinkingBudget ?? ""}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      void props.onUpdateSettings({ githubModelThinkingBudget: Number.isFinite(nextValue) ? nextValue : null });
                    }}
                  />
                </label>
              ) : null}
            </div>
          </details>
        ) : null}
        </div>
      </div>
    </section>
  );
}