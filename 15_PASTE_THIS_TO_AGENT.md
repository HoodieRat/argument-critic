# Paste This To The Generation Agent

Read every file in this generation pack before writing code.

Then implement the full project in the repo root in manifest order. Do not implement inside the pack folder.

Non-negotiable requirements:
- implement every file in `08_IMPLEMENTATION_FILE_TREE.md`
- follow `09_PER_FILE_BUILD_MANIFEST.md`
- pass `10_ACCEPTANCE_TESTS.md`
- no stubs
- no TODO markers left in implementation files
- no fake buttons or placeholder routes
- preserve the advisor-style critic behavior and Active Questions queue
- preserve direct database conversation, screenshot/crop intake, procedural reports, and optional GPT-Researcher import gating

Runtime and lifecycle requirements:
- provide one easy root start path for ordinary users
- start every runtime component the app owns from that one path
- track every owned child process
- use a unified shutdown coordinator
- cleanly shut down all owned child processes on Ctrl+C, in-app exit, normal close, and recovery from a prior crash
- do not leave orphaned console windows, PowerShell windows, helper scripts, or managed Chrome instances behind
- never terminate unrelated user processes
- if you launch Chrome for the unpacked extension, use an app-owned managed profile and terminate only that managed browser instance

Implementation quality rules:
- stable over clever
- procedural first where deterministic
- AI only where interpretation is needed
- preserve anti-drift handoff packets across agent stages
- make setup and startup easy for non-expert users
- the finished project must be polished and fully runnable

When done:
- ensure the root README explains install, start, stop, cleanup, extension loading/managed launch behavior, and recovery behavior
- ensure tests cover runtime lifecycle cleanup, stale-process recovery, database mode, critic mode, capture flow, and the question queue
