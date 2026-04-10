# Handoff Protocol

The purpose of this protocol is to prevent drift between internal stages.

## Handoff Rules

Every handoff must be:
- succinct
- structured
- factual
- delta-oriented
- explicit about unresolved items

## Required Packet Format

```text
HANDOFF_PACKET
turn_id:
session_id:
mode:
user_asked:
answered_so_far:
new_facts:
new_records_written:
records_updated:
records_read:
questions_asked_now:
active_question_queue_delta:
unresolved_items:
next_required_agent:
must_not_drift:
procedural_only_items:
ai_only_items:
```

## Field Meanings

- `user_asked`: the actual task in one or two sentences
- `answered_so_far`: what has already been answered
- `new_facts`: settled facts extracted this turn
- `new_records_written`: rows or artifacts created
- `records_updated`: rows changed in place
- `records_read`: major records consulted
- `questions_asked_now`: new user-facing testing questions generated this turn
- `active_question_queue_delta`: what entered, left, or changed in the queue
- `unresolved_items`: items still open
- `next_required_agent`: exact next role
- `must_not_drift`: the main facts/constraints that downstream agents must preserve
- `procedural_only_items`: items that must not be sent to AI
- `ai_only_items`: items that require AI interpretation

## Examples of must_not_drift
- current topic
- user-selected mode
- exact contradiction status
- question resolution status
- research disabled flag
- “user asked for direct DB answer”
- “do not overwrite prior answer”
- “queue must retain only latest 5 unanswered”

## Forbidden Handoff Behavior
- freeform narrative paragraphs
- dropping unresolved items
- reclassifying a resolved question as unresolved without evidence
- changing the user’s requested mode
- silently mixing research into ordinary chat
