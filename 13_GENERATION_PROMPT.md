# Generation Prompt

You are implementing a complete local production-ready project from this pack.

## Your Role

Build the entire project described by this pack in full.

## Hard Requirements

- Do not omit files listed in `08_IMPLEMENTATION_FILE_TREE.md`
- Follow `09_PER_FILE_BUILD_MANIFEST.md`
- Respect the behavior contract in `01_PRODUCT_VISION_AND_GUARDRAILS.md`
- Respect bounded orchestration in `03_AGENTS.md`
- Respect reusable capabilities in `04_SKILLS.md`
- Respect anti-drift packet rules in `05_HANDOFF_PROTOCOL.md`
- Respect the procedural-vs-AI rules in `06_CAPABILITIES_AND_DECISION_MATRIX.md`
- Respect the data model in `07_DATA_MODEL.md`
- Pass the acceptance tests in `10_ACCEPTANCE_TESTS.md`

## Prohibited Behaviors

- no stubs
- no placeholder buttons
- no “coming soon” routes in the main path
- no fake storage
- no TODO markers left inside implementation files
- no omission of the question queue
- no omission of database speak mode
- no silent removal of screenshot or crop support
- no collapse into generic assistant tone or behavior
- no multi-step manual startup requirement for ordinary use
- no orphaned child processes, shells, browser instances, or console windows on shutdown
- no killing of unrelated user processes

## Required Product Behavior

The finished application must:
- act like an advisor that questions and tests ideas
- track and highlight argument structure
- ask targeted testing questions
- show the latest 5 unanswered AI questions in a queue
- allow answering, archiving, resolving, and revisiting questions
- support normal chat
- support direct database conversation
- support screenshot and crop input
- generate procedural reports
- optionally import GPT-Researcher results only when enabled
- provide a single easy startup path for users
- start every runtime component the project owns from that path
- track owned child processes and terminate them cleanly on Ctrl+C, in-app shutdown, normal exit, and next-run crash recovery

## Implementation Standard

Produce a stable, complete, polished V1 implementation using the file tree and manifest.
If a dependency choice is needed, choose the simplest stable option that fits the architecture and does not add external paid dependencies.


## Runtime Lifecycle Requirements

The finished application must include:
- an easy root start command suitable for ordinary users
- a launcher or supervisor that owns and tracks all child processes it starts
- a managed Chrome launch path for the unpacked extension that does not interfere with unrelated user Chrome sessions
- a unified shutdown coordinator used by Ctrl+C, local shutdown requests, and fatal-exit cleanup
- stale-process recovery on next start after a crash
- bounded graceful shutdown with escalation if a child process refuses to exit
- Windows-friendly child spawning that avoids leaving stray console windows open where possible

The implementation is incomplete if it requires users to manually kill leftover processes or manually start hidden dependencies.
