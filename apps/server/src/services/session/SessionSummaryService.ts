import type { MessageRecord, QuestionRecord } from "../../types/domain.js";

export class SessionSummaryService {
  public buildSummary(messages: MessageRecord[], questions: QuestionRecord[]): string {
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "No assistant answer yet.";
    const openQuestionSummary = questions.length > 0 ? `${questions.length} unresolved question(s).` : "No unresolved questions.";
    return `${latestAssistant.slice(0, 220)} ${openQuestionSummary}`.trim();
  }
}