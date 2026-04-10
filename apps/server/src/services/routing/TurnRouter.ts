import type { SessionMode } from "../../types/domain.js";

export class TurnRouter {
  public route(mode: SessionMode, message: string): string {
    if (mode === "critic") {
      return "critic";
    }

    if (mode === "database") {
      return "database";
    }

    if (mode === "report") {
      return "report";
    }

    if (mode === "research_import") {
      return "research_import";
    }

    if (mode === "attachment_analysis") {
      return "attachment_analysis";
    }

    const normalized = message.toLowerCase();
    if (/\b(list|show|count|which|what are)\b/.test(normalized) && /\bquestions|contradictions|sessions|reports\b/.test(normalized)) {
      return "database";
    }

    return "normal_chat";
  }
}