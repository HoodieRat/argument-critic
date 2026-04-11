import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

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

function resolveExtension(mimeType: string, displayName?: string | null): string {
  const fileExtension = extname(displayName ?? "").trim();
  if (fileExtension) {
    return fileExtension.toLowerCase();
  }

  if (mimeType.includes("png")) {
    return ".png";
  }
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return ".jpg";
  }
  if (mimeType.includes("gif")) {
    return ".gif";
  }
  if (mimeType.includes("webp")) {
    return ".webp";
  }
  if (mimeType.startsWith("text/") || mimeType.includes("json")) {
    return ".txt";
  }

  return ".bin";
}

function normalizeDisplayName(displayName: string | null | undefined, fallback: string): string {
  const normalized = displayName?.replace(/[\\/]+/g, " ").trim();
  return normalized || fallback;
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
    return await this.storeBytes({
      sessionId: input.sessionId,
      bytes,
      mimeType: input.mimeType,
      crop: input.crop,
      displayName: input.crop ? "Cropshot.png" : "Screenshot.png"
    });
  }

  public async storeUpload(input: {
    sessionId: string;
    bytes: Buffer;
    mimeType: string;
    fileName: string;
  }): Promise<StoredAttachment> {
    return await this.storeBytes({
      sessionId: input.sessionId,
      bytes: input.bytes,
      mimeType: input.mimeType,
      displayName: input.fileName
    });
  }

  private async storeBytes(input: {
    sessionId: string;
    bytes: Buffer;
    mimeType: string;
    displayName?: string | null;
    crop?: { x: number; y: number; width: number; height: number };
  }): Promise<StoredAttachment> {
    const contentHash = createHash("sha256").update(input.bytes).digest("hex");
    const fileName = `${contentHash}${resolveExtension(input.mimeType, input.displayName)}`;
    const outputPath = join(this.config.dataDir, "attachments", fileName);
    await writeFile(outputPath, input.bytes);

    const attachment = this.attachmentsRepository.createAttachment({
      id: randomUUID(),
      sessionId: input.sessionId,
      type: input.mimeType.startsWith("image/") ? "image" : "file",
      path: outputPath,
      displayName: normalizeDisplayName(input.displayName, input.mimeType.startsWith("image/") ? "Attachment image" : "Attachment file"),
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