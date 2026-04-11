import { useEffect, useRef, useState } from "react";

import { copyText, openExternalUrl } from "../platform";
import type { GitHubLoginFlow, RuntimeSettings } from "../types";

interface SettingsPanelProps {
  readonly apiBaseUrl: string;
  readonly settings: RuntimeSettings | null;
  readonly githubLoginFlow: GitHubLoginFlow | null;
  readonly researchRuns: Array<{ id: string; provider: string; createdAt: string }>;
  readonly busy: boolean;
  readonly onSetApiBaseUrl: (url: string) => Promise<void>;
  readonly onUpdateSettings: (patch: Partial<RuntimeSettings>) => Promise<void>;
  readonly onStartGitHubLogin: () => Promise<void>;
  readonly onSaveGitHubModelsToken: (token: string) => Promise<void>;
  readonly onClearGitHubModelsToken: () => Promise<void>;
  readonly onImportResearch: (payload: string, enabledForContext: boolean) => Promise<void>;
}

function describeTokenSource(source: RuntimeSettings["githubModelsToken"]["source"] | undefined): string {
  switch (source) {
    case "secure_store":
      return "Stored securely for this Windows user account.";
    case "environment":
      return "Loaded from the startup environment for this server session.";
    default:
      return "No credential is configured.";
  }
}

function describeTokenKind(kind: RuntimeSettings["modelAccess"]["tokenKind"] | undefined): string {
  switch (kind) {
    case "copilot":
      return "Direct Copilot access detected.";
    case "oauth_token":
      return "GitHub sign-in detected.";
    case "personal_access_token":
      return "Manual GitHub credential detected.";
    case "unknown":
      return "Credential format is unknown.";
    default:
      return "No credential has been classified yet.";
  }
}

function describeModelBackend(modelAccess: RuntimeSettings["modelAccess"] | undefined): string {
  if (modelAccess?.backend === "copilot" && modelAccess.tokenKind === "oauth_token") {
    return "Requests are using the Copilot model service through your GitHub sign-in.";
  }

  if (modelAccess?.backend === "copilot" && modelAccess.tokenKind === "personal_access_token") {
    return "Requests are using the Copilot model service with your saved GitHub credential.";
  }

  switch (modelAccess?.backend) {
    case "copilot":
      return "Requests are using the Copilot model service.";
    case "github-models":
      return "Requests are using the GitHub Models REST API.";
    default:
      return "No model backend is active yet.";
  }
}

function describeModelWarning(modelAccess: RuntimeSettings["modelAccess"] | undefined): string | null {
  if (!modelAccess?.warning) {
    return null;
  }

  if (modelAccess.backend === "github-models" && modelAccess.tokenKind === "personal_access_token") {
    return "The saved manual credential only unlocks GitHub Models here. Most manually created GitHub tokens do not expose the full Copilot catalog in this app. Use Sign in with GitHub if you need Copilot-only models such as GPT-5.4 or Claude 4.6.";
  }

  if (modelAccess.backend === "github-models" && modelAccess.tokenKind === "oauth_token") {
    return "Your GitHub sign-in imported successfully, but GitHub is only allowing GitHub Models for this credential path in this app right now.";
  }

  return modelAccess.warning;
}

function isGitHubLoginPending(flow: GitHubLoginFlow | null): boolean {
  return flow !== null && flow.state !== "succeeded" && flow.state !== "failed";
}

function describeGitHubLoginState(flow: GitHubLoginFlow | null): string {
  switch (flow?.state) {
    case "checking":
      return "Preparing GitHub sign-in";
    case "waiting":
      return flow.authMethod === "oauth-device" ? "Enter your one-time GitHub code" : "Finish GitHub sign-in in your browser";
    case "importing":
      return "Importing GitHub sign-in";
    case "succeeded":
      return "GitHub sign-in connected";
    case "failed":
      return "GitHub sign-in needs attention";
    default:
      return "Ready to connect";
  }
}

