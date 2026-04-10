import { createHash } from "node:crypto";

export interface NormalizedResearch {
  readonly sources: Array<{ title: string; url: string; snippet: string; sourceHash: string }>;
  readonly findings: Array<{ findingText: string; category: string }>;
}

function hashSource(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export class ResearchNormalizer {
  public normalize(payload: string): NormalizedResearch {
    try {
      const parsed = JSON.parse(payload) as {
        sources?: Array<{ title?: string; url?: string; snippet?: string }>;
        findings?: Array<{ text?: string; category?: string }>;
      };

      return {
        sources: (parsed.sources ?? []).map((source) => ({
          title: source.title ?? "Untitled source",
          url: source.url ?? "local://gpt-researcher",
          snippet: source.snippet ?? "",
          sourceHash: hashSource(`${source.title ?? ""}|${source.url ?? ""}|${source.snippet ?? ""}`)
        })),
        findings: (parsed.findings ?? []).map((finding) => ({
          findingText: finding.text ?? "",
          category: finding.category ?? "general"
        }))
      };
    } catch {
      const lines = payload.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const findings = lines.filter((line) => line.startsWith("- ")).map((line) => ({
        findingText: line.slice(2),
        category: "bullet"
      }));

      return {
        sources: [],
        findings
      };
    }
  }
}