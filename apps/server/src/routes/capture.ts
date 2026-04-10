import type { FastifyInstance } from "fastify";

import type { AppServices } from "../app.js";
import type { CaptureSubmitRequest } from "../types/api.js";

export async function registerCaptureRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.post("/capture/submit", async (request) => {
    const body = request.body as CaptureSubmitRequest;
    const stored = await services.attachmentStore.store({
      sessionId: body.sessionId,
      dataUrl: body.dataUrl,
      mimeType: body.mimeType,
      crop: body.crop
    });
    const analysis = body.analyze ? services.imageAnalysisService.analyze(body.sessionId, stored.attachment.id, stored.capture?.id) : null;

    return {
      attachment: stored.attachment,
      capture: stored.capture,
      analysis
    };
  });
}