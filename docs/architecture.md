# Architecture

## Overview

Argument Critic is a two-part local application:

1. an Electron desktop shell for the default user experience
2. a local Fastify companion service for persistence, orchestration, deterministic database answers, runtime control, and lifecycle cleanup

The root launcher in `scripts/start.ts` starts the server in-process, launches the desktop shell by default, and coordinates shutdown across everything the app owns. A legacy browser-helper path still exists for compatibility work, but it is no longer the primary product surface.

## Desktop Layer

The desktop shell lives in `apps/desktop` and contains:

- Electron main-process startup and window lifecycle logic
- a preload bridge for desktop-only capabilities such as external links, clipboard copy, and capture helpers
- the renderer build output used for the actual drawer UI

## Shared UI Layer

The extension lives in `apps/extension` and contains:

- `src/sidepanel`: React UI for chat, critic mode, the question queue, records lookup, reports, capture, research, and settings
- `src/background/serviceWorker.ts`: capture orchestration and side-panel behavior wiring
- `src/content/cropOverlay.ts`: injected crop selection overlay for screenshot regions

This UI talks to the local server over HTTP and never talks directly to SQLite.

## Server Layer

The server lives in `apps/server` and is split into a few major slices:

- `routes`: the HTTP surface for chat, questions, database mode, reports, captures, research, sessions, health, and runtime control
- `services/db`: SQLite bootstrap, migrations, and repositories
- `services/agents`: bounded internal roles such as context retrieval, structuring, criticism, questioning, database answering, research import, and final response composition
- `services/runtime`: process supervision, stale-process recovery, managed Chrome launch, and shutdown coordination
- `services/reports`, `services/questions`, `services/attachments`, `services/research`, `services/session`: deterministic domain services

## Orchestration Path

The default chat/critic path is:

1. `TurnRouter` classifies the turn
2. `ContextRetrieverAgent` loads the smallest relevant context set
3. `ArgumentStructurerAgent` extracts claims, definitions, and assumptions
4. `CriticAgent` detects ambiguity, unsupported conclusions, definition drift, and contradictions
5. `QuestioningAgent` generates targeted follow-up questions
6. `ReportBuilderAgent` assembles the final advisor-style response
7. `PersistenceCoordinator` commits the resulting messages, questions, contradictions, and audit log entry atomically

Database mode bypasses the AI-heavy path and uses `DatabaseAgent` for deterministic answers first.

## Persistence Model

SQLite is initialized in `services/db/Database.ts` and migrated from `services/db/migrations`.

Key persisted entities:

- sessions and messages
- claims, assumptions, definitions, objections, contradictions
- questions and question answers
- reports
- attachments and captures
- research runs, sources, and findings
- settings and audit log records

## Runtime Ownership Model

Only app-owned child processes are registered and terminated:

- the Electron desktop shell by default
- the managed Chrome instance when the legacy browser-helper path is enabled

The server itself runs in the launcher process. That keeps the ownership graph small and makes Ctrl+C, UI shutdown, and crash recovery easier to reason about.