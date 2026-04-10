import type { CopilotClient } from "../copilot/CopilotClient.js";
import type { DatabaseAnswerBlock } from "../../types/domain.js";
import type { CriticResult } from "./CriticAgent.js";
import type { RetrievedContext } from "./ContextRetrieverAgent.js";
import type { GeneratedQuestion, SessionMode } from "../../types/domain.js";
import type { StructuredArgument } from "./ArgumentStructurerAgent.js";

export class ReportBuilderAgent {
  public constructor(private readonly copilotClient: CopilotClient) {}

  public async composeChatResponse(input: {
    mode: SessionMode;
    message: string;
    structured: StructuredArgument;
    criticResult: CriticResult;
    questions: GeneratedQuestion[];
    context: RetrievedContext;
    signal?: AbortSignal;
  }): Promise<string> {
    const fallbackSections = this.buildFallbackSections(input);
    const completion = await this.copilotClient.complete(
      {
        mode: input.mode,
        prompt: `User message: ${input.message}\nFindings: ${input.criticResult.findings.map((finding) => finding.detail).join(" | ")}`,
        context: input.context.messages.slice(-4).map((message) => `${message.role}: ${message.content}`),
        fallbackText: fallbackSections
      },
      input.signal
    );

    return completion.text;
  }

  public async composeDatabaseInterpretation(query: string, blocks: DatabaseAnswerBlock[], signal?: AbortSignal): Promise<string> {
    const fallbackText = [
      "Interpretation",
      `The stored records answer the query \"${query}\" directly.`,
      ...blocks.map((block) => `- ${block.title}: ${block.content.split(/\r?\n/, 1)[0] ?? ""}`)
    ].join("\n");
    const completion = await this.copilotClient.complete(
      {
        mode: "database",
        prompt: `Interpret the significance of these database blocks for the query: ${query}`,
        context: blocks.map((block) => `${block.title}: ${block.content}`),
        fallbackText
      },
      signal
    );

    return completion.text;
  }

  private buildFallbackSections(input: {
    mode: SessionMode;
    structured: StructuredArgument;
    criticResult: CriticResult;
    questions: GeneratedQuestion[];
  }): string {
    const lines = [input.mode === "critic" ? "Critic Response" : "Response"];
    if (input.criticResult.findings.length > 0) {
      lines.push("Pressure points:");
      lines.push(...input.criticResult.findings.map((finding) => `- ${finding.detail}`));
    } else {
      lines.push("The current turn does not add an obvious contradiction or definition drift.");
    }

    if (input.structured.claims.length > 0) {
      lines.push("Main claims:");
      lines.push(...input.structured.claims.slice(0, 3).map((claim) => `- ${claim.text}`));
    }

    if (input.questions.length > 0) {
      lines.push("Next questions:");
      lines.push(...input.questions.map((question) => `- ${question.questionText}`));
    }

    return lines.join("\n");
  }
}