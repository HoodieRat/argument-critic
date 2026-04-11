# Per-File Build Manifest

This file tells the generation agent what each file is responsible for and the dependency order.

## Desktop-First Additions Required Beyond The Original Extension-First Manifest

These files are not optional follow-up work. They are part of the target product:

- `INSTALL.md`: Windows installer guide for normal users.
- `.github/workflows/release-windows.yml`: CI workflow that builds and publishes the Windows installer.
- `apps/desktop/package.json`: Electron desktop package definition and desktop build scripts.
- `apps/desktop/tsconfig.electron.json`: TypeScript build for the Electron main process and preload bridge.
- `apps/desktop/vite.config.ts`: Desktop renderer build config.
- `apps/desktop/src/electron/main.ts`: Desktop main process, capture flow, bundled runtime startup, and shutdown integration.
- `apps/desktop/src/electron/preload.ts`: Safe renderer bridge for capture and shell actions.
- `apps/desktop/src/renderer/index.html`: Desktop renderer entry.
- `apps/desktop/src/renderer/crop-overlay.html`: Crop-overlay renderer entry.
- `scripts/desktopLauncher.ts`: Source-checkout launcher for the Electron desktop shell.

## 1. `README.md`
- Responsibility: Top-level project readme with setup, run, test, and architecture overview.
- Depends on: none
- Must be fully implemented: yes
- Stubs allowed: no

## 2. `package.json`
- Responsibility: Root workspace configuration and scripts, including easy install/start commands and lifecycle-safe startup entrypoints.
- Depends on: none
- Must be fully implemented: yes
- Stubs allowed: no

## 3. `pnpm-workspace.yaml`
- Responsibility: Workspace definition for app packages.
- Depends on: package.json
- Must be fully implemented: yes
- Stubs allowed: no

## 4. `tsconfig.base.json`
- Responsibility: Shared TypeScript compiler settings.
- Depends on: package.json
- Must be fully implemented: yes
- Stubs allowed: no

## 5. `.gitignore`
- Responsibility: Project ignore rules.
- Depends on: none
- Must be fully implemented: yes
- Stubs allowed: no

## 6. `apps/extension/package.json`
- Responsibility: Chrome extension package and scripts.
- Depends on: package.json
- Must be fully implemented: yes
- Stubs allowed: no

## 7. `apps/extension/vite.config.ts`
- Responsibility: Extension build config.
- Depends on: apps/extension/package.json
- Must be fully implemented: yes
- Stubs allowed: no

## 8. `apps/extension/public/manifest.json`
- Responsibility: Chrome extension MV3 manifest.
- Depends on: apps/extension/package.json
- Must be fully implemented: yes
- Stubs allowed: no

## 9. `apps/extension/src/background/serviceWorker.ts`
- Responsibility: Background worker for message routing, capture requests, and service connectivity.
- Depends on: apps/extension/public/manifest.json
- Must be fully implemented: yes
- Stubs allowed: no

## 10. `apps/extension/src/content/cropOverlay.ts`
- Responsibility: Injected crop overlay UI for screenshot region selection.
- Depends on: apps/extension/public/manifest.json
- Must be fully implemented: yes
- Stubs allowed: no

## 11. `apps/extension/src/sidepanel/index.html`
- Responsibility: Side panel HTML entry.
- Depends on: apps/extension/package.json
- Must be fully implemented: yes
- Stubs allowed: no

## 12. `apps/extension/src/sidepanel/main.tsx`
- Responsibility: Side panel app bootstrap.
- Depends on: apps/extension/src/sidepanel/index.html
- Must be fully implemented: yes
- Stubs allowed: no

## 13. `apps/extension/src/sidepanel/App.tsx`
- Responsibility: Root side panel layout and mode shell.
- Depends on: apps/extension/src/sidepanel/main.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 14. `apps/extension/src/sidepanel/components/ChatView.tsx`
- Responsibility: Chat conversation view.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 15. `apps/extension/src/sidepanel/components/ActiveQuestionsPanel.tsx`
- Responsibility: Last-5 active questions queue UI.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 16. `apps/extension/src/sidepanel/components/QuestionHistoryPanel.tsx`
- Responsibility: Full question history with filters.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 17. `apps/extension/src/sidepanel/components/DatabasePanel.tsx`
- Responsibility: Database speak mode UI.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 18. `apps/extension/src/sidepanel/components/ReportsPanel.tsx`
- Responsibility: Generated report browsing and display.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 19. `apps/extension/src/sidepanel/components/CaptureControls.tsx`
- Responsibility: Capture and crop controls.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 20. `apps/extension/src/sidepanel/components/SessionHeader.tsx`
- Responsibility: Session summary and controls.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 21. `apps/extension/src/sidepanel/components/SettingsPanel.tsx`
- Responsibility: Local settings UI.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 22. `apps/extension/src/sidepanel/state/store.ts`
- Responsibility: Front-end state store.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 23. `apps/extension/src/sidepanel/api/client.ts`
- Responsibility: HTTP client for local companion service.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 24. `apps/extension/src/sidepanel/types.ts`
- Responsibility: UI-side shared types.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 25. `apps/extension/src/sidepanel/styles.css`
- Responsibility: Side panel styling.
- Depends on: apps/extension/src/sidepanel/App.tsx
- Must be fully implemented: yes
- Stubs allowed: no

## 26. `apps/server/package.json`
- Responsibility: Local companion service package.
- Depends on: package.json
- Must be fully implemented: yes
- Stubs allowed: no

## 27. `apps/server/tsconfig.json`
- Responsibility: Server TS config.
- Depends on: tsconfig.base.json
- Must be fully implemented: yes
- Stubs allowed: no

## 28. `apps/server/src/index.ts`
- Responsibility: Server entrypoint and lifecycle wiring.
- Depends on: apps/server/package.json
- Must be fully implemented: yes
- Stubs allowed: no

## 29. `apps/server/src/config/env.ts`
- Responsibility: Environment and runtime config parsing.
- Depends on: apps/server/src/index.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 30. `apps/server/src/config/constants.ts`
- Responsibility: Shared constants and limits.
- Depends on: apps/server/src/index.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 31. `apps/server/src/logger.ts`
- Responsibility: Structured logger.
- Depends on: apps/server/src/index.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 32. `apps/server/src/app.ts`
- Responsibility: Fastify app assembly.
- Depends on: apps/server/src/index.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 33. `apps/server/src/routes/health.ts`
- Responsibility: Health route.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 34. `apps/server/src/routes/chat.ts`
- Responsibility: Chat route for normal and critic turns.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 35. `apps/server/src/routes/database.ts`
- Responsibility: Database speak mode routes.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 36. `apps/server/src/routes/questions.ts`
- Responsibility: Question queue and history routes.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 37. `apps/server/src/routes/sessions.ts`
- Responsibility: Session CRUD and resume routes.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 38. `apps/server/src/routes/reports.ts`
- Responsibility: Report generation and retrieval routes.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 39. `apps/server/src/routes/capture.ts`
- Responsibility: Capture/attachment routes.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 40. `apps/server/src/routes/research.ts`
- Responsibility: Optional GPT-Researcher import routes.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 41. `apps/server/src/services/copilot/CopilotClient.ts`
- Responsibility: Copilot SDK integration wrapper.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 42. `apps/server/src/services/copilot/SessionRegistry.ts`
- Responsibility: Session registry and queueing control.
- Depends on: apps/server/src/services/copilot/CopilotClient.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 43. `apps/server/src/services/routing/TurnRouter.ts`
- Responsibility: Request route classifier.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 44. `apps/server/src/services/routing/DecisionMatrix.ts`
- Responsibility: Procedural-vs-AI decision rules.
- Depends on: apps/server/src/services/routing/TurnRouter.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 45. `apps/server/src/services/agents/Orchestrator.ts`
- Responsibility: Internal stage coordinator.
- Depends on: apps/server/src/services/routing/TurnRouter.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 46. `apps/server/src/services/agents/ContextRetrieverAgent.ts`
- Responsibility: Minimal relevant context fetcher.
- Depends on: apps/server/src/services/agents/Orchestrator.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 47. `apps/server/src/services/agents/ArgumentStructurerAgent.ts`
- Responsibility: Argument extraction agent.
- Depends on: apps/server/src/services/agents/Orchestrator.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 48. `apps/server/src/services/agents/CriticAgent.ts`
- Responsibility: Criticism and pressure-testing agent.
- Depends on: apps/server/src/services/agents/Orchestrator.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 49. `apps/server/src/services/agents/QuestioningAgent.ts`
- Responsibility: Question generation and queue logic.
- Depends on: apps/server/src/services/agents/Orchestrator.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 50. `apps/server/src/services/agents/DatabaseAgent.ts`
- Responsibility: Deterministic DB query answerer.
- Depends on: apps/server/src/services/agents/Orchestrator.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 51. `apps/server/src/services/agents/ResearchAgent.ts`
- Responsibility: Optional research importer/orchestrator.
- Depends on: apps/server/src/services/agents/Orchestrator.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 52. `apps/server/src/services/agents/ReportBuilderAgent.ts`
- Responsibility: Final response and report assembler.
- Depends on: apps/server/src/services/agents/Orchestrator.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 53. `apps/server/src/services/handoff/HandoffPacket.ts`
- Responsibility: Typed anti-drift handoff packet model.
- Depends on: apps/server/src/services/agents/Orchestrator.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 54. `apps/server/src/services/handoff/HandoffValidator.ts`
- Responsibility: Validation of required handoff fields.
- Depends on: apps/server/src/services/handoff/HandoffPacket.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 55. `apps/server/src/services/db/Database.ts`
- Responsibility: SQLite connection and bootstrap.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 56. `apps/server/src/services/db/migrations/001_initial_schema.sql`
- Responsibility: Initial schema migration.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 57. `apps/server/src/services/db/migrations/002_question_queue_indexes.sql`
- Responsibility: Question queue indexes and constraints.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 58. `apps/server/src/services/db/repositories/SessionsRepository.ts`
- Responsibility: Session repository.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 59. `apps/server/src/services/db/repositories/MessagesRepository.ts`
- Responsibility: Messages repository.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 60. `apps/server/src/services/db/repositories/QuestionsRepository.ts`
- Responsibility: Questions repository.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 61. `apps/server/src/services/db/repositories/ClaimsRepository.ts`
- Responsibility: Claims repository.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 62. `apps/server/src/services/db/repositories/ContradictionsRepository.ts`
- Responsibility: Contradictions repository.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 63. `apps/server/src/services/db/repositories/ReportsRepository.ts`
- Responsibility: Reports repository.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 64. `apps/server/src/services/db/repositories/AttachmentsRepository.ts`
- Responsibility: Attachments repository.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 65. `apps/server/src/services/db/repositories/ResearchRepository.ts`
- Responsibility: Research repository.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 66. `apps/server/src/services/db/repositories/SettingsRepository.ts`
- Responsibility: Settings repository.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 67. `apps/server/src/services/db/repositories/AuditLogRepository.ts`
- Responsibility: Audit log repository.
- Depends on: apps/server/src/services/db/Database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 68. `apps/server/src/services/parser/ArgumentParser.ts`
- Responsibility: Text-to-structure parser orchestration.
- Depends on: apps/server/src/services/agents/ArgumentStructurerAgent.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 69. `apps/server/src/services/parser/ClaimLinker.ts`
- Responsibility: Claim relationship linker.
- Depends on: apps/server/src/services/parser/ArgumentParser.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 70. `apps/server/src/services/parser/DefinitionTracker.ts`
- Responsibility: Definition drift helper.
- Depends on: apps/server/src/services/parser/ArgumentParser.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 71. `apps/server/src/services/questions/QuestionQueueService.ts`
- Responsibility: Active question queue management.
- Depends on: apps/server/src/services/agents/QuestioningAgent.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 72. `apps/server/src/services/questions/QuestionResolutionService.ts`
- Responsibility: Question answer/archive/resolve flow.
- Depends on: apps/server/src/services/questions/QuestionQueueService.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 73. `apps/server/src/services/reports/ProceduralReportBuilder.ts`
- Responsibility: Deterministic report renderer.
- Depends on: apps/server/src/services/agents/ReportBuilderAgent.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 74. `apps/server/src/services/reports/ReportTemplates.ts`
- Responsibility: Report templates and sections.
- Depends on: apps/server/src/services/reports/ProceduralReportBuilder.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 75. `apps/server/src/services/research/GptResearcherImporter.ts`
- Responsibility: GPT-Researcher importer and normalizer.
- Depends on: apps/server/src/services/agents/ResearchAgent.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 76. `apps/server/src/services/research/ResearchNormalizer.ts`
- Responsibility: Normalization and deduplication logic.
- Depends on: apps/server/src/services/research/GptResearcherImporter.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 77. `apps/server/src/services/attachments/AttachmentStore.ts`
- Responsibility: Attachment persistence service.
- Depends on: apps/server/src/routes/capture.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 78. `apps/server/src/services/attachments/ImageAnalysisService.ts`
- Responsibility: Image analysis pipeline.
- Depends on: apps/server/src/services/attachments/AttachmentStore.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 79. `apps/server/src/services/session/SessionSummaryService.ts`
- Responsibility: Session summary creation.
- Depends on: apps/server/src/services/agents/Orchestrator.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 80. `apps/server/src/services/persistence/PersistenceCoordinator.ts`
- Responsibility: Atomic write coordinator for turn deltas.
- Depends on: apps/server/src/services/agents/Orchestrator.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 81. `apps/server/src/types/domain.ts`
- Responsibility: Shared domain models for the server.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 82. `apps/server/src/types/api.ts`
- Responsibility: Request/response types.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 83. `apps/server/src/utils/time.ts`
- Responsibility: Time helpers.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 84. `apps/server/src/utils/fs.ts`
- Responsibility: Filesystem helpers.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 85. `apps/server/test/acceptance/normal-chat.test.ts`
- Responsibility: Acceptance test for normal chat mode.
- Depends on: apps/server/src/routes/chat.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 86. `apps/server/test/acceptance/critic-mode.test.ts`
- Responsibility: Acceptance test for critic mode.
- Depends on: apps/server/src/routes/chat.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 87. `apps/server/test/acceptance/database-mode.test.ts`
- Responsibility: Acceptance test for database mode.
- Depends on: apps/server/src/routes/database.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 88. `apps/server/test/acceptance/question-queue.test.ts`
- Responsibility: Acceptance test for question queue behavior.
- Depends on: apps/server/src/routes/questions.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 89. `apps/server/test/acceptance/report-generation.test.ts`
- Responsibility: Acceptance test for report generation.
- Depends on: apps/server/src/routes/reports.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 90. `apps/server/test/acceptance/research-isolation.test.ts`
- Responsibility: Acceptance test for research isolation.
- Depends on: apps/server/src/routes/research.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 91. `apps/server/test/acceptance/capture-flow.test.ts`
- Responsibility: Acceptance test for screenshot/crop flow.
- Depends on: apps/server/src/routes/capture.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 92. `docs/architecture.md`
- Responsibility: Human-readable architecture notes for maintainers.
- Depends on: README.md
- Must be fully implemented: yes
- Stubs allowed: no

## 93. `docs/api.md`
- Responsibility: Local companion HTTP API surface.
- Depends on: apps/server/src/routes/chat.ts
- Must be fully implemented: yes
- Stubs allowed: no

## 94. `docs/state-model.md`
- Responsibility: UI state, queue state, and session state model.
- Depends on: apps/extension/src/sidepanel/state/store.ts
- Must be fully implemented: yes
- Stubs allowed: no


## Additional Runtime and Lifecycle Files

## `scripts/install.ts`
- Responsibility: Verify prerequisites, bootstrap dependencies, create required local data directories, and prepare the project for first run.
- Depends on: package.json
- Must be fully implemented: yes
- Stubs allowed: no

## `scripts/start.ts`
- Responsibility: Single user-facing startup entry that launches all owned runtime components, supervises them, and handles clean shutdown on Ctrl+C or fatal exit.
- Depends on: package.json, apps/server/src/index.ts, apps/extension/public/manifest.json
- Must be fully implemented: yes
- Stubs allowed: no

## `scripts/cleanup.ts`
- Responsibility: Stale-process cleanup utility used on startup recovery and manual cleanup, limited strictly to app-owned processes and profiles.
- Depends on: scripts/start.ts
- Must be fully implemented: yes
- Stubs allowed: no

## `apps/server/src/routes/runtime.ts`
- Responsibility: Runtime control routes for readiness state and intentional local shutdown triggered from the UI.
- Depends on: apps/server/src/app.ts
- Must be fully implemented: yes
- Stubs allowed: no

## `apps/server/src/services/runtime/ProcessSupervisor.ts`
- Responsibility: Track every spawned child process, register ownership metadata, and terminate owned process trees safely.
- Depends on: apps/server/src/index.ts
- Must be fully implemented: yes
- Stubs allowed: no

## `apps/server/src/services/runtime/ShutdownCoordinator.ts`
- Responsibility: Coordinate graceful shutdown across server, Copilot sessions, file handles, queues, and supervised child processes.
- Depends on: apps/server/src/services/runtime/ProcessSupervisor.ts
- Must be fully implemented: yes
- Stubs allowed: no

## `apps/server/src/services/runtime/ChromeLauncher.ts`
- Responsibility: Launch a managed Chrome instance/profile for the unpacked extension without interfering with the user's unrelated browser sessions.
- Depends on: apps/server/src/services/runtime/ProcessSupervisor.ts
- Must be fully implemented: yes
- Stubs allowed: no

## `apps/server/src/services/runtime/StaleProcessRecovery.ts`
- Responsibility: Detect stale app-owned processes or pid records from a previous crash and clean them up safely on next start.
- Depends on: apps/server/src/services/runtime/ProcessSupervisor.ts
- Must be fully implemented: yes
- Stubs allowed: no

## `apps/server/src/utils/process.ts`
- Responsibility: Cross-platform process helpers for PID validation, tree termination, Windows console hiding, and ownership checks.
- Depends on: apps/server/src/services/runtime/ProcessSupervisor.ts
- Must be fully implemented: yes
- Stubs allowed: no

## `apps/server/test/acceptance/runtime-lifecycle.test.ts`
- Responsibility: Verify startup, managed process ownership, graceful shutdown, Ctrl+C handling, and stale-process recovery.
- Depends on: scripts/start.ts, apps/server/src/services/runtime/ShutdownCoordinator.ts
- Must be fully implemented: yes
- Stubs allowed: no

## `docs/runtime-lifecycle.md`
- Responsibility: Document the startup path, owned processes, shutdown guarantees, and recovery behavior for operators and maintainers.
- Depends on: scripts/start.ts
- Must be fully implemented: yes
- Stubs allowed: no

## Runtime Implementation Requirements

The generation agent must wire the lifecycle pieces together so that:
- the root start path is easy for ordinary users
- all project-owned processes are started by or registered with the supervisor
- Ctrl+C shuts down the whole owned process tree cleanly
- in-app shutdown uses the same shutdown coordinator
- next start performs stale-process recovery before launching new children
- no unrelated user processes are terminated
- Windows launches do not leave stray console windows open for managed child processes
