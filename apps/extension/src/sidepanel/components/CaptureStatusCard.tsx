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
    return result.analysis;
  }

  if (result.capture) {
    return `Saved a ${result.capture.cropWidth} x ${result.capture.cropHeight} crop to this session.`;
  }

  return "Saved a screenshot to this session.";
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
          Open Capture
        </button>
      </div>

      <p>{describeSummary(props.result)}</p>
      <p className="detail-line">Next step: use the Capture tab if you want to review or replace this image. It stays saved with the current session.</p>
    </section>
  );
}