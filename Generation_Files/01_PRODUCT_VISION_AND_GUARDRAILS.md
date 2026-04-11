# Product Vision and Guardrails

## Product Definition

This product is a local Copilot-powered argument companion delivered primarily through an Electron desktop shell with a local companion backend.

The Chrome extension path is legacy compatibility only. It must not be treated as the primary UX or the default release target.

It is not a generic assistant.
It is not a notes app.
It is not a graph toy.
It is not a research engine first.

It is an advisor-style system that:
- tracks the structure of the user's ideas
- pressure-tests reasoning
- asks targeted questions
- preserves unresolved lines of inquiry
- allows direct structured database interaction
- reduces repeated AI context and wasted calls

## Core User Promise

The system must help the user:
- deliberate on the structure of ideas
- surface hidden assumptions
- identify contradictions
- maintain continuity across sessions
- answer targeted questions or revisit them later
- move items into long-term memory deliberately
- get criticism without random hostility
- get normal chat when normal chat is appropriate

## Non-Negotiable Behaviors

The system must:
- ask targeted questions when reasoning is vague, under-supported, contradictory, incomplete, or definitionally unstable
- keep an Active Questions queue with the latest 5 unanswered AI questions
- allow direct reply to a queued question
- allow archiving a queued question into the database
- allow viewing all historical questions with status filtering
- retrieve before generating
- answer from the database directly when the answer is deterministic and already known
- distinguish AI, database, hybrid, and research-backed outputs in the UI
- preserve unresolved questions across sessions
- generate structured reports procedurally whenever possible
- provide one easy startup path for normal users
- launch and supervise all runtime components the project owns
- shut down all owned child processes on Ctrl+C, app exit, window close, or crash recovery
- avoid leaving orphaned consoles, shells, scripts, or managed Chrome instances

## Anti-Collapse Contract

The system fails the product vision if it does any of the following:
- agrees by default
- compliments as filler
- behaves like a generic helpful assistant
- avoids asking questions when question-asking is required
- forgets unresolved questions
- uses AI for deterministic report formatting
- hides whether a response came from AI or the database
- quietly omits the database speak mode
- silently mixes optional research into ordinary chat without user choice

## V1 Scope

Included:
- Electron desktop shell
- local companion service
- legacy extension build retained only as an optional compatibility path
- normal chat
- critic mode
- database mode
- last-5 active question queue
- full question history
- question-generation toggle and clear-all controls
- screenshot and crop input
- first-class chat attachments for crops and uploaded files
- imported log input
- local persistence
- direct database query mode
- procedural report generation
- optional GPT-Researcher import
- Windows installer and GitHub release packaging
- stable settings and migrations
- one-command startup
- lifecycle supervision and cleanup
- acceptance tests

Excluded from V1:
- visual graph canvases
- voice
- multi-user sync
- remote hosting
- automatic internet research during normal chat
- large plugin ecosystems
- broad semantic desktop search

## Design Principles

- Fewer moving parts
- Hard mode boundaries
- Strong persistence
- Explain why the system asked a question
- Keep the UI clean and readable
- Prefer exact stored data over fresh paraphrase
- Keep optional systems truly optional


## Runtime Guardrails

The project must not rely on users manually killing leftover processes. The generated implementation must include process supervision, shutdown coordination, and stale-process cleanup on next start. Any managed Chrome instance must use an app-owned profile and must be terminated if the launcher started it.
