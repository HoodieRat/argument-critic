# AGENTS.md

This project uses bounded internal roles. The user sees one assistant. Internally, the system routes work through narrowly scoped roles.

## Global Agent Rules

All agents must:
- read the incoming handoff packet
- update only their assigned domain
- avoid rewriting already settled facts
- avoid inventing missing state
- record what changed
- record what remains unresolved
- record what must not drift
- stop after their job is complete

## Agent List

### 1. Turn Router
Purpose:
- classify the turn

Inputs:
- raw user input
- current mode
- current session summary
- recent unresolved questions

Outputs:
- route decision
- required downstream agents
- urgency and priority

Must decide between:
- normal_chat
- critic
- database
- report
- research_import
- attachment_analysis

### 2. Context Retriever
Purpose:
- fetch only the minimum relevant stored context

Inputs:
- route decision
- current topic
- session ID
- recent claims
- open questions
- contradictions

Outputs:
- concise context pack
- ranked relevant records
- excluded context list

### 3. Argument Structurer
Purpose:
- extract structure from messy text

Inputs:
- raw text or imported log
- relevant context pack

Outputs:
- claims
- claim links
- definitions
- assumptions
- objections candidates
- unresolved questions candidates

### 4. Critic Agent
Purpose:
- pressure-test the reasoning

Inputs:
- structured argument
- prior contradictions
- prior unresolved questions
- relevant definitions

Outputs:
- weaknesses
- objection candidates
- counterexample candidates
- ambiguity notes
- targeted question requests

### 5. Questioning Agent
Purpose:
- ask the best next questions

Inputs:
- weaknesses
- missing support
- contradictions
- ambiguity signals
- prior unanswered questions

Outputs:
- 1 to 3 high-value questions
- reason each question was asked
- what each question tests
- queue action suggestions

Rules:
- never flood the user
- avoid duplicates
- prefer precision over volume
- persist unanswered questions

### 6. Database Agent
Purpose:
- answer direct DB questions and build deterministic outputs

Inputs:
- parsed DB query
- repositories
- report templates

Outputs:
- procedural answer
- exact lists
- counts
- filtered records
- retrieval provenance

Rules:
- do not call AI for exact stored answers
- call AI only when the user asks for interpretation or synthesis

### 7. Research Agent
Purpose:
- import or normalize GPT-Researcher data when enabled

Inputs:
- research files or configured path
- research settings
- current topic mapping

Outputs:
- normalized findings
- linked sources
- linked claims and objections
- procedural research summary

Rules:
- never run unless enabled
- never contaminate ordinary chat unless selected

### 8. Report Builder
Purpose:
- build polished user-facing outputs

Inputs:
- procedural data blocks
- optional AI commentary
- UI formatting rules

Outputs:
- final response blocks
- saved report artifacts

Rules:
- preserve provenance labels
- keep deterministic sections deterministic

### 9. Session Persistence Agent
Purpose:
- commit stable state changes

Inputs:
- delta packet from prior agents

Outputs:
- committed DB changes
- updated session summary
- queue updates
- audit log row

Rules:
- commit atomically
- do not lose unresolved questions
- do not silently drop attachments or question states

## Required Agent Sequence

Default path:
1. Turn Router
2. Context Retriever
3. one or more domain agents
4. Report Builder
5. Session Persistence Agent

## Drift Prevention

Every handoff must include:
- what the user asked
- what was answered
- what changed
- what remains unresolved
- what question must be asked next, if any
- what must not drift
