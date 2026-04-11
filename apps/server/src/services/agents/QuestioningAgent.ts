import type {
  ClaimRecord,
  ContradictionRecord,
  CriticFinding,
  DefinitionRecord,
  GeneratedQuestion,
  MessageRecord,
  QuestionRecord,
  SessionMode
} from "../../types/domain.js";

interface QuestionGenerationInput {
  readonly mode: SessionMode;
  readonly currentMessage: string;
  readonly findings: CriticFinding[];
  readonly existingQuestions: QuestionRecord[];
  readonly recentMessages: MessageRecord[];
  readonly claims: ClaimRecord[];
  readonly definitions: DefinitionRecord[];
  readonly contradictions: ContradictionRecord[];
  readonly criticalityMultiplier: number;
}

function normalizeQuestion(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function compactText(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.length > 96 ? `${normalized.slice(0, 93).trim()}...` : normalized;
}

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export class QuestioningAgent {
  public generate(input: QuestionGenerationInput): GeneratedQuestion[] {
    const existing = new Set(input.existingQuestions.map((question) => normalizeQuestion(question.questionText)));
    const questions: GeneratedQuestion[] = [];
    const questionLimit = input.criticalityMultiplier >= 4 ? 4 : input.criticalityMultiplier >= 1 ? 3 : input.criticalityMultiplier >= 0.5 ? 2 : 1;
    const pushUnique = (candidate: GeneratedQuestion | null): boolean => {
      if (!candidate) {
        return false;
      }

      const normalized = normalizeQuestion(candidate.questionText);
      if (existing.has(normalized) || questions.some((question) => normalizeQuestion(question.questionText) === normalized)) {
        return false;
      }

      questions.push(candidate);
      return true;
    };

    for (const finding of input.findings) {
      let candidate: GeneratedQuestion | null = null;
      const anchor = finding.evidence[0] ?? finding.detail;
      switch (finding.type) {
        case "contradiction":
          candidate = {
            questionText: `Which side of the contradiction around \"${anchor}\" do you still endorse, and why?`,
            whyAsked: "A stored contradiction is now active.",
            whatItTests: "Whether the contradiction is real or only apparent.",
            priority: 100
          };
          break;
        case "definition_drift":
          candidate = {
            questionText: `What exact definition are you using for \"${anchor}\" in this turn?`,
            whyAsked: "The same term has shifted meaning across turns.",
            whatItTests: "Whether the argument is stable under one definition.",
            priority: 90
          };
          break;
        case "ambiguity":
          candidate = {
            questionText: `What concrete criterion makes \"${anchor}\" true in this case?`,
            whyAsked: "A vague term is carrying important argumentative weight.",
            whatItTests: "Whether the claim can be evaluated against a stable standard.",
            priority: 80
          };
          break;
        case "unsupported_premise":
          candidate = {
            questionText: `What evidence or mechanism links your premises to \"${anchor}\"?`,
            whyAsked: "The conclusion appears before its support is explicit.",
            whatItTests: "Whether the reasoning chain can survive scrutiny.",
            priority: 85
          };
          break;
      }

      if (!candidate) {
        continue;
      }

      pushUnique(candidate);

      if (questions.length >= questionLimit) {
        break;
      }
    }

    if (questions.length === 0) {
      pushUnique(this.buildRecentFallback(input));
    }

    if (questions.length === 0) {
      for (const candidate of this.buildStoredFallbacks(input)) {
        if (pushUnique(candidate)) {
          break;
        }
      }
    }

    if (questions.length === 0) {
      for (const candidate of this.buildRandomFallbacks(input)) {
        if (pushUnique(candidate)) {
          break;
        }
      }
    }

    return questions;
  }

  private buildRecentFallback(input: QuestionGenerationInput): GeneratedQuestion | null {
    const latestContext = [...input.recentMessages].reverse().find((message) => message.role === "user")?.content ?? "";
    const anchor = compactText(input.currentMessage || latestContext, "this line of reasoning");

    if (!anchor) {
      return null;
    }

    switch (input.mode) {
      case "critic":
        return {
          questionText: `What is the weakest assumption behind \"${anchor}\"?`,
          whyAsked: "Every turn in Critic should leave one concrete thing to challenge next.",
          whatItTests: "Whether the claim still holds once its weakest assumption is named.",
          priority: 70
        };
      case "research_import":
        return {
          questionText: `What part of \"${anchor}\" still needs to be verified before you trust it?`,
          whyAsked: "Reviewer should always leave one verification question on the board.",
          whatItTests: "Whether the imported material is ready to rely on or still needs proof.",
          priority: 70
        };
      default:
        return {
          questionText: `What assumption behind \"${anchor}\" should you test next?`,
          whyAsked: "Each turn should end with a next-step question tied to the most recent point.",
          whatItTests: "Whether the latest idea has an explicit next check instead of stopping at assertion.",
          priority: 65
        };
    }
  }

  private buildStoredFallbacks(input: QuestionGenerationInput): GeneratedQuestion[] {
    const contradiction = input.contradictions[0];
    if (contradiction) {
      return [{
        questionText: `What would resolve the stored contradiction: \"${compactText(contradiction.explanation, "this contradiction")}\"?`,
        whyAsked: "No fresh question surfaced, so the next best move is to reopen an existing contradiction.",
        whatItTests: "Whether the stored contradiction can be resolved with a concrete standard or evidence.",
        priority: 60
      }];
    }

    const claim = input.claims[0];
    if (claim) {
      return [{
        questionText: `What evidence would make \"${compactText(claim.text, "this claim")}\" more convincing?`,
        whyAsked: "No fresh question surfaced, so the fallback is to test the strongest stored claim.",
        whatItTests: "Whether the current position is grounded in evidence rather than wording alone.",
        priority: 55
      }];
    }

    const definition = input.definitions[0];
    if (definition) {
      return [{
        questionText: `What exact boundary are you using for \"${compactText(definition.term, "this term")}\"?`,
        whyAsked: "No fresh question surfaced, so the fallback is to pin down a stored definition.",
        whatItTests: "Whether later reasoning depends on a term that still lacks a stable boundary.",
        priority: 50
      }];
    }

    return [];
  }

  private buildRandomFallbacks(input: QuestionGenerationInput): GeneratedQuestion[] {
    const anchor = compactText(input.currentMessage, "this topic");
    const variants: Record<SessionMode, GeneratedQuestion[]> = {
      normal_chat: [
        {
          questionText: `What result would prove \"${anchor}\" is actually working?`,
          whyAsked: "No stronger follow-up was available, so the fallback is a concrete success test.",
          whatItTests: "Whether the idea has an observable standard for success.",
          priority: 40
        },
        {
          questionText: `What evidence would change your mind about \"${anchor}\"?`,
          whyAsked: "No stronger follow-up was available, so the fallback is a falsifiability check.",
          whatItTests: "Whether the position can be revised by evidence.",
          priority: 40
        }
      ],
      critic: [
        {
          questionText: `What is the strongest counterexample to \"${anchor}\"?`,
          whyAsked: "No sharper critic-specific issue surfaced, so the fallback is a counterexample test.",
          whatItTests: "Whether the claim survives a concrete challenge case.",
          priority: 40
        },
        {
          questionText: `What hidden assumption would break \"${anchor}\" if it failed?`,
          whyAsked: "No sharper critic-specific issue surfaced, so the fallback is an assumption test.",
          whatItTests: "Whether the claim depends on an unstated premise.",
          priority: 40
        }
      ],
      database: [
        {
          questionText: `What stored fact should you verify next about \"${anchor}\"?`,
          whyAsked: "No better retrieval-based question was available, so the fallback is a verification step.",
          whatItTests: "Whether another stored fact is needed before deciding.",
          priority: 40
        }
      ],
      report: [
        {
          questionText: `What is still missing before \"${anchor}\" can be written up confidently?`,
          whyAsked: "No clearer reporting question was available, so the fallback is a completeness check.",
          whatItTests: "Whether the report would still rest on gaps or assumptions.",
          priority: 40
        }
      ],
      research_import: [
        {
          questionText: `What would you need to verify next before relying on \"${anchor}\"?`,
          whyAsked: "No better reviewer question was available, so the fallback is a verification step.",
          whatItTests: "Whether the imported material is trustworthy enough to use.",
          priority: 40
        },
        {
          questionText: `What does the imported material around \"${anchor}\" still fail to prove?`,
          whyAsked: "No better reviewer question was available, so the fallback is a gap check.",
          whatItTests: "Whether the material answers the key question or only sounds persuasive.",
          priority: 40
        }
      ],
      attachment_analysis: [
        {
          questionText: `What part of \"${anchor}\" on screen needs closer inspection?`,
          whyAsked: "No clearer visual-analysis question was available, so the fallback is an inspection step.",
          whatItTests: "Whether the visual evidence supports the intended reading.",
          priority: 40
        }
      ]
    };

    const candidates = variants[input.mode] ?? variants.normal_chat;
    if (candidates.length <= 1) {
      return candidates;
    }

    const startIndex = hashText(input.currentMessage) % candidates.length;
    return candidates.slice(startIndex).concat(candidates.slice(0, startIndex));
  }
}