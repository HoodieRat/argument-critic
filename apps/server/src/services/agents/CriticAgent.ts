import {
  DEFAULT_CRITICALITY_MULTIPLIER,
  MAX_CRITICALITY_MULTIPLIER,
  MIN_CRITICALITY_MULTIPLIER,
  VAGUE_TERMS
} from "../../config/constants.js";
import type { ClaimRecord, CriticFinding } from "../../types/domain.js";
import { DefinitionTracker } from "../parser/DefinitionTracker.js";
import type { RetrievedContext } from "./ContextRetrieverAgent.js";
import type { StructuredArgument } from "./ArgumentStructurerAgent.js";

interface CritiqueOptions {
  readonly criticalityMultiplier?: number;
}

const ABSOLUTIST_LANGUAGE_PATTERN = /\b(always|never|everyone|nobody|all|none|impossible|inevitable)\b/i;
const CAUSAL_LANGUAGE_PATTERN = /\b(causes?|caused|leads? to|results? in|drives?)\b/i;
const NORMATIVE_LANGUAGE_PATTERN = /\b(should|must|need to|ought to|have to)\b/i;
const CONFIDENCE_LANGUAGE_PATTERN = /\b(obviously|clearly|definitely|certainly|undeniably|proves?)\b/i;

function clampCriticalityMultiplier(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CRITICALITY_MULTIPLIER;
  }

  return Math.min(MAX_CRITICALITY_MULTIPLIER, Math.max(MIN_CRITICALITY_MULTIPLIER, value));
}

export interface CriticResult {
  readonly findings: CriticFinding[];
  readonly contradictions: Array<{ claimAId: string; claimBId: string; explanation: string }>;
  readonly objections: Array<{ claimId: string; text: string; severity: string }>;
}

function normalizeClaim(text: string): string {
  return text
    .toLowerCase()
    .split(/\b(?:because|so|therefore|thus|however|but)\b/, 1)[0]!
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(do|does|did|is|are|was|were|be|been|being|the|a|an)\b/g, " ")
    .replace(/\b([a-z]{4,})s\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function hasNegation(text: string): boolean {
  return /\b(not|never|no|cannot|can't|won't|isn't|aren't|doesn't|don't|didn't)\b/i.test(text);
}

function stripNegation(text: string): string {
  return normalizeClaim(text).replace(/\b(not|never|no|cannot|can t|won t|isn t|aren t|doesn t|don t|didn t)\b/g, " ").replace(/\s+/g, " ").trim();
}

export class CriticAgent {
  public constructor(private readonly definitionTracker: DefinitionTracker) {}

  public critique(rawText: string, structured: StructuredArgument, context: RetrievedContext, options: CritiqueOptions = {}): CriticResult {
    const criticalityMultiplier = clampCriticalityMultiplier(options.criticalityMultiplier);
    const findings: CriticFinding[] = [];
    const contradictions: Array<{ claimAId: string; claimBId: string; explanation: string }> = [];
    const objections: Array<{ claimId: string; text: string; severity: string }> = [];

    const driftFlags = this.definitionTracker.detectDrift(structured.definitions, context.definitions);
    for (const flag of driftFlags) {
      findings.push({
        type: "definition_drift",
        detail: `The term \"${flag.term}\" is used differently from an earlier definition.`,
        evidence: [flag.previousDefinition, flag.currentDefinition]
      });
    }

    const vagueMatches = [...new Set(VAGUE_TERMS.filter((term) => rawText.toLowerCase().includes(term)))];
    const vagueFindingLimit = criticalityMultiplier < 0.55
      ? 0
      : criticalityMultiplier < DEFAULT_CRITICALITY_MULTIPLIER
        ? 1
        : criticalityMultiplier < 2
          ? Math.min(vagueMatches.length, 2)
          : vagueMatches.length;
    for (const term of vagueMatches.slice(0, vagueFindingLimit)) {
      findings.push({
        type: "ambiguity",
        detail: `The term \"${term}\" is doing argumentative work without a stable definition.`,
        evidence: [term]
      });
    }

    if (criticalityMultiplier >= 0.75 && /\b(therefore|thus|so)\b/i.test(rawText) && structured.claims.length < 2) {
      const claim = structured.claims[0];
      if (claim) {
        findings.push({
          type: "unsupported_premise",
          detail: "The conclusion is asserted without enough support in the same turn.",
          evidence: [claim.text]
        });
        objections.push({
          claimId: claim.id,
          text: "The conclusion arrives before the supporting steps are made explicit.",
          severity: criticalityMultiplier >= 2 ? "high" : "medium"
        });
      }
    }

    if (criticalityMultiplier >= 1.5 && ABSOLUTIST_LANGUAGE_PATTERN.test(rawText)) {
      findings.push({
        type: "unsupported_premise",
        detail: "The argument uses absolute language without showing why obvious exception cases are impossible.",
        evidence: [rawText]
      });
    }

    if (criticalityMultiplier >= 2 && CAUSAL_LANGUAGE_PATTERN.test(rawText)) {
      findings.push({
        type: "unsupported_premise",
        detail: "A causal claim is asserted without explaining the mechanism or ruling out alternatives.",
        evidence: [rawText]
      });
    }

    if (criticalityMultiplier >= 3 && NORMATIVE_LANGUAGE_PATTERN.test(rawText)) {
      findings.push({
        type: "unsupported_premise",
        detail: "The recommendation uses should-or-must language without a clear decision rule or threshold.",
        evidence: [rawText]
      });
    }

    if (criticalityMultiplier >= 4 && CONFIDENCE_LANGUAGE_PATTERN.test(rawText)) {
      findings.push({
        type: "ambiguity",
        detail: "Confidence-signaling language is standing in for proof.",
        evidence: [rawText]
      });
    }

    for (const newClaim of structured.claims) {
      const match = context.claims.find((storedClaim) => this.isContradictory(storedClaim, newClaim.text));
      if (match) {
        findings.push({
          type: "contradiction",
          detail: "This claim conflicts with a previously stored claim.",
          evidence: [match.text, newClaim.text]
        });
        contradictions.push({
          claimAId: newClaim.id,
          claimBId: match.id,
          explanation: `Stored claim \"${match.text}\" conflicts with new claim \"${newClaim.text}\".`
        });
      }
    }

    return { findings, contradictions, objections };
  }

  private isContradictory(storedClaim: ClaimRecord, incomingClaimText: string): boolean {
    const storedStripped = stripNegation(storedClaim.text);
    const incomingStripped = stripNegation(incomingClaimText);
    const sameCore =
      storedStripped.length > 0 &&
      (storedStripped === incomingStripped || storedStripped.includes(incomingStripped) || incomingStripped.includes(storedStripped));
    return sameCore && hasNegation(storedClaim.text) !== hasNegation(incomingClaimText);
  }
}