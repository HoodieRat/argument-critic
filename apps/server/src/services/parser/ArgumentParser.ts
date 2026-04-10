import type { ParsedArgument } from "../../types/domain.js";

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function detectDefinitions(text: string): Array<{ term: string; definitionText: string }> {
  const definitions: Array<{ term: string; definitionText: string }> = [];
  const patterns = [
    /\b([A-Za-z][A-Za-z0-9_-]{1,40})\s+means\s+(.+)/i,
    /\bby\s+([A-Za-z][A-Za-z0-9_-]{1,40})\s*,?\s*i\s+mean\s+(.+)/i,
    /\b([A-Za-z][A-Za-z0-9_-]{1,40})\s+is\s+defined\s+as\s+(.+)/i
  ];

  for (const sentence of splitSentences(text)) {
    for (const pattern of patterns) {
      const match = sentence.match(pattern);
      if (match) {
        definitions.push({
          term: match[1]!.trim(),
          definitionText: match[2]!.trim().replace(/[.?!]+$/, "")
        });
        break;
      }
    }
  }

  return definitions;
}

function detectAssumptions(text: string): Array<{ text: string }> {
  const patterns = ["assume", "assuming", "obviously", "clearly", "of course"];
  return splitSentences(text)
    .filter((sentence) => patterns.some((pattern) => sentence.toLowerCase().includes(pattern)))
    .map((sentence) => ({ text: sentence }));
}

function detectClaimType(sentence: string): string {
  const normalized = sentence.toLowerCase();
  if (normalized.includes("therefore") || normalized.includes("thus") || normalized.includes("so ")) {
    return "conclusion";
  }

  if (normalized.includes("because") || normalized.includes("since")) {
    return "support";
  }

  return "statement";
}

export class ArgumentParser {
  public parse(rawText: string): ParsedArgument {
    const claims = splitSentences(rawText)
      .filter((sentence) => !sentence.endsWith("?"))
      .map((sentence) => ({
        text: sentence,
        claimType: detectClaimType(sentence),
        confidence: sentence.length > 120 ? 0.72 : 0.84
      }));

    return {
      claims,
      definitions: detectDefinitions(rawText),
      assumptions: detectAssumptions(rawText)
    };
  }
}