# MCP and Local Tool Recommendations

These are optional supports, not the primary backbone.

## Allowed MCP / Local Tool Additions Without Paid APIs

- Filesystem access for controlled local file reading and writing
- Git access for repo state and change inspection
- Time utilities
- Memory-style local retrieval utilities
- Sequential-thinking style step tools for deterministic decomposition
- Fetch for local or explicitly allowed HTTP fetches
- Local OCR utility only if needed for image text fallback
- Local markdown/report rendering helpers

## Important Rule

No MCP or local tool should be added unless:
- it serves this project directly
- it does not force account creation or paid API usage
- it improves determinism, stability, or local capability
- it does not bloat V1

## Recommended Optional Additions

### Filesystem
Useful for:
- GPT-Researcher import folders
- local export and backup
- session/report export

### Git
Useful for:
- optional developer diagnostics
- safe project-state inspection

### Time
Useful for:
- reliable timestamps
- queue ordering
- session summaries

### Sequential Thinking
Useful for:
- deterministic internal decomposition
- structured reasoning prep before AI calls

### Fetch
Useful only for:
- local companion service communication
- user-approved local HTTP endpoints
- not for general hidden web behavior in V1

## Not Recommended for V1

- account-gated hosted services
- browser automation MCPs
- heavy vector DB stacks
- large orchestration frameworks
- broad scraping stacks

## Principle

MCP and local tools may assist.
They must not replace the clean local architecture:
Chrome extension + local companion service + SQLite + Copilot integration + procedural reports.
