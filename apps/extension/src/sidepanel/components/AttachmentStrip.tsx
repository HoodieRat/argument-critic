import type { AttachmentRecord } from "../types";

interface AttachmentStripProps {
  readonly attachments: AttachmentRecord[];
  readonly apiBaseUrl: string;
  readonly removable?: boolean;
  readonly onRemove?: (attachmentId: string) => void;
}

function buildAttachmentUrl(apiBaseUrl: string, attachmentId: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/attachments/${encodeURIComponent(attachmentId)}/content`;
}

function describeAttachmentLabel(attachment: AttachmentRecord): string {
  return attachment.displayName ?? (attachment.mimeType.startsWith("image/") ? "Image attachment" : "Reference file");
}

export function AttachmentStrip(props: AttachmentStripProps) {
  if (props.attachments.length === 0) {
    return null;
  }

  return (
    <div className="attachment-strip">
      {props.attachments.map((attachment) => {
        const url = buildAttachmentUrl(props.apiBaseUrl, attachment.id);
        const isImage = attachment.mimeType.startsWith("image/");

        return (
          <article key={attachment.id} className={`attachment-pill ${isImage ? "attachment-pill--image" : "attachment-pill--file"}`}>
            {isImage ? <img className="attachment-pill__preview" src={url} alt={describeAttachmentLabel(attachment)} loading="lazy" /> : <div className="attachment-pill__file-badge">FILE</div>}

            <div className="attachment-pill__meta">
              <strong>{describeAttachmentLabel(attachment)}</strong>
              <span>{attachment.mimeType}</span>
            </div>

            {props.removable && props.onRemove ? (
              <button className="ghost-button" type="button" onClick={() => props.onRemove?.(attachment.id)}>
                Remove
              </button>
            ) : (
              <a className="ghost-button attachment-pill__open" href={url} target="_blank" rel="noreferrer">
                Open
              </a>
            )}
          </article>
        );
      })}
    </div>
  );
}