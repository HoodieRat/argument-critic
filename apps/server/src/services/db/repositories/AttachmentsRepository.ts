import type Database from "better-sqlite3";

import type { AttachmentRecord, CaptureRecord } from "../../../types/domain.js";
import { nowIso } from "../../../utils/time.js";

function mapAttachment(row: {
  id: string;
  session_id: string;
  type: string;
  path: string;
  display_name: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  content_hash: string;
  created_at: string;
}): AttachmentRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    path: row.path,
    displayName: row.display_name,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    contentHash: row.content_hash,
    createdAt: row.created_at
  };
}

function mapCapture(row: {
  id: string;
  attachment_id: string;
  crop_x: number;
  crop_y: number;
  crop_width: number;
  crop_height: number;
  analysis_status: string;
  created_at: string;
}): CaptureRecord {
  return {
    id: row.id,
    attachmentId: row.attachment_id,
    cropX: row.crop_x,
    cropY: row.crop_y,
    cropWidth: row.crop_width,
    cropHeight: row.crop_height,
    analysisStatus: row.analysis_status,
    createdAt: row.created_at
  };
}

export class AttachmentsRepository {
  public constructor(private readonly database: Database.Database) {}

  public createAttachment(input: {
    id: string;
    sessionId: string;
    type: string;
    path: string;
    displayName?: string | null;
    mimeType: string;
    width?: number | null;
    height?: number | null;
    contentHash: string;
  }): AttachmentRecord {
    const existing = this.findByHash(input.sessionId, input.contentHash);
    if (existing) {
      if (!existing.displayName && input.displayName?.trim()) {
        this.database.prepare("UPDATE attachments SET display_name = ? WHERE id = ?").run(input.displayName.trim(), existing.id);
        return this.getAttachmentById(existing.id)!;
      }
      return existing;
    }

    const createdAt = nowIso();
    this.database
      .prepare(
        `INSERT INTO attachments (id, session_id, type, path, display_name, mime_type, width, height, content_hash, created_at)
         VALUES (@id, @sessionId, @type, @path, @displayName, @mimeType, @width, @height, @contentHash, @createdAt)`
      )
      .run({
        ...input,
        displayName: input.displayName?.trim() || null,
        width: input.width ?? null,
        height: input.height ?? null,
        createdAt
      });

    return this.getAttachmentById(input.id)!;
  }

  public createCapture(input: {
    id: string;
    attachmentId: string;
    cropX: number;
    cropY: number;
    cropWidth: number;
    cropHeight: number;
    analysisStatus: string;
  }): CaptureRecord {
    const createdAt = nowIso();
    this.database
      .prepare(
        `INSERT INTO captures (id, attachment_id, crop_x, crop_y, crop_width, crop_height, analysis_status, created_at)
         VALUES (@id, @attachmentId, @cropX, @cropY, @cropWidth, @cropHeight, @analysisStatus, @createdAt)`
      )
      .run({ ...input, createdAt });

    return this.getCaptureById(input.id)!;
  }

  public updateCaptureAnalysisStatus(captureId: string, analysisStatus: string): void {
    this.database.prepare("UPDATE captures SET analysis_status = ? WHERE id = ?").run(analysisStatus, captureId);
  }

  public getAttachmentById(attachmentId: string): AttachmentRecord | null {
    const row = this.database.prepare("SELECT * FROM attachments WHERE id = ?").get(attachmentId) as Parameters<typeof mapAttachment>[0] | undefined;
    return row ? mapAttachment(row) : null;
  }

  public getCaptureById(captureId: string): CaptureRecord | null {
    const row = this.database.prepare("SELECT * FROM captures WHERE id = ?").get(captureId) as Parameters<typeof mapCapture>[0] | undefined;
    return row ? mapCapture(row) : null;
  }

  public getCaptureByAttachmentId(attachmentId: string): CaptureRecord | null {
    const row = this.database.prepare("SELECT * FROM captures WHERE attachment_id = ?").get(attachmentId) as Parameters<typeof mapCapture>[0] | undefined;
    return row ? mapCapture(row) : null;
  }

  public listByIds(attachmentIds: string[]): AttachmentRecord[] {
    if (attachmentIds.length === 0) {
      return [];
    }

    const placeholders = attachmentIds.map(() => "?").join(", ");
    const rows = this.database
      .prepare(`SELECT * FROM attachments WHERE id IN (${placeholders})`)
      .all(...attachmentIds) as Array<Parameters<typeof mapAttachment>[0]>;
    const order = new Map(attachmentIds.map((attachmentId, index) => [attachmentId, index]));
    return rows.map((row) => mapAttachment(row)).sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  }

  public findByHash(sessionId: string, contentHash: string): AttachmentRecord | null {
    const row = this.database
      .prepare("SELECT * FROM attachments WHERE session_id = ? AND content_hash = ?")
      .get(sessionId, contentHash) as Parameters<typeof mapAttachment>[0] | undefined;
    return row ? mapAttachment(row) : null;
  }
}