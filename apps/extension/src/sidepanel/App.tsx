import { useEffect, useRef } from "react";

import { CaptureControls } from "./components/CaptureControls";
import { CaptureStatusCard } from "./components/CaptureStatusCard";
import { ChatView } from "./components/ChatView";
import { DatabasePanel } from "./components/DatabasePanel";
import { QuestionHistoryPanel } from "./components/QuestionHistoryPanel";
import { ReportsPanel } from "./components/ReportsPanel";
import { SessionHeader } from "./components/SessionHeader";
import { SettingsPanel } from "./components/SettingsPanel";
import type { QuestionStatus, ReportRecord } from "./types";
import { useAppStore } from "./state/store";

export function App() {
  const initialize = useAppStore((state) => state.initialize);
  const store = useAppStore();
  const activeQuestionCount = store.activeQuestions.length;
  const settingsOpen = store.activePanel === "settings";
  const tokenConfigured = Boolean(store.settings?.githubModelsToken.configured);
  const lastWorkspacePanelRef = useRef<"history" | "database" | "reports" | "capture">("history");

  useEffect(() => {
    if (store.activePanel !== "settings") {
      lastWorkspacePanelRef.current = store.activePanel;
    }
  }, [store.activePanel]);

  useEffect(() => {
    if (typeof window !== "undefined" && settingsOpen) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [settingsOpen]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  async function handleFilter(status?: QuestionStatus) {
    await store.loadQuestionHistory(status);
  }

  function handleOpenSettings(): void {
    if (store.activePanel === "settings") {
      store.setActivePanel(lastWorkspacePanelRef.current);
      return;
    }

    store.setActivePanel("settings");
  }

  function handleModeChange(mode: Parameters<typeof store.setMode>[0]): void {
    if (store.activePanel === "settings") {
      store.setActivePanel(lastWorkspacePanelRef.current);
    }

    void store.setMode(mode);
  }

  return (
    <div className="app-shell">
      <SessionHeader
        busy={store.isBusy}
        mode={store.mode}
        settingsViewOpen={settingsOpen}
        onSetMode={handleModeChange}
        onOpenSettings={handleOpenSettings}
        onCaptureCrop={() => void store.captureCropArea(true)}
        onShutdown={() => void store.shutdownRuntime()}
      />

      {store.error ? <div className="error-banner">{store.error}</div> : null}

      {!settingsOpen && !tokenConfigured ? (
        <div className="compact-auth-notice" role="status">
          <span>Not signed in.</span>
          <button className="ghost-button compact-auth-notice__action" type="button" onClick={handleOpenSettings}>
            Sign in
          </button>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="layout-grid layout-grid--settings">
          <div className="layout-grid__full">
            <SettingsPanel
              apiBaseUrl={store.apiBaseUrl}
              settings={store.settings}
              githubLoginFlow={store.githubLoginFlow}
              researchRuns={store.researchRuns}
              busy={store.isBusy}
              onSetApiBaseUrl={store.setApiBaseUrl}
              onUpdateSettings={store.updateSettings}
              onStartGitHubLogin={store.startGitHubLogin}
              onSaveGitHubModelsToken={store.saveGitHubModelsToken}
              onClearGitHubModelsToken={store.clearGitHubModelsToken}
              onImportResearch={store.importResearch}
            />
          </div>
        </div>
      ) : (
        <div className="layout-grid">
          <div className="layout-grid__main">
            {store.captureResult ? <CaptureStatusCard result={store.captureResult} onOpenCapture={() => store.setActivePanel("capture")} /> : null}

            <ChatView
              apiBaseUrl={store.apiBaseUrl}
              messages={store.messages}
              sessions={store.sessions}
              currentSession={store.currentSession}
              mode={store.mode}
              busy={store.isBusy}
              githubModel={store.settings?.githubModel ?? null}
              availableGitHubModels={store.settings?.availableGitHubModels ?? []}
              modelAccess={store.settings?.modelAccess ?? { backend: "none", tokenKind: "none", warning: null }}
              githubModelThinkingEnabled={store.settings?.githubModelThinkingEnabled ?? false}
              githubModelReasoningEffort={store.settings?.githubModelReasoningEffort ?? null}
              githubModelThinkingBudget={store.settings?.githubModelThinkingBudget ?? null}
              tokenConfigured={tokenConfigured}
              pendingAttachments={store.pendingAttachments}
              onSend={store.sendMessage}
              onUploadFiles={store.uploadAttachments}
              onRemovePendingAttachment={store.removePendingAttachment}
              onCancel={store.cancelTurn}
              onCreateSession={(mode) => void store.createSession(undefined, mode)}
              onRenameSession={(title) => void store.renameCurrentSession(title)}
              onUpdateSessionSettings={store.updateCurrentSessionSettings}
              onSelectSession={(sessionId) => void store.selectSession(sessionId)}
              onImportSessionToMode={(mode) => void store.importCurrentSessionToMode(mode)}
              onOpenSettings={handleOpenSettings}
              onUpdateSettings={store.updateSettings}
            />
          </div>

          <div className="layout-grid__side">
            <nav className="panel-tabs card">
              {[
                { value: "history", label: "Questions", count: activeQuestionCount },
                { value: "database", label: "Records" },
                { value: "reports", label: "Reports" },
                { value: "capture", label: "Capture" }
              ].map(({ value, label, count }) => (
                <button
                  key={value}
                  type="button"
                  className={`panel-tab ${store.activePanel === value ? "panel-tab--active" : ""}`}
                  onClick={() => store.setActivePanel(value as never)}
                >
                  <span className="panel-tab__label">{label}</span>
                  {typeof count === "number" ? <span className={`panel-tab__count ${count > 0 ? "panel-tab__count--active" : ""}`}>{count}</span> : null}
                </button>
              ))}
            </nav>

            {store.activePanel === "history" ? (
              <QuestionHistoryPanel
                sessionTitle={store.currentSession?.title ?? "Working Session"}
                activeQuestions={store.activeQuestions}
                questions={store.questionHistory}
                onFilter={handleFilter}
                onAnswer={store.answerQuestion}
                onArchive={store.archiveQuestion}
                onResolve={store.resolveQuestion}
                onReopen={store.reopenQuestion}
                onClearAll={store.clearAllQuestions}
              />
            ) : null}

            {store.activePanel === "database" ? <DatabasePanel result={store.databaseResult} onQuery={store.runDatabaseQuery} /> : null}

            {store.activePanel === "reports" ? (
              <ReportsPanel
                reports={store.reports}
                selectedReport={store.selectedReport}
                onGenerate={store.generateReport}
                onSelect={(report: ReportRecord) => useAppStore.setState({ selectedReport: report })}
              />
            ) : null}

            {store.activePanel === "capture" ? (
              <CaptureControls
                result={store.captureResult}
                onCaptureVisible={store.captureVisibleArea}
                onCaptureCrop={store.captureCropArea}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}