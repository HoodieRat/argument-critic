import type { CaptureSubmitResponse } from "../types";

interface CaptureStatusCardProps {
  readonly result: CaptureSubmitResponse;
  readonly onOpenCapture: () => void;
}

function describeTitle(result: CaptureSubmitResponse): string {
  return result.capture ? "Crop saved" : "Screenshot saved";
}

function describeSummary(result: CaptureSubmitResponse): string {
  if (result.analysis) {
    return `${result.analysis} It is also queued in the chat box as an attachment.`;
  }

  if (result.capture) {
    return `Saved a ${result.capture.cropWidth} x ${result.capture.cropHeight} crop to this session and added it to the chat box as an attachment.`;
  }

  return "Saved a screenshot to this session and added it to the chat box as an attachment.";
}

export function CaptureStatusCard(props: CaptureStatusCardProps) {
  return (
    <section className="card compact-card capture-callout">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Latest capture</p>
          <h2>{describeTitle(props.result)}</h2>
        </div>
        <button className="ghost-button" type="button" onClick={props.onOpenCapture}>
          Open Capture Tab
        </button>
      </div>

      <p>{describeSummary(props.result)}</p>
      <p className="detail-line">Next step: send a message from the current lane to have the assistant use this attachment, or open the Capture tab to review it separately.</p>
    </section>
  );
}