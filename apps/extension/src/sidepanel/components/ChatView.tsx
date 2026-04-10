import { useEffect, useRef, useState } from "react";

import { MODE_METADATA } from "../modeMetadata";
import type { MessageRecord, RuntimeSettings, SessionMode, SessionRecord } from "../types";

interface ChatViewProps {
  readonly messages: MessageRecord[];
  readonly sessions: SessionRecord[];
  readonly currentSession: SessionRecord | null;
  readonly mode: SessionMode;
  readonly busy: boolean;
  readonly githubModel: string | null;
  readonly availableGitHubModels: RuntimeSettings["availableGitHubModels"];
  readonly modelAccess: RuntimeSettings["modelAccess"];
  readonly githubModelThinkingEnabled: boolean;
  readonly githubModelReasoningEffort: string | null;
  readonly githubModelThinkingBudget: number | null;
  readonly tokenConfigured: boolean;
  readonly onSend: (message: string) => Promise<void>;
  readonly onCancel: () => Promise<void>;
  readonly onCreateSession: (mode?: SessionMode) => void;
  readonly onRenameSession: (title: string) => void;
  readonly onSelectSession: (sessionId: string) => void;
  readonly onImportSessionToMode: (mode: SessionMode) => void;
  readonly onUpdateSettings: (patch: Partial<RuntimeSettings>) => Promise<void>;
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

function describeModelStatus(modelAccess: RuntimeSettings["modelAccess"], tokenConfigured: boolean): string {
  if (!tokenConfigured) {
    return "No token loaded.";
  }

  switch (modelAccess.backend) {
    case "copilot":
      return "Copilot models active.";
    case "github-models":
      return "GitHub Models active.";
    default:
      return "Checking model access.";
  }
}

function describeTransferAction(mode: SessionMode): { label: string; target: SessionMode; title: string } {
  if (mode === "critic") {
    return {
      label: "To Research",
      target: "research_import",
      title: "Send this critic session to the Research lane"
    };
  }

  return {
    label: "To Critic",
    target: "critic",
    title: mode === "research_import" ? "Send this research session to Critic" : "Send this chat session to Critic"
  };
}

export function ChatView(props: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState(props.currentSession?.title ?? "");
  const [isRenamingSession, setIsRenamingSession] = useState(false);
  const sessionMenuRef = useRef<HTMLDetailsElement | null>(null);
  const mode = MODE_METADATA[props.mode];
  const laneSessions = props.sessions.filter((session) => session.mode === props.mode);
  const selectedModel = props.availableGitHubModels.find((model) => model.id === props.githubModel) ?? null;
  const effortOptions = selectedModel?.supportsReasoningEffort ?? [];
  const effortValue = props.githubModelReasoningEffort ?? (effortOptions.includes("medium") ? "medium" : effortOptions[0] ?? "");
  const canEditThinkingBudget = Boolean(props.githubModelThinkingEnabled && selectedModel?.maxThinkingBudget && !selectedModel.supportsAdaptiveThinking);
  const modelSelectValue = selectedModel?.id ?? props.githubModel ?? "";
  const sessionSelectValue = props.currentSession?.mode === props.mode ? props.currentSession.id : laneSessions[0]?.id ?? "";
  const canRenameSession = Boolean(props.currentSession && titleDraft.trim() && titleDraft.trim() !== props.currentSession.title);
  const transferAction = describeTransferAction(props.mode);

  useEffect(() => {
    setTitleDraft(props.currentSession?.title ?? "");
    setIsRenamingSession(false);
  }, [props.currentSession?.id, props.currentSession?.title]);

  function closeSessionMenu(): void {
    if (sessionMenuRef.current) {
      sessionMenuRef.current.open = false;
    }
  }

  return (
    <section className="chat card">
      <div className="chat__header">
        <div className="chat__heading">
          <span className="eyebrow">{mode.label}</span>
          <h2>{mode.channelTitle}</h2>
        </div>

        <details className="session-menu" ref={sessionMenuRef}>
          <summary className="session-menu__trigger">
            <span className="session-menu__summary-label">Session</span>
            <strong>{props.currentSession?.title ?? "Untitled Session"}</strong>
            <span className="session-menu__summary-meta">{laneSessions.length} in this lane</span>
          </summary>

          <div className="session-menu__body">
            <label className="field field--wide">
              <span>Choose session</span>
              <select value={sessionSelectValue} onChange={(event) => props.onSelectSession(event.target.value)}>
                {laneSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title}
                  </option>
                ))}
              </select>
            </label>

            {isRenamingSession ? (
              <div className="session-menu__rename-row">
                <input
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (canRenameSession) {
                        props.onRenameSession(titleDraft);
                        setIsRenamingSession(false);
                        closeSessionMenu();
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
                    closeSessionMenu();
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
              <div className="session-menu__actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    props.onCreateSession(props.mode);
                    closeSessionMenu();
                  }}
                  disabled={props.busy}
                >
                  New
                </button>
                <button className="ghost-button" type="button" onClick={() => setIsRenamingSession(true)} disabled={!props.currentSession || props.busy}>
                  Rename
                </button>
              </div>
            )}
          </div>
        </details>
      </div>

      <div className="message-list message-list--transcript">
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
              </div>
            </article>
          ))
        )}
      </div>

      <form
        className="composer"
        onSubmit={async (event) => {
          event.preventDefault();
          const message = draft.trim();
          if (!message) {
            return;
          }
          setDraft("");
          await props.onSend(message);
        }}
      >
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={mode.prompt} rows={4} />
        <div className="composer__actions">
          <div className="composer__actions-primary">
            <button className="primary-button" type="submit" disabled={props.busy}>
              {describeComposerAction(props.mode)}
            </button>
            <button className="ghost-button" type="button" onClick={() => void props.onCancel()} disabled={!props.busy}>
              Stop
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => props.onImportSessionToMode(transferAction.target)}
              disabled={!props.currentSession || props.busy}
              title={transferAction.title}
            >
              {transferAction.label}
            </button>
          </div>
          <span className="detail-line composer__session-note">{props.currentSession?.title ?? "Untitled Session"}</span>
        </div>
      </form>

      <div className="chat-footer">
        <label className="chat-footer__field">
          <span className="eyebrow">Model</span>
          <select
            value={modelSelectValue}
            onChange={(event) => void props.onUpdateSettings({ githubModel: event.target.value })}
            disabled={props.busy || !props.tokenConfigured || props.availableGitHubModels.length === 0}
          >
            {!props.tokenConfigured ? <option value="">Add token in Settings</option> : null}
            {props.tokenConfigured && props.availableGitHubModels.length === 0 ? <option value="">No models loaded yet</option> : null}
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
                    {model.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <p className="detail-line chat-footer__status">{describeModelStatus(props.modelAccess, props.tokenConfigured)}</p>

        {selectedModel?.supportsThinking && props.modelAccess.backend === "copilot" ? (
          <details className="chat-footer__advanced">
            <summary>Thinking</summary>
            <div className="chat-footer__advanced-body">
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
    </section>
  );
}