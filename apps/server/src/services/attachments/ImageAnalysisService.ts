import { randomUUID } from "node:crypto";

import { AuditLogRepository } from "../db/repositories/AuditLogRepository.js";
import { AttachmentsRepository } from "../db/repositories/AttachmentsRepository.js";

export class ImageAnalysisService {
  public constructor(
    private readonly attachmentsRepository: AttachmentsRepository,
    private readonly auditLogRepository: AuditLogRepository
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
      ? `Saved a ${capture.cropWidth} x ${capture.cropHeight} crop to this session. Open Capture any time to review or replace it.`
      : "Saved a screenshot to this session. Open Capture any time to review or replace it.";

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
}