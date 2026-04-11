import type { CopilotClient } from "../copilot/CopilotClient.js";
import type { CopilotCompletionRequest } from "../copilot/CopilotClient.js";
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
    attachmentContext?: string[];
    imageAttachments?: CopilotCompletionRequest["imageAttachments"];
    handoffPrompt?: string | null;
    sessionPreferences: {
      readonly criticalityMultiplier: number;
      readonly structuredOutputEnabled: boolean;
    };
    signal?: AbortSignal;
  }): Promise<string> {
    const fallbackSections = this.buildFallbackSections(input);
    const completion = await this.copilotClient.complete(
      {
        mode: input.mode,
        prompt: [
          `User message: ${input.message}`,
          `Criticality: ${input.sessionPreferences.criticalityMultiplier}x relative to the default critic profile.`,
          `Highly structured output: ${input.sessionPreferences.structuredOutputEnabled ? "enabled" : "disabled"}.`,
          `Findings: ${input.criticResult.findings.map((finding) => finding.detail).join(" | ")}`
        ].join("\n"),
        context: input.context.messages.slice(-8).map((message) => `${message.role}: ${message.content}`),
        attachmentContext: input.attachmentContext,
        imageAttachments: input.imageAttachments,
        handoffPrompt: input.handoffPrompt ?? undefined,
        criticalityMultiplier: input.sessionPreferences.criticalityMultiplier,
        structuredOutputEnabled: input.sessionPreferences.structuredOutputEnabled,
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
    attachmentContext?: string[];
    sessionPreferences: {
      readonly criticalityMultiplier: number;
      readonly structuredOutputEnabled: boolean;
    };
  }): string {
    if (!input.sessionPreferences.structuredOutputEnabled) {
      const sections: string[] = [];

      if (input.attachmentContext && input.attachmentContext.length > 0) {
        sections.push(`Attached material: ${input.attachmentContext.join(" ")}`);
      }

      if (input.criticResult.findings.length > 0) {
        sections.push(`Main pressure points: ${input.criticResult.findings.map((finding) => finding.detail).join(" ")}`);
      } else {
        sections.push("The current turn does not add an obvious contradiction or definition drift.");
      }

      if (input.structured.claims.length > 0) {
        sections.push(`Main claims: ${input.structured.claims.slice(0, 3).map((claim) => claim.text).join("; ")}`);
      }

      if (input.questions.length > 0) {
        sections.push(`Next question${input.questions.length === 1 ? "" : "s"}: ${input.questions.map((question) => question.questionText).join(" ")}`);
      }

      return sections.join("\n\n");
    }

    const lines = [input.mode === "critic" ? "Critic Response" : "Response"];
    if (input.attachmentContext && input.attachmentContext.length > 0) {
      lines.push("Attached material:");
      lines.push(...input.attachmentContext.map((attachmentSummary) => `- ${attachmentSummary}`));
    }

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