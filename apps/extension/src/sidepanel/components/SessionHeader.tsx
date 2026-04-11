import { MODE_METADATA } from "../modeMetadata";
import type { SessionMode } from "../types";

interface SessionHeaderProps {
  readonly busy: boolean;
  readonly mode: SessionMode;
  readonly settingsViewOpen: boolean;
  readonly onSetMode: (mode: SessionMode) => void;
  readonly onOpenSettings: () => void;
  readonly onCaptureCrop: () => void;
  readonly onShutdown: () => void;
}

const CONVERSATION_MODES: SessionMode[] = ["normal_chat", "critic", "research_import"];

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M8 5h2.2l1.2-1.8h4.2L16.8 5H19a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a2 2 0 0 1 2-2h3Zm4 3.2A4.8 4.8 0 1 0 12 18a4.8 4.8 0 0 0 0-9.6Zm0 2A2.8 2.8 0 1 1 12 16a2.8 2.8 0 0 1 0-5.6Z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="m12 3 1.2 2.3 2.5.4.9 2.4 2.2 1.2-.7 2.4.7 2.4-2.2 1.2-.9 2.4-2.5.4L12 21l-1.2-2.3-2.5-.4-.9-2.4-2.2-1.2.7-2.4-.7-2.4 2.2-1.2.9-2.4 2.5-.4L12 3Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2C12.5523 2 13 2.44772 13 3V12C13 12.5523 12.5523 13 12 13C11.4477 13 11 12.5523 11 12V3C11 2.44772 11.4477 2 12 2ZM18.364 5.63604C18.7545 5.24555 19.3877 5.24555 19.7782 5.63604C21.724 7.58189 22.9515 10.2227 22.9515 13C22.9515 19.0751 18.0266 24 11.9515 24C5.87635 24 0.951477 19.0751 0.951477 13C0.951477 10.2227 2.179 7.58189 4.12484 5.63604C4.51536 5.24555 5.14853 5.24555 5.53905 5.63604C5.92956 6.02656 5.92956 6.65972 5.53905 7.05025C3.96347 8.62584 2.95148 10.7416 2.95148 13C2.95148 17.9706 6.98092 22 11.9515 22C16.922 22 20.9515 17.9706 20.9515 13C20.9515 10.7416 19.9395 8.62584 18.364 7.05025C17.9734 6.65972 17.9734 6.02656 18.364 5.63604Z" />
    </svg>
  );
}

export function SessionHeader(props: SessionHeaderProps) {
  return (
    <header className="session-header card compact-card">
      <div className="session-header__topline session-header__topline--compact">
        <div className="session-header__brand">
          <h1>Argument Critic</h1>
        </div>

        <div className="session-header__actions">
          <button
            className={`icon-button ${props.settingsViewOpen ? "primary-button" : "ghost-button"}`}
            type="button"
            onClick={props.onOpenSettings}
            title="Settings"
          >
            <GearIcon />
          </button>
          <button className="icon-button ghost-button ghost-button--danger" type="button" onClick={props.onShutdown} title="Exit app">
            <PowerIcon />
          </button>
        </div>
      </div>

      <div className="session-header__lane-row">
        <div className="mode-strip">
          {CONVERSATION_MODES.map((laneMode) => {
            const metadata = MODE_METADATA[laneMode];
            return (
              <button
                key={laneMode}
                type="button"
                className={`mode-chip ${props.mode === laneMode ? "mode-chip--active" : ""}`}
                onClick={() => props.onSetMode(laneMode)}
                title={metadata.summary}
              >
                {metadata.label}
              </button>
            );
          })}
        </div>

        <button className="icon-button primary-button session-header__camera-button" type="button" onClick={props.onCaptureCrop} disabled={props.busy} title="Cropshot">
          <CameraIcon />
          <span>Capture</span>
        </button>
      </div>
    </header>
  );
}
