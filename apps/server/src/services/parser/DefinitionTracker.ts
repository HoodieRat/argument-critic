import type { DefinitionRecord } from "../../types/domain.js";

export interface DefinitionDriftFlag {
  readonly term: string;
  readonly previousDefinition: string;
  readonly currentDefinition: string;
}

function normalizeDefinition(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export class DefinitionTracker {
  public detectDrift(
    currentDefinitions: Array<{ readonly term: string; readonly definitionText: string }>,
    storedDefinitions: DefinitionRecord[]
  ): DefinitionDriftFlag[] {
    const flags: DefinitionDriftFlag[] = [];

    for (const definition of currentDefinitions) {
      const prior = storedDefinitions.find(
        (candidate) => candidate.term.toLowerCase() === definition.term.toLowerCase()
      );

      if (!prior) {
        continue;
      }

      if (normalizeDefinition(prior.definitionText) !== normalizeDefinition(definition.definitionText)) {
        flags.push({
          term: definition.term,
          previousDefinition: prior.definitionText,
          currentDefinition: definition.definitionText
        });
      }
    }

    return flags;
  }
}