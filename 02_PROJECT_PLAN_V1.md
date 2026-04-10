# Project Plan V1

## Architecture Summary

The project is a two-part local system:

1. Chrome Extension
   - Side panel UI
   - Screenshot capture
   - Crop workflow
   - Local HTTP communication with the companion service
   - Session and queue presentation

2. Local Companion Service
   - Copilot integration
   - session registry
   - routing and orchestration
   - SQLite persistence
   - procedural report generation
   - optional GPT-Researcher import
   - database query mode
   - attachment analysis pipeline
   - runtime shutdown hooks
   - orphan-process cleanup support

3. Runtime Launcher and Supervisor
   - one-command startup for end users
   - process tracking for every spawned child
   - dedicated managed Chrome launch path for unpacked extension use
   - graceful shutdown on Ctrl+C, UI exit, and normal process termination
   - stale PID/process cleanup on next launch after a crash

## Main Operating Modes

### Normal Chat Mode
Use for ordinary conversation.
Behavior:
- retrieve relevant context
- answer naturally
- store useful outputs
- ask targeted questions only when helpful

### Critic Mode
Use when the user wants pressure-testing.
Behavior:
- extract structure
- identify claims and assumptions
- surface contradictions
- ask targeted questions
- generate objections and counterexamples
- avoid empty reassurance

### Database Mode
Use when the user is speaking to the database directly.
Behavior:
- answer procedurally first
- use AI only when interpretation is required
- expose stored contradictions, questions, claims, reports, sessions, and research artifacts

### Report Mode
Use for procedural output of stored state.
Behavior:
- build structured reports from stored records
- use AI only for optional commentary blocks

### Research Mode
Optional.
Behavior:
- import GPT-Researcher results only when enabled
- normalize findings
- keep research out of ordinary context unless selected

## UI Areas

- Chat area
- Active Questions queue
- Session summary
- Database mode panel
- Reports panel
- Capture controls
- Settings panel

## Major Data Flows

### User text flow
Input -> Route -> Retrieve -> Structure if needed -> Critique if needed -> Question if needed -> Compose -> Persist

### Screenshot flow
Capture -> Crop -> Attach -> Analyze if requested -> Persist -> Link to session/question

### Database query flow
Parse query -> Determine deterministic path -> Run DB retrieval -> Format procedural answer -> Optional AI interpretation -> Persist answer artifact

### Research import flow
User enables -> Import run -> Normalize findings -> Link to topic/session -> Generate procedural report -> Persist

## Stability Requirements

- Single active turn per session
- stop/cancel support
- safe queueing of follow-up input
- restart-safe persistence
- migration-safe schema evolution
- no hidden background AI loops
- no automatic research unless enabled
- no UI action that points to a stub


## Runtime Lifecycle Plan

### One-command startup
The finished project must provide a simple root start command that installs or verifies prerequisites, starts the local server, launches a managed Chrome window/profile with the unpacked extension loaded when applicable, and reports readiness clearly.

### Process ownership
Any process started by the project must be registered with a process supervisor. The supervisor must track PID, command, start time, intended role, and whether the process is safe to terminate automatically.

### Shutdown paths
The implementation must support all of these cleanly:
- Ctrl+C from the launcher terminal
- in-app shutdown command
- normal server exit
- extension-triggered local shutdown route
- stale cleanup on next run after a crash

### Cleanup rules
- kill the entire owned child process tree, not just parent PIDs
- prefer graceful termination first, then escalate if needed
- hide spawned console windows where possible on Windows
- never leave managed child shells or helper scripts behind
- if a managed Chrome profile was created for the app, close that managed Chrome process tree on exit

### Scope rule
Only terminate processes the app itself launched and owns. Never kill unrelated user Chrome windows or unrelated shells.
