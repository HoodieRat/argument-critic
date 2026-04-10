# State Model

## Extension State

The side panel uses a Zustand store in `apps/extension/src/sidepanel/state/store.ts`.

Primary state buckets:

- runtime status and runtime settings
- session list and current session
- current mode
- chronological messages for the selected session
- active question queue and full question history
- database query result
- saved reports and the selected report
- latest capture submission result
- imported research run summaries
- current auxiliary panel selection
- busy/error UI flags

## Queue Semantics

- the active queue is derived from the latest five `unanswered` questions ordered by priority and recency
- answering, archiving, or resolving a question removes it from the active queue
- reopening a historical question returns it to `unanswered`, which may place it back in the visible top five
- history retains every question regardless of whether it is currently visible in the queue

## Session State

Each session carries:

- a title and mode
- an optional topic
- a summary used for future retrieval
- ordered messages
- claims, contradictions, definitions, assumptions, and objections
- question history and reports
- attachments, captures, and research links

## Provenance State

Every assistant answer is tagged with one of:

- `database`
- `ai`
- `hybrid`
- `research`

The UI surfaces those provenance labels directly instead of hiding which subsystem produced the answer.

## Runtime State

Runtime lifecycle state is stored outside the main domain tables under `data/runtime`:

- `process-registry.json` for app-owned child process tracking
- `managed-chrome-profile` for the app-owned browser profile when launch is enabled

These artifacts are used strictly for app-owned process cleanup and next-start recovery.