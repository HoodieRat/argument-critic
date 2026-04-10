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
      return "No token is configured.";
  }
}

function describeTokenKind(kind: RuntimeSettings["modelAccess"]["tokenKind"] | undefined): string {
  switch (kind) {
    case "copilot":
      return "Direct Copilot token detected.";
    case "oauth_token":
      return "GitHub sign-in token detected.";
    case "personal_access_token":
      return "Personal access token detected.";
    case "unknown":
      return "Token format is unknown.";
    default:
      return "No token has been classified yet.";
  }
}

function describeModelBackend(modelAccess: RuntimeSettings["modelAccess"] | undefined): string {
  if (modelAccess?.backend === "copilot" && modelAccess.tokenKind === "oauth_token") {
    return "Requests are using the Copilot model service through your GitHub sign-in.";
  }

  if (modelAccess?.backend === "copilot" && modelAccess.tokenKind === "personal_access_token") {
    return "Requests are using the Copilot model service with your saved GitHub token.";
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
    return "The saved token is a GitHub personal access token, and GitHub is only allowing GitHub Models for it here. Use GitHub sign-in or a Copilot-ready credential if you need Copilot-only models such as GPT-5.4 or Claude 4.6 in this app.";
  }

  if (modelAccess.backend === "github-models" && modelAccess.tokenKind === "oauth_token") {
    return "Your GitHub sign-in imported successfully, but GitHub is only allowing GitHub Models for this account in this app right now.";
  }

  return modelAccess.warning;
}

function isGitHubLoginPending(flow: GitHubLoginFlow | null): boolean {
  return flow !== null && flow.state !== "succeeded" && flow.state !== "failed";
}

function describeGitHubLoginState(flow: GitHubLoginFlow | null): string {
  switch (flow?.state) {
    case "checking":
      return flow.authMethod === "oauth-device" ? "Preparing GitHub sign-in" : "Checking local GitHub sign-in";
    case "waiting":
      return flow.authMethod === "oauth-device" ? "Enter your one-time GitHub code" : "Waiting for browser sign-in";
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
  return flow?.authMethod === "github-cli" && flow.state === "failed" && /GitHub CLI|cli\.github\.com/i.test(flow.message);
}

function isOAuthDeviceFlow(flow: GitHubLoginFlow | null): boolean {
  return flow?.authMethod === "oauth-device";
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
  const researchEnabled = props.settings?.researchEnabled ?? false;
  const autoTitleEnabled = props.settings?.sessionAutoTitleEnabled ?? true;
  const modelAccess = props.settings?.modelAccess;
  const githubLoginPending = isGitHubLoginPending(props.githubLoginFlow);

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
          <h2>Runtime and research gate</h2>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <p className="eyebrow">GitHub sign-in</p>
          <h2>GitHub and Copilot access</h2>
        </div>
        <span className={describeGitHubLoginBadgeClass(props.githubLoginFlow, tokenConfigured)}>{describeGitHubLoginBadge(props.githubLoginFlow, tokenConfigured)}</span>
      </div>

      <p className="detail-line">
        {isOAuthDeviceFlow(props.githubLoginFlow)
          ? "Use GitHub sign-in first. The app opens GitHub in your browser, shows a one-time code here, and then finishes the import automatically after you approve it."
          : "Use GitHub sign-in first. This flow uses your browser, not a username/password form inside the app. If GitHub CLI is already signed in on this machine, the app will import it immediately. Otherwise it will open browser sign-in and finish the import automatically."}
      </p>

      <div className="quick-grid">
        <button className="primary-button" type="button" onClick={() => void props.onStartGitHubLogin()} disabled={props.busy || githubLoginPending}>
          {githubLoginPending ? "Waiting for GitHub approval..." : "Sign in with GitHub"}
        </button>
        <button className="ghost-button" type="button" onClick={() => void props.onClearGitHubModelsToken()} disabled={props.busy || tokenStatus?.source !== "secure_store"}>
          Remove stored credential
        </button>
      </div>

      <div className={`settings-login-status settings-login-status--${props.githubLoginFlow?.state ?? "idle"}`}>
        <div className="settings-login-status__header">
          <strong>{describeGitHubLoginState(props.githubLoginFlow)}</strong>
          <span className={describeGitHubLoginBadgeClass(props.githubLoginFlow, tokenConfigured)}>{describeGitHubLoginBadge(props.githubLoginFlow, tokenConfigured)}</span>
        </div>
        <p>
          {props.githubLoginFlow?.message ?? "Recommended path: sign in with GitHub here, then let the app import that login and refresh the model list for you."}
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
          <p>GitHub CLI is required for browser sign-in on this build.</p>
          <p className="detail-line settings-command">Windows install: winget install --id GitHub.cli -e</p>
          <div className="quick-grid settings-login-help">
            <button className="primary-button" type="button" onClick={() => void openExternalUrl("https://cli.github.com/")}>Open GitHub CLI download</button>
            <button className="ghost-button" type="button" onClick={() => void openExternalUrl("https://cli.github.com/manual/gh_auth_login")}>Why no password box?</button>
          </div>
        </div>
      ) : null}

      <p className="detail-line">Loaded models: {props.settings?.availableGitHubModels.length ?? 0}</p>
      <p className="detail-line">{describeTokenSource(tokenStatus?.source)}</p>
      <p className="detail-line">{describeTokenKind(modelAccess?.tokenKind)}</p>
      <p className="detail-line">{describeModelBackend(modelAccess)}</p>
      {tokenStatus?.updatedAt ? <p className="detail-line">Last updated: {new Date(tokenStatus.updatedAt).toLocaleString()}</p> : null}
      {tokenStatus?.source === "environment" ? (
        <p className="detail-line">Saving a token here will replace the environment-backed token for future requests. Removing the stored token will fall back to the environment token again.</p>
      ) : null}
      {describeModelWarning(modelAccess) ? <div className="error-banner">{describeModelWarning(modelAccess)}</div> : null}

      <details className="session-header__advanced-options">
        <summary>Advanced fallback: paste a token manually</summary>
        <div className="session-header__advanced-options-body settings-advanced-auth">
          <p className="detail-line settings-advanced-auth__copy">Use this only if you already know the credential works for Copilot in this app. GitHub sign-in above is the default onboarding path.</p>

          <label className="field field--wide">
            <span>GitHub or Copilot token</span>
            <input ref={tokenInputRef} type="password" autoComplete="new-password" spellCheck={false} placeholder={tokenConfigured ? "Enter a new token to replace the stored one" : "Paste a GitHub or Copilot token"} />
          </label>

          <div className="quick-grid settings-advanced-auth__actions">
            <button className="primary-button" type="button" onClick={() => void handleSaveToken()} disabled={props.busy}>
              Save token securely
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
              Clear pasted token
            </button>
          </div>
        </div>
      </details>

      <label className="field">
        <span>Local API base URL</span>
        <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="http://127.0.0.1:4317" />
      </label>
      <button className="ghost-button" type="button" onClick={() => void props.onSetApiBaseUrl(apiBaseUrl)} disabled={props.busy}>
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
    </section>
  );
}