function describeGitHubLoginBadge(flow: GitHubLoginFlow | null, tokenConfigured: boolean): string {
  if (isGitHubLoginPending(flow)) {
    return "Signing in";
  }

  if (flow?.state === "failed") {
    return "Action needed";
  }

  return tokenConfigured ? "Configured" : "Not configured";
}

function describeGitHubLoginBadgeClass(flow: GitHubLoginFlow | null, tokenConfigured: boolean): string {
  if (isGitHubLoginPending(flow)) {
    return "status-pill status-pill--working";
  }

  if (flow?.state === "failed") {
    return "status-pill status-pill--down";
  }

  return `status-pill ${tokenConfigured ? "status-pill--ready" : "status-pill--down"}`;
}

function showGitHubCliInstallHint(flow: GitHubLoginFlow | null): boolean {
  return flow?.authMethod === "github-cli" && flow.state === "failed" && /GitHub CLI|sign-in helper|cli\.github\.com/i.test(flow.message);
}

function resolveGitHubLoginAuthMethod(settings: RuntimeSettings | null, flow: GitHubLoginFlow | null): RuntimeSettings["githubLoginAuthMethod"] {
  return flow?.authMethod ?? settings?.githubLoginAuthMethod ?? "github-cli";
}

function describeGitHubLoginIntro(authMethod: RuntimeSettings["githubLoginAuthMethod"]): string {
  if (authMethod === "oauth-device") {
    return "Use Sign in with GitHub first. This build uses GitHub's device approval flow and refreshes the model list automatically after approval.";
  }

  return "Use Sign in with GitHub first. Windows installs bundle the GitHub sign-in helper, and source checkouts install the same helper through Install Argument Critic.cmd.";
}

function describeGitHubLoginActionLabel(authMethod: RuntimeSettings["githubLoginAuthMethod"], pending: boolean): string {
  if (pending) {
    return authMethod === "oauth-device" ? "Waiting for GitHub approval..." : "Waiting for GitHub sign-in...";
  }

  return "Sign in with GitHub";
}

function shouldShowConnectionSummary(settings: RuntimeSettings | null, flow: GitHubLoginFlow | null): boolean {
  if ((settings?.githubModelsToken.configured ?? false) || (settings?.availableGitHubModels.length ?? 0) > 0) {
    return true;
  }

  return flow?.state === "succeeded";
}

function describeConnectionBadge(modelAccess: RuntimeSettings["modelAccess"] | undefined, loadedModelCount: number): string {
  if (modelAccess?.backend === "copilot") {
    return "Copilot active";
  }

  if (modelAccess?.backend === "github-models") {
    return "GitHub Models";
  }

  return loadedModelCount > 0 ? "Configured" : "Refreshing";
}

function describeModelUsage(model: RuntimeSettings["availableGitHubModels"][number]): string | null {
  if (typeof model.multiplier === "number" && model.multiplier > 0 && model.isPremium) {
    return `Usage x${model.multiplier}`;
  }

  return null;
}

function describeModelCatalogScope(modelAccess: RuntimeSettings["modelAccess"] | undefined): string {
  if (modelAccess?.backend === "copilot") {
    return "This is the full Copilot-backed list currently exposed to this signed-in account in this app.";
  }

  if (modelAccess?.backend === "github-models") {
    return "This is the full GitHub Models list currently exposed to this credential path in this app. GitHub may expose a smaller catalog here than it does through Copilot-backed access.";
  }

  return "This list shows the models the current credential is exposing to this app right now.";
}

export function SettingsPanel(props: SettingsPanelProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState(props.apiBaseUrl);
  const [researchPayload, setResearchPayload] = useState("");
  const tokenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setApiBaseUrl(props.apiBaseUrl);
  }, [props.apiBaseUrl]);

  const tokenStatus = props.settings?.githubModelsToken;
  const tokenConfigured = tokenStatus?.configured ?? false;
  const canRemoveStoredCredential = tokenStatus?.source === "secure_store";
  const researchEnabled = props.settings?.researchEnabled ?? false;
  const questionGenerationEnabled = props.settings?.questionGenerationEnabled ?? true;
  const autoTitleEnabled = props.settings?.sessionAutoTitleEnabled ?? true;
  const modelAccess = props.settings?.modelAccess;
  const availableModels = props.settings?.availableGitHubModels ?? [];
  const loadedModelCount = availableModels.length;
  const meteredModelCount = availableModels.filter((model) => typeof model.multiplier === "number" && model.multiplier > 0 && model.isPremium).length;
  const previewModelCount = availableModels.filter((model) => model.preview).length;
  const githubLoginPending = isGitHubLoginPending(props.githubLoginFlow);
  const githubLoginAuthMethod = resolveGitHubLoginAuthMethod(props.settings, props.githubLoginFlow);
  const showConnectionSummary = shouldShowConnectionSummary(props.settings, props.githubLoginFlow);

  async function handleSaveToken(): Promise<void> {
    const input = tokenInputRef.current;
    const token = input?.value ?? "";
    if (!token.trim()) {
      return;
    }

    await props.onSaveGitHubModelsToken(token);
    if (input) {
      input.value = "";
    }
  }

  return (
    <section className="card compact-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>GitHub and Copilot access</h2>
        </div>
        <span className={describeGitHubLoginBadgeClass(props.githubLoginFlow, tokenConfigured)}>{describeGitHubLoginBadge(props.githubLoginFlow, tokenConfigured)}</span>
      </div>

      <p className="detail-line">{describeGitHubLoginIntro(githubLoginAuthMethod)}</p>

      <div className={canRemoveStoredCredential ? "quick-grid" : "settings-actions-row"}>
        <button className="primary-button" type="button" onClick={() => void props.onStartGitHubLogin()} disabled={props.busy || githubLoginPending}>
          {describeGitHubLoginActionLabel(githubLoginAuthMethod, githubLoginPending)}
        </button>
        {canRemoveStoredCredential ? (
          <button className="ghost-button" type="button" onClick={() => void props.onClearGitHubModelsToken()} disabled={props.busy}>
            Remove stored credential
          </button>
        ) : null}
      </div>

      <div className={`settings-login-status settings-login-status--${props.githubLoginFlow?.state ?? "idle"}`}>
        <div className="settings-login-status__header">
          <strong>{describeGitHubLoginState(props.githubLoginFlow)}</strong>
          <span className={describeGitHubLoginBadgeClass(props.githubLoginFlow, tokenConfigured)}>{describeGitHubLoginBadge(props.githubLoginFlow, tokenConfigured)}</span>
        </div>
        <p>
          {props.githubLoginFlow?.message ?? (githubLoginAuthMethod === "oauth-device"
            ? "Recommended path: sign in with GitHub here, approve the code, and let the app refresh the model list automatically."
            : "Recommended path: sign in with GitHub here. The Windows install uses GitHub CLI under the hood so the app can import Copilot-capable access automatically.")}
        </p>
        {props.githubLoginFlow?.userCode && props.githubLoginFlow?.verificationUri ? (
          <div className="settings-device-flow">
            <div className="settings-device-flow__code">{props.githubLoginFlow.userCode}</div>
            <div className="quick-grid settings-device-flow__actions">
              <button className="primary-button" type="button" onClick={() => void openExternalUrl(props.githubLoginFlow?.verificationUri ?? "https://github.com/login/device")}>
                Open GitHub approval page
              </button>
              <button className="ghost-button" type="button" onClick={() => void copyText(props.githubLoginFlow?.userCode ?? "")}>Copy code</button>
            </div>
            {props.githubLoginFlow.expiresAt ? <p className="detail-line">Code expires: {new Date(props.githubLoginFlow.expiresAt).toLocaleTimeString()}</p> : null}
          </div>
        ) : null}
        {props.githubLoginFlow?.accountLogin ? <p className="detail-line">Signed in as: {props.githubLoginFlow.accountLogin}</p> : null}
        {props.githubLoginFlow ? <p className="detail-line">Last update: {new Date(props.githubLoginFlow.updatedAt).toLocaleString()}</p> : null}
      </div>

      {showGitHubCliInstallHint(props.githubLoginFlow) ? (
        <div className="session-header__notice session-header__notice--warning">
          <p>The GitHub sign-in helper is missing or unavailable, so Sign in with GitHub cannot complete yet.</p>
          <p className="detail-line settings-command">Installed build: reinstall the latest release. Source checkout: re-run Install Argument Critic.cmd.</p>
          <div className="settings-login-help">
            <button className="primary-button" type="button" onClick={() => void openExternalUrl("https://github.com/HoodieRat/argument-critic/releases/latest")}>Open latest release</button>
          </div>
        </div>
      ) : null}

      {showConnectionSummary ? (
        <div className="settings-login-status settings-login-status--succeeded">
          <div className="settings-login-status__header">
            <strong>{loadedModelCount} models loaded</strong>
            <span className="status-pill status-pill--ready">{describeConnectionBadge(modelAccess, loadedModelCount)}</span>
          </div>
          <p>{describeModelBackend(modelAccess)}</p>
          <p className="detail-line">{describeTokenKind(modelAccess?.tokenKind)}</p>
          <p className="detail-line">{describeTokenSource(tokenStatus?.source)}</p>
          {tokenStatus?.updatedAt ? <p className="detail-line">Last updated: {new Date(tokenStatus.updatedAt).toLocaleString()}</p> : null}
          {loadedModelCount > 0 ? (
            <div className="settings-summary-grid">
              <div className="settings-summary-item">
                <span className="eyebrow">Listed</span>
                <p>{loadedModelCount}</p>
              </div>
              <div className="settings-summary-item">
                <span className="eyebrow">Metered</span>
                <p>{meteredModelCount}</p>
              </div>
              <div className="settings-summary-item">
                <span className="eyebrow">Preview</span>
                <p>{previewModelCount}</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {availableModels.length > 0 ? (
        <section className="settings-model-catalog">
          <div className="settings-model-catalog__header">
            <div>
              <p className="eyebrow">Available models</p>
              <h2>Current account catalog</h2>
            </div>
            <div className="settings-model-catalog__counts">
              <span className="settings-model-badge">{loadedModelCount} listed</span>
              {meteredModelCount > 0 ? <span className="settings-model-badge settings-model-badge--premium">{meteredModelCount} usage multiplier</span> : null}
              {previewModelCount > 0 ? <span className="settings-model-badge">{previewModelCount} preview</span> : null}
            </div>
          </div>
          <p className="detail-line">{describeModelCatalogScope(modelAccess)}</p>
          <div className="settings-model-catalog__list">
            {availableModels.map((model) => (
              <article key={model.id} className="settings-model-item">
                <div className="settings-model-item__copy">
                  <strong>{model.name}</strong>
                  <span>{model.vendor}</span>
                </div>
                <div className="settings-model-item__badges">
                  {describeModelUsage(model) ? <span className="settings-model-badge settings-model-badge--premium">{describeModelUsage(model)}</span> : null}
                  {model.preview ? <span className="settings-model-badge">Preview</span> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {describeModelWarning(modelAccess) ? (
        <div className="session-header__notice session-header__notice--warning">
          <p>Why some models are missing</p>
          <p className="detail-line">{describeModelWarning(modelAccess)}</p>
        </div>
      ) : null}

      <details className="session-header__advanced-options">
        <summary>Advanced settings</summary>
        <div className="session-header__advanced-options-body settings-advanced-auth">
          <p className="detail-line">Preferred sign-in path: {githubLoginAuthMethod === "oauth-device" ? "Direct GitHub device approval" : "GitHub CLI-backed GitHub sign-in"}</p>
          {tokenStatus?.source === "environment" ? <p className="detail-line">Saving a manual credential here will replace the environment-provided credential for future requests. Removing the stored credential will fall back to the environment value again.</p> : null}
          {props.githubLoginFlow?.reviewUri ? (
            <button className="ghost-button" type="button" onClick={() => void openExternalUrl(props.githubLoginFlow?.reviewUri ?? "")}>Open GitHub review page</button>
          ) : null}

          <div className="settings-advanced-block">
            <p className="eyebrow">Manual fallback</p>
            <p className="detail-line settings-advanced-auth__copy">Use this only if you already have a credential that you know works in this app. GitHub sign-in above is the default onboarding path, and normal GitHub tokens usually expose GitHub Models only rather than the full Copilot catalog.</p>
            <label className="field field--wide">
              <span>GitHub or Copilot credential</span>
              <input ref={tokenInputRef} type="password" autoComplete="new-password" spellCheck={false} placeholder={tokenConfigured ? "Enter a new credential to replace the stored one" : "Paste a GitHub or Copilot credential"} />
            </label>
            <div className="quick-grid settings-advanced-auth__actions">
              <button className="primary-button" type="button" onClick={() => void handleSaveToken()} disabled={props.busy}>
                Save credential securely
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  if (tokenInputRef.current) {
                    tokenInputRef.current.value = "";
                  }
                }}
                disabled={props.busy}
              >
                Clear pasted credential
              </button>
            </div>
          </div>

          <div className="settings-advanced-block">
            <p className="eyebrow">App settings</p>
            <label className="field">
              <span>Local API base URL</span>
              <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="http://127.0.0.1:4317" />
            </label>
            <button className="ghost-button settings-save-inline" type="button" onClick={() => void props.onSetApiBaseUrl(apiBaseUrl)} disabled={props.busy}>
              Save API URL
            </button>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={autoTitleEnabled}
                onChange={(event) => void props.onUpdateSettings({ sessionAutoTitleEnabled: event.target.checked })}
              />
              <span>
                <strong>Auto-name sessions from the first message</strong>
                <small className="detail-line">Blank sessions will rename themselves after the first real turn unless you rename them manually first.</small>
              </span>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={questionGenerationEnabled}
                onChange={(event) => void props.onUpdateSettings({ questionGenerationEnabled: event.target.checked })}
              />
              <span>
                <strong>Generate follow-up questions</strong>
                <small className="detail-line">Keep this on if you want the queue to propose new questions. It stops automatically once five active questions are open.</small>
              </span>
            </label>
          </div>

          <details className="session-header__advanced-options settings-nested-details">
            <summary>Research import</summary>
            <div className="session-header__advanced-options-body settings-advanced-auth">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={researchEnabled}
                  onChange={(event) => void props.onUpdateSettings({ researchEnabled: event.target.checked })}
                />
                <span>
                  <strong>Allow GPT-Researcher imports</strong>
                  <small className="detail-line">Turn this on before importing outside research into the current workspace context.</small>
                </span>
              </label>

              <label className="field">
                <span>Paste GPT-Researcher JSON or bullet output</span>
                <textarea value={researchPayload} onChange={(event) => setResearchPayload(event.target.value)} rows={7} disabled={!researchEnabled} />
              </label>
              {!researchEnabled ? <p className="detail-line">Research import is off. Enable it above to unlock the import box.</p> : null}
              <button className="primary-button" type="button" onClick={() => void props.onImportResearch(researchPayload, researchEnabled)} disabled={!researchEnabled || !researchPayload.trim()}>
                Import research
              </button>

              {props.researchRuns.length > 0 ? (
                <div className="history-list">
                  {props.researchRuns.map((run) => (
                    <article key={run.id} className="history-item">
                      <div className="history-item__meta">
                        <span>{run.provider}</span>
                        <span>{new Date(run.createdAt).toLocaleString()}</span>
                      </div>
                      <p>{run.id}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </details>
        </div>
      </details>
    </section>
  );
}
