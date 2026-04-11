import { useState } from "react";

import { hasCaptureSupport } from "../platform";
import type { CaptureSubmitResponse } from "../types";

interface CaptureControlsProps {
  readonly result: CaptureSubmitResponse | null;
  readonly onCaptureVisible: (analyze: boolean) => Promise<void>;
  readonly onCaptureCrop: (analyze: boolean) => Promise<void>;
}

export function CaptureControls(props: CaptureControlsProps) {
  const [analyze, setAnalyze] = useState(true);
  const captureSupported = hasCaptureSupport();

  return (
    <section className="card compact-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Capture</p>
          <h2>Save a screenshot</h2>
        </div>
      </div>

      <p className="detail-line">Save the whole window or choose a crop area. The latest image stays attached to this session and drops into the chat box automatically.</p>

      <div className="quick-grid">
        <button
          className="primary-button"
          type="button"
          disabled={!captureSupported}
          onClick={() => void props.onCaptureVisible(analyze)}
        >
          Capture window
        </button>
        <button
          className="ghost-button"
          type="button"
          disabled={!captureSupported}
          onClick={() => void props.onCaptureCrop(analyze)}
        >
          Choose crop area
        </button>
      </div>

      {!captureSupported ? <div className="empty-state">Capture is available in the desktop drawer or the legacy browser helper.</div> : null}

      <label className="checkbox-row">
        <input type="checkbox" checked={analyze} onChange={(event) => setAnalyze(event.target.checked)} />
        <span>Show a quick summary after saving.</span>
      </label>

      {props.result ? (
        <div className="capture-result">
          <p className="capture-result__title">{props.result.capture ? "Latest crop saved" : "Latest screenshot saved"}</p>
          <p>{props.result.analysis ?? "Saved to this session."}</p>
          {props.result.capture ? (
            <p className="detail-line">Saved size: {props.result.capture.cropWidth} x {props.result.capture.cropHeight}</p>
          ) : null}
          <p className="detail-line">Use the Capture tab whenever you want to review or replace the saved image.</p>
        </div>
      ) : (
        <div className="empty-state">Your latest screenshot will appear here after you save it.</div>
      )}
    </section>
  );
}