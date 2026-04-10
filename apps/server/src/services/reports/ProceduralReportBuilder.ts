import { randomUUID } from "node:crypto";

import type { ReportRecord } from "../../types/domain.js";
import { ContradictionsRepository } from "../db/repositories/ContradictionsRepository.js";
import { QuestionsRepository } from "../db/repositories/QuestionsRepository.js";
import { ReportsRepository } from "../db/repositories/ReportsRepository.js";
import { ResearchRepository } from "../db/repositories/ResearchRepository.js";
import { SessionsRepository } from "../db/repositories/SessionsRepository.js";
import { ReportTemplates } from "./ReportTemplates.js";

export class ProceduralReportBuilder {
  public constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly questionsRepository: QuestionsRepository,
    private readonly contradictionsRepository: ContradictionsRepository,
    private readonly reportsRepository: ReportsRepository,
    private readonly researchRepository: ResearchRepository,
    private readonly templates: ReportTemplates
  ) {}

  public generate(sessionId: string, reportType: string): ReportRecord {
    const session = this.sessionsRepository.getById(sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }

    const questions = this.questionsRepository.listHistory(sessionId);
    const contradictions = this.contradictionsRepository.listBySession(sessionId);
    const latestResearchRun = this.researchRepository.listRunsBySession(sessionId)[0] ?? null;
    const researchSummary = latestResearchRun
      ? this.researchRepository
          .listFindings(latestResearchRun.id)
          .map((finding) => `- ${finding.findingText} [${finding.category}]`)
          .join("\n")
      : undefined;

    const content = (() => {
      switch (reportType) {
        case "contradictions":
          return this.templates.buildContradictionReport({ session, questions, contradictions, researchSummary });
        case "research":
          return this.templates.buildResearchReport({ session, questions, contradictions, researchSummary });
        case "session_overview":
        default:
          return this.templates.buildSessionOverview({ session, questions, contradictions, researchSummary });
      }
    })();

    const title = `${session.title} - ${reportType.replace(/_/g, " ")}`;
    return this.reportsRepository.create({
      id: randomUUID(),
      sessionId,
      reportType,
      title,
      content
    });
  }
}