import type { CriticFinding, GeneratedQuestion, QuestionRecord } from "../../types/domain.js";

function normalizeQuestion(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export class QuestioningAgent {
  public generate(findings: CriticFinding[], existingQuestions: QuestionRecord[]): GeneratedQuestion[] {
    const existing = new Set(existingQuestions.map((question) => normalizeQuestion(question.questionText)));
    const questions: GeneratedQuestion[] = [];

    for (const finding of findings) {
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

      const normalized = normalizeQuestion(candidate.questionText);
      if (!existing.has(normalized) && !questions.some((question) => normalizeQuestion(question.questionText) === normalized)) {
        questions.push(candidate);
      }

      if (questions.length === 3) {
        break;
      }
    }

    return questions;
  }
}