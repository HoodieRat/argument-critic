import { randomUUID } from "node:crypto";

import { ResearchRepository } from "../db/repositories/ResearchRepository.js";
import { ResearchNormalizer } from "./ResearchNormalizer.js";

export class GptResearcherImporter {
  public constructor(
    private readonly researchRepository: ResearchRepository,
    private readonly normalizer: ResearchNormalizer
  ) {}

  public import(sessionId: string, payload: string, provider: string, enabledForContext: boolean): { runId: string; findingsImported: number } {
    const run = this.researchRepository.createRun({
      id: randomUUID(),
      sessionId,
      provider,
      importMode: "manual_import",
      enabledForContext
    });
    const normalized = this.normalizer.normalize(payload);

    this.researchRepository.createSources(
      normalized.sources.map((source) => ({
        id: randomUUID(),
        researchRunId: run.id,
        ...source
      }))
    );
    this.researchRepository.createFindings(
      normalized.findings.map((finding) => ({
        id: randomUUID(),
        researchRunId: run.id,
        ...finding
      }))
    );

    return { runId: run.id, findingsImported: normalized.findings.length };
  }
}