import type { ContradictionRecord, QuestionRecord, SessionRecord } from "../../types/domain.js";

export interface ReportTemplateInput {
  readonly session: SessionRecord;
  readonly questions: QuestionRecord[];
  readonly contradictions: ContradictionRecord[];
  readonly researchSummary?: string;
}

export class ReportTemplates {
  public buildSessionOverview(input: ReportTemplateInput): string {
    return [
      `# ${input.session.title}`,
      `Mode: ${input.session.mode}`,
      `Topic: ${input.session.topic ?? "unspecified"}`,
      `Summary: ${input.session.summary ?? "No summary yet."}`,
      "",
      "## Active Questions",
      ...(input.questions.length === 0
        ? ["- None"]
        : input.questions.map((question) => `- ${question.questionText} [${question.status}]`)),
      "",
      "## Contradictions",
      ...(input.contradictions.length === 0
        ? ["- None"]
        : input.contradictions.map((record) => `- ${record.explanation} [${record.status}]`))
    ].join("\n");
  }

  public buildContradictionReport(input: ReportTemplateInput): string {
    return [
      `# Contradiction Report for ${input.session.title}`,
      ...(input.contradictions.length === 0
        ? ["No contradictions are currently stored."]
        : input.contradictions.map((record) => `- ${record.explanation} (${record.status})`))
    ].join("\n");
  }

  public buildResearchReport(input: ReportTemplateInput): string {
    return [
      `# Research Summary for ${input.session.title}`,
      input.researchSummary ?? "No research findings are linked to this session."
    ].join("\n");
  }
}