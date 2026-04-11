# Acceptance Tests

The project is not complete unless these tests pass.

## Anti-Collapse Tests

1. Given a weak or under-supported argument, the system must ask at least one targeted testing question instead of merely affirming.
2. Given a vague term, the system must ask a clarification question or flag definition drift.
3. Given prior contradictory stored claims, the system must surface the contradiction rather than ignore it.
4. The system must not present itself as a generic cheerful helper when critic mode is active.

## Queue Tests

1. The Active Questions panel must show the latest 5 unanswered AI questions.
2. Answering a queued question must persist the answer and update the question status.
3. Archiving a queued question must remove it from the active queue and preserve it in history.
4. Full history must retain all questions with status and timestamps.
5. Resolved questions must not re-enter the active queue unless explicitly reopened.
6. Clearing all active questions must empty the active queue without deleting history.
7. Turning question generation off must stop new AI questions from being added until the setting is turned back on.

## Database Mode Tests

1. A request for exact stored unanswered questions must be served without unnecessary AI interpretation.
2. A request for contradiction lists must return deterministic DB-backed output.
3. A request for a structured session report must generate a procedural report.
4. Provenance labels must indicate database, AI, hybrid, or research.

## Session Stability Tests

1. Sessions must survive application restart.
2. Unresolved questions must persist across restarts.
3. A cancelled response must not corrupt session state.
4. Rapid consecutive turns must queue safely instead of interleaving state.

## Capture Tests

1. A screenshot can be captured and sent.
2. A crop region can be selected and attached.
3. Attachment metadata is saved.
4. The same image is not reprocessed unnecessarily if already analyzed.
5. Captures and uploaded files must appear as visible attachments in the composer and in sent message history.

## Windows Release Tests

1. A normal Windows user can install the app from `Argument-Critic-Setup.exe` without Node.js, pnpm, or a source checkout.
2. The packaged desktop app must start its bundled local companion automatically and open the drawer UI without a separate launcher window.
3. Closing the packaged desktop app must run the same shutdown path and leave no owned background helpers behind.
4. The website, README, and install guide must all point users to the installer release path rather than a source ZIP.

## Research Isolation Tests

1. GPT-Researcher import must do nothing when disabled.
2. Imported research must remain outside ordinary chat context unless selected.
3. Research report generation must be procedural in structure.
4. Source records and finding records must be linked and queryable.

## Migration and Persistence Tests

1. Fresh database bootstrap succeeds.
2. Existing database migrates safely on startup.
3. Audit logs are written for each completed turn.
4. Queue integrity remains correct after migration.


## Runtime Lifecycle and Cleanup Tests

1. Given the root start command, the project must start every runtime component it owns from that one path and reach a ready state without requiring the user to manually start extra shells.

2. Given Ctrl+C in the launcher terminal, the project must shut down the local server, managed Chrome instance if launched by the app, and every owned child helper process without leaving orphaned process windows.

3. Given a UI-triggered shutdown action, the same shutdown coordinator must run and cleanly stop all owned processes.

4. Given a simulated crash or forced termination, the next startup must detect stale app-owned PID records or child processes and clean them up safely before launching replacements.

5. The project must never terminate unrelated user Chrome windows, unrelated shells, or processes it did not start and register as owned.

6. On Windows, the project must not leave stray `console.exe`, PowerShell, cmd, or helper script windows behind after shutdown.

7. If the managed Chrome launch path is disabled, the app must still start cleanly and must not fail shutdown because no managed browser exists.

8. If a child process ignores graceful termination, the supervisor must escalate to forced termination after a bounded timeout and must still mark shutdown as complete.
