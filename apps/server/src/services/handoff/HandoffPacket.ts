import type { SessionMode } from "../../types/domain.js";

export interface HandoffPacket {
  readonly turn_id: string;
  readonly session_id: string;
  readonly mode: SessionMode;
  readonly user_asked: string;
  readonly answered_so_far: string;
  readonly new_facts: string[];
  readonly new_records_written: string[];
  readonly records_updated: string[];
  readonly records_read: string[];
  readonly questions_asked_now: string[];
  readonly active_question_queue_delta: string[];
  readonly unresolved_items: string[];
  readonly next_required_agent: string;
  readonly must_not_drift: string[];
  readonly procedural_only_items: string[];
  readonly ai_only_items: string[];
}