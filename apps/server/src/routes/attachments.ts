import { readFile } from "node:fs/promises";

import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance } from "fastify";

import type { AppServices } from "../app.js";
import type { AttachmentUploadResponse } from "../types/api.js";

function sanitizeDisplayName(displayName: string | null): string {
  return (displayName ?? "attachment").replace(/["\r\n]+/g, " ").trim() || "attachment";
}

export async function registerAttachmentsRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.post("/attachments/upload", async (request, reply): Promise<AttachmentUploadResponse | { error: string }> => {
    const query = request.query as { sessionId?: string };
    const sessionId = query.sessionId?.trim() ?? "";
    if (!sessionId) {
      reply.code(400);
      return { error: "A sessionId query parameter is required." };
    }

    const file = await (request as typeof request & {
      file: () => Promise<MultipartFile | undefined>;
    }).file();
    if (!file) {
      reply.code(400);
      return { error: "A file upload is required." };
    }

    const attachment = await services.attachmentStore.storeUpload({
      sessionId,
      bytes: await file.toBuffer(),
      mimeType: file.mimetype || "application/octet-stream",
      fileName: file.filename || "Attachment file"
    });

    return { attachment: attachment.attachment };
  });

  app.get("/attachments/:attachmentId/content", async (request, reply) => {
    const params = request.params as { attachmentId: string };
    const attachment = services.attachmentsRepository.getAttachmentById(params.attachmentId);
    if (!attachment) {
      reply.code(404);
      return { error: "Attachment not found." };
    }

    try {
      const bytes = await readFile(attachment.path);
      reply.type(attachment.mimeType || "application/octet-stream");
      reply.header("Content-Disposition", `inline; filename="${sanitizeDisplayName(attachment.displayName)}"`);
      return reply.send(bytes);
    } catch {
      reply.code(404);
      return { error: "Attachment content is unavailable." };
    }
  });
}