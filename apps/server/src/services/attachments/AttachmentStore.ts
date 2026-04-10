import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { EnvironmentConfig } from "../../config/env.js";
import type { AttachmentRecord, CaptureRecord } from "../../types/domain.js";
import { AttachmentsRepository } from "../db/repositories/AttachmentsRepository.js";

export interface StoredAttachment {
  readonly attachment: AttachmentRecord;
  readonly capture: CaptureRecord | null;
}

function decodeDataUrl(dataUrl: string): Buffer {
  const [, encoded] = dataUrl.split(",", 2);
  return Buffer.from(encoded ?? "", "base64");
}

export class AttachmentStore {
  public constructor(
    private readonly config: EnvironmentConfig,
    private readonly attachmentsRepository: AttachmentsRepository
  ) {}

  public async store(input: {
    sessionId: string;
    dataUrl: string;
    mimeType: string;
    crop?: { x: number; y: number; width: number; height: number };
  }): Promise<StoredAttachment> {
    const bytes = decodeDataUrl(input.dataUrl);
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const fileName = `${contentHash}.${input.mimeType.includes("png") ? "png" : "bin"}`;
    const outputPath = join(this.config.dataDir, "attachments", fileName);
    await writeFile(outputPath, bytes);

    const attachment = this.attachmentsRepository.createAttachment({
      id: randomUUID(),
      sessionId: input.sessionId,
      type: "image",
      path: outputPath,
      mimeType: input.mimeType,
      contentHash
    });

    const capture = input.crop
      ? this.attachmentsRepository.createCapture({
          id: randomUUID(),
          attachmentId: attachment.id,
          cropX: Math.round(input.crop.x),
          cropY: Math.round(input.crop.y),
          cropWidth: Math.round(input.crop.width),
          cropHeight: Math.round(input.crop.height),
          analysisStatus: "pending"
        })
      : null;

    return { attachment, capture };
  }
}