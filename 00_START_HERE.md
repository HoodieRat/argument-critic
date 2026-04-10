# Argument Critic Full Generation Pack

This pack is the complete input package for the generation agent.

It exists to prevent drift, omissions, vague scaffolding, and collapse into generic assistant behavior.

## Read Order

1. `00_START_HERE.md`
2. `01_PRODUCT_VISION_AND_GUARDRAILS.md`
3. `02_PROJECT_PLAN_V1.md`
4. `03_AGENTS.md`
5. `04_SKILLS.md`
6. `05_HANDOFF_PROTOCOL.md`
7. `06_CAPABILITIES_AND_DECISION_MATRIX.md`
8. `07_DATA_MODEL.md`
9. `08_IMPLEMENTATION_FILE_TREE.md`
10. `09_PER_FILE_BUILD_MANIFEST.md`
11. `10_ACCEPTANCE_TESTS.md`
12. `11_MCP_AND_LOCAL_TOOLS.md`
13. `12_TODO.md`
14. `13_GENERATION_PROMPT.md`
15. `14_FILE_INDEX.md`
16. `generation_manifest.json`

## Non-Negotiable Outcome

Build a stable, local, polished Chrome side-panel companion that:
- uses GitHub Copilot through the local companion service
- chats normally
- acts like an advisor rather than a generic friendly helper
- tracks argument structure
- asks targeted testing questions
- keeps a last-5 active question queue
- lets the user answer, archive, resolve, or revisit those questions
- lets the user speak directly to the database
- uses procedural answers whenever exactness is better than AI
- supports screenshot/crop intake
- optionally ingests GPT-Researcher results if enabled
- persists sessions, questions, contradictions, objections, and reports
- starts with one easy user-facing start command
- launches every runtime component it owns from that start path
- shuts down every owned child process cleanly on Ctrl+C, UI exit, normal close, or crash recovery

## Build Philosophy

- Stable over clever
- Procedural first where deterministic
- AI where interpretation is needed
- No stubs
- No fake buttons
- No placeholder routes
- No vague scaffolding
- No silent omission of required features
- No collapse into generic helper behavior

## What the generation agent must do

- Read all files before writing code
- Build the real project file tree
- Respect the build order
- Respect the behavior contract
- Respect the anti-drift handoff protocol
- Implement acceptance tests
- Refuse to leave features as TODOs in code


## Runtime Lifecycle Requirement

The generated project must include a single easy startup path for ordinary users. That startup path must launch every runtime component the project owns, track them, and cleanly shut them all down. No orphaned `console.exe`, PowerShell, Chrome child process, or script process windows may be left behind after normal exit, forced exit, or recovery from a prior crash.
