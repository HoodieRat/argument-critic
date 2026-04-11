# Implementation Retrospective

This file captures what the original generation pack missed and what must be encoded up front if you want the next generation pass to land closer to the shipped product with less prompting.

## What The Original Pack Under-Specified

1. The product was described as extension-first, but the actual successful implementation became desktop-first with Electron.
2. The original file tree and build manifest did not treat `apps/desktop` as a first-class required surface.
3. The original install story focused on source checkout scripts rather than a normal Windows installer and GitHub Releases.
4. Attachment handling was underspecified. In the real product, captures and uploads had to become visible, removable composer attachments and persist into message history.
5. Question management needed extra user controls beyond the original queue definition: clear-all and a question-generation toggle.
6. The sign-in path needed explicit product guidance. The practical default became GitHub CLI-backed GitHub sign-in, with OAuth device flow only as an opt-in maintainer override.

## What To Specify Up Front Next Time

1. State clearly that Electron is the primary shell and the extension path is legacy compatibility only.
2. Require a packaged Windows installer, a release workflow, and website copy that points to Releases instead of a source ZIP.
3. Treat bundled runtime startup inside the packaged desktop app as a core requirement, not late-stage polish.
4. Treat attachment chips, transcript attachment rendering, and attachment-aware prompting as one feature, not three unrelated follow-up tasks.
5. Treat question lifecycle controls as a product surface: answer, archive, resolve, reopen, clear-all, and generation toggle.
6. Require one file that records generation-course corrections so later agents do not have to rediscover architecture shifts midstream.

## Recommended Prompting Bias For Future Runs

- Ask for a desktop-first local app, not a browser extension with a desktop retrofit.
- Ask for a normal-user Windows install path from day one.
- Ask for explicit attachment UX, not only attachment storage.
- Ask for queue controls, not only queue persistence.
- Ask for a release website that matches the actual install path.