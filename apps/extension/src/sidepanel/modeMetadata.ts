import type { SessionMode } from "./types";

export interface ModeMetadata {
  readonly label: string;
  readonly channelTitle: string;
  readonly summary: string;
  readonly prompt: string;
  readonly emptyState: string;
}

export const MODE_METADATA: Record<SessionMode, ModeMetadata> = {
  normal_chat: {
    label: "Chat",
    channelTitle: "Build the case",
    summary: "Use Chat to explore ideas, clarify the claim, and decide what you actually mean before you stress-test it.",
    prompt: "Lay out the idea, decision, or claim you want to work through.",
    emptyState: "This Chat lane is empty. Start with the idea you want to develop before you send it to Critic."
  },
  critic: {
    label: "Critic",
    channelTitle: "Break the case",
    summary: "Use Critic to pressure-test the imported or pasted argument. It should hunt for weak assumptions, contradictions, and missing proof.",
    prompt: "Paste or import the argument you want challenged.",
    emptyState: "This Critic lane is empty. Import a Chat thread here or paste a claim that should be challenged directly."
  },
  database: {
    label: "Database",
    channelTitle: "Database lookup",
    summary: "Use this for exact retrieval from saved sessions, reports, questions, contradictions, and captures.",
    prompt: "Ask for an exact stored fact, report, or contradiction.",
    emptyState: "No database query has been asked yet. Ask for exact stored records or procedural summaries."
  },
  report: {
    label: "Reports",
    channelTitle: "Report planning",
    summary: "Use this when you want a structured summary built from the persisted record rather than open-ended chat.",
    prompt: "Describe the report you want generated.",
    emptyState: "No report request yet. Ask for a structured report or generate one from the reports panel."
  },
  attachment_analysis: {
    label: "Capture",
    channelTitle: "Capture analysis",
    summary: "Use this after a screenshot or crop is captured so the app can inspect the visual evidence directly.",
    prompt: "Describe what to inspect in the current capture.",
    emptyState: "No capture discussion yet. Take a screenshot or crop region, then ask what should be examined."
  },
  research_import: {
    label: "Reviewer",
    channelTitle: "Review the evidence",
    summary: "Use Reviewer after importing outside material so evidence review stays separate from ordinary conversation and weak support gets called out clearly.",
    prompt: "Import material first, then ask what it supports, what it misses, and what still needs checking.",
    emptyState: "This Reviewer lane is empty. Import a thread or outside research here, then review what it actually proves."
  }
};