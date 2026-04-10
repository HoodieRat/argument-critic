import { SettingsRepository } from "../db/repositories/SettingsRepository.js";
import { GptResearcherImporter } from "../research/GptResearcherImporter.js";

export class ResearchAgent {
  public constructor(
    private readonly defaultResearchEnabled: boolean,
    private readonly settingsRepository: SettingsRepository,
    private readonly importer: GptResearcherImporter
  ) {}

  public import(sessionId: string, payload: string, provider: string, enabledForContext: boolean): { imported: boolean; runId?: string; findingsImported: number } {
    const setting = this.settingsRepository.get("research.enabled", this.defaultResearchEnabled);
    if (!setting) {
      return {
        imported: false,
        findingsImported: 0
      };
    }

    const result = this.importer.import(sessionId, payload, provider, enabledForContext);
    return {
      imported: true,
      runId: result.runId,
      findingsImported: result.findingsImported
    };
  }
}