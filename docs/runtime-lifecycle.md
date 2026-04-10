# Runtime Lifecycle

## Root Start Path

The supported user-facing launch entry is `corepack pnpm start`, which runs `scripts/start.ts`.

That script:

1. loads environment and local data paths
2. creates required directories
3. runs stale-process recovery from the prior registry
4. starts the Fastify companion server in-process
5. optionally launches managed Chrome with the unpacked extension loaded
6. registers Ctrl+C, fatal exception, and runtime shutdown handlers with the same shutdown coordinator

## Owned Process Tracking

`ProcessSupervisor` records app-owned child processes in `data/runtime/process-registry.json` with:

- PID
- role
- command and args
- start time
- whether the process is safe to terminate automatically
- managed Chrome profile path when applicable

The current implementation typically owns only the managed Chrome process tree. The server itself runs in the launcher process.

## Shutdown Flow

The shared shutdown flow is:

1. `ShutdownCoordinator.shutdown(reason)` starts once and only once
2. registered hooks run in reverse order
3. the process supervisor attempts graceful child shutdown first
4. any child that survives the grace window is force-terminated
5. the owned-process registry is cleared

The same coordinator is used by:

- Ctrl+C
- `POST /runtime/shutdown`
- manual handle shutdown in tests
- fatal exception and rejection hooks in the launcher

## Stale-Process Recovery

`StaleProcessRecovery` runs before new children are launched.

It reads the persisted registry and:

- checks whether a recorded process is still alive
- force-terminates only those recorded app-owned processes
- removes any managed profile directory associated with that record when appropriate
- rehydrates the current supervisor with whatever live owned processes still remain

It does not enumerate or kill unrelated user processes.

## Windows Notes

- child processes are spawned with `windowsHide: true` where applicable to avoid stray helper consoles
- forced process-tree termination uses `taskkill /PID <pid> /T /F`
- the graceful window is bounded, so a stubborn child cannot block shutdown indefinitely

## Manual Cleanup

If the app was interrupted badly enough that the next normal start is inconvenient, `corepack pnpm cleanup` runs the same stale-process recovery logic without launching the app.