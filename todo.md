# Desktop-First Migration Plan

- [x] Write the focused desktop migration plan before implementation and keep it synced during work.
- [x] Add a dedicated desktop shell that reuses the existing server and React app instead of launching Chrome as the main product surface.
- [x] Replace extension-only UI hooks with platform adapters so the same app works in the desktop drawer while preserving the legacy browser helper as an optional compatibility path.
- [x] Update the Windows install and start launchers so they prebuild the desktop app once and start quickly afterward.
- [x] Update the run guide and in-app wording so the normal user flow is desktop-first and no longer centered on the extension.
- [x] Verify the desktop path with dependency install, build, tests, and a launcher smoke test, then mark the checklist complete.