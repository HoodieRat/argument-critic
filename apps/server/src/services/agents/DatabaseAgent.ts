import type { DatabaseAnswerBlock, ResponseProvenance } from "../../types/domain.js";
import { ContradictionsRepository } from "../db/repositories/ContradictionsRepository.js";
import { QuestionsRepository } from "../db/repositories/QuestionsRepository.js";
import { ReportsRepository } from "../db/repositories/ReportsRepository.js";
import { SessionsRepository } from "../db/repositories/SessionsRepository.js";
import { ProceduralReportBuilder } from "../reports/ProceduralReportBuilder.js";
import { ReportBuilderAgent } from "./ReportBuilderAgent.js";

export interface DatabaseAgentResponse {
  readonly answer: string;
  readonly blocks: DatabaseAnswerBlock[];
  readonly provenance: ResponseProvenance;
}

export class DatabaseAgent {
  public constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly questionsRepository: QuestionsRepository,
    private readonly contradictionsRepository: ContradictionsRepository,
    private readonly reportsRepository: ReportsRepository,
    private readonly reportBuilder: ProceduralReportBuilder,
    private readonly responseBuilder: ReportBuilderAgent
  ) {}

  public async answer(sessionId: string, query: string, interpret = false, signal?: AbortSignal): Promise<DatabaseAgentResponse> {
    const normalized = query.toLowerCase();
    const blocks: DatabaseAnswerBlock[] = [];

    if (normalized.includes("unanswered") && normalized.includes("question")) {
      const questions = this.questionsRepository.listActive(sessionId, 50);
      blocks.push({
        title: "Unanswered Questions",
        content: questions.length === 0 ? "No unanswered questions." : questions.map((question) => `- ${question.questionText}`).join("\n")
      });
    } else if (normalized.includes("contradiction")) {
      const contradictions = this.contradictionsRepository.listBySession(sessionId);
      blocks.push({
        title: "Contradictions",
        content:
          contradictions.length === 0
            ? "No contradictions recorded."
            : contradictions.map((record) => `- ${record.explanation} [${record.status}]`).join("\n")
      });
    } else if (normalized.includes("report") || normalized.includes("summary")) {
      const report = this.reportBuilder.generate(sessionId, normalized.includes("contradiction") ? "contradictions" : "session_overview");
      blocks.push({ title: report.title, content: report.content });
    } else if (normalized.includes("session") && normalized.includes("count")) {
      blocks.push({ title: "Session Count", content: String(this.sessionsRepository.count()) });
    } else if (normalized.includes("saved report")) {
      const reports = this.reportsRepository.listBySession(sessionId);
      blocks.push({
        title: "Saved Reports",
        content: reports.length === 0 ? "No saved reports." : reports.map((report) => `- ${report.title}`).join("\n")
      });
    } else {
      const session = this.sessionsRepository.getById(sessionId);
      blocks.push({
        title: "Session Overview",
        content: session?.summary ?? "No stored summary is available for this session yet."
      });
    }

    const proceduralAnswer = blocks.map((block) => `${block.title}\n${block.content}`).join("\n\n");
    if (!interpret) {
      return {
        answer: proceduralAnswer,
        blocks,
        provenance: "database"
      };
    }

    const interpreted = await this.responseBuilder.composeDatabaseInterpretation(query, blocks, signal);
    return {
      answer: interpreted,
      blocks,
      provenance: "hybrid"
    };
  }
}