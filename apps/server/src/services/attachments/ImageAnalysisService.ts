import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { AuditLogRepository } from "../db/repositories/AuditLogRepository.js";
import { AttachmentsRepository } from "../db/repositories/AttachmentsRepository.js";
import type { CopilotClient, CopilotImageAttachment } from "../copilot/CopilotClient.js";

const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024;

function normalizeExtractedText(value: string): string | null {
  const strippedCodeFence = value
    .trim()
    .replace(/^```(?:text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const normalized = strippedCodeFence.replace(/^extracted text:\s*/i, "").trim();
  return normalized ? normalized : null;
}

export class ImageAnalysisService {
  public constructor(
    private readonly attachmentsRepository: AttachmentsRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly copilotClient: CopilotClient
  ) {}

  public analyze(sessionId: string, attachmentId: string, captureId?: string | null): string {
    const capture = captureId ? this.attachmentsRepository.getCaptureById(captureId) : null;
    const cacheKey = capture
      ? `attachment.analyzed:${attachmentId}:${capture.cropX}:${capture.cropY}:${capture.cropWidth}:${capture.cropHeight}`
      : `attachment.analyzed:${attachmentId}`;
    const cached = this.auditLogRepository.findLatestByAction(cacheKey, sessionId);
    if (cached) {
      const detail = JSON.parse(cached.detailJson) as { summary: string };
      return detail.summary;
    }

    const attachment = this.attachmentsRepository.getAttachmentById(attachmentId);
    if (!attachment) {
      throw new Error("Attachment not found.");
    }

    const summary = capture
      ? `${attachment.displayName ?? "This crop"} is a ${capture.cropWidth} x ${capture.cropHeight} capture from the current session.`
      : `${attachment.displayName ?? "This image"} is attached to the current session as an image reference.`;

    this.auditLogRepository.create({
      id: randomUUID(),
      sessionId,
      route: "attachment_analysis",
      action: cacheKey,
      detail: { summary }
    });

    if (capture) {
      this.attachmentsRepository.updateCaptureAnalysisStatus(capture.id, "analyzed");
    }

    return summary;
  }

  public async extractText(sessionId: string, attachmentId: string): Promise<string | null> {
    const cacheKey = `attachment.text-extracted:${attachmentId}`;
    const cached = this.auditLogRepository.findLatestByAction(cacheKey, sessionId);
    if (cached) {
      const detail = JSON.parse(cached.detailJson) as { text?: string };
      return typeof detail.text === "string" && detail.text.trim() ? detail.text : null;
    }

    const attachment = this.attachmentsRepository.getAttachmentById(attachmentId);
    if (!attachment || !attachment.mimeType.startsWith("image/")) {
      return null;
    }

    const imageAttachment = await this.buildInlineImageAttachment(attachment.path, attachment.mimeType, attachment.displayName ?? "Attachment image");
    if (!imageAttachment) {
      return null;
    }

    const extracted = await this.copilotClient.transcribeImageAttachment(imageAttachment);
    const normalized = extracted ? normalizeExtractedText(extracted.text) : null;
    if (!normalized) {
      return null;
    }

    this.auditLogRepository.create({
      id: randomUUID(),
      sessionId,
      route: "attachment_text_extraction",
      action: cacheKey,
      detail: {
        modelId: extracted?.modelId ?? null,
        text: normalized
      }
    });

    return normalized;
  }

  private async buildInlineImageAttachment(path: string, mimeType: string, label: string): Promise<CopilotImageAttachment | null> {
    try {
      const bytes = await readFile(path);
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_INLINE_IMAGE_BYTES) {
        return null;
      }

      return {
        label,
        mimeType,
        dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`
      };
    } catch {
      return null;
    }
  }
}