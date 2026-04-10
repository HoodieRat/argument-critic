import type { HandoffPacket } from "./HandoffPacket.js";

const requiredArrayFields: Array<keyof HandoffPacket> = [
  "new_facts",
  "new_records_written",
  "records_updated",
  "records_read",
  "questions_asked_now",
  "active_question_queue_delta",
  "unresolved_items",
  "must_not_drift",
  "procedural_only_items",
  "ai_only_items"
];

export class HandoffValidator {
  public validate(packet: HandoffPacket): void {
    if (!packet.turn_id || !packet.session_id || !packet.mode || !packet.user_asked || !packet.next_required_agent) {
      throw new Error("Handoff packet is missing required scalar fields.");
    }

    for (const field of requiredArrayFields) {
      const value = packet[field];
      if (!Array.isArray(value)) {
        throw new Error(`Handoff packet field ${String(field)} must be an array.`);
      }
    }
  }
}