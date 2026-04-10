import { randomUUID } from "node:crypto";

import type { ParsedArgument } from "../../types/domain.js";
import { ArgumentParser } from "../parser/ArgumentParser.js";

export interface StructuredArgument extends ParsedArgument {
  readonly claims: Array<{ id: string; text: string; claimType: string; confidence: number }>;
  readonly definitions: Array<{ id: string; term: string; definitionText: string }>;
  readonly assumptions: Array<{ id: string; text: string }>;
}

export class ArgumentStructurerAgent {
  public constructor(private readonly parser: ArgumentParser) {}

  public structure(rawText: string): StructuredArgument {
    const parsed = this.parser.parse(rawText);
    return {
      claims: parsed.claims.map((claim) => ({ id: randomUUID(), ...claim })),
      definitions: parsed.definitions.map((definition) => ({ id: randomUUID(), ...definition })),
      assumptions: parsed.assumptions.map((assumption) => ({ id: randomUUID(), ...assumption }))
    };
  }
}