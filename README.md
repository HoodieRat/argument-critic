# Argument Critic

Argument Critic is a local Windows desktop app that helps you think more clearly.

It does not just chat back at you. It helps you develop an idea, challenge weak reasoning, save open questions, search older sessions, inspect screenshots, and generate structured reports you can come back to later.

Website: https://hoodierat.github.io/argument-critic/

## Who It Is For

- people who want to pressure-test an idea before acting on it
- founders, operators, writers, analysts, and researchers
- anyone who wants a tool that asks better questions instead of only giving quick answers

## What It Can Do

- Chat: talk through an idea and make it clearer
- Critic: challenge assumptions, contradictions, and weak logic
- Questions: keep track of unresolved questions so they do not disappear
- Records: search past sessions, reports, captures, and saved facts
- Reports: turn messy work into a structured summary
- Capture: take a screenshot or crop part of the screen, extract visible text by default, or switch back to full image inspection per chat
- Research: review imported outside research in a separate lane

## Why People Like It

- your work stays on your own machine
- your sessions, questions, and reports are saved locally
- it is built around clarity and critique, not generic assistant fluff
- it gives you a repeatable place to return to hard problems

## Windows Quick Start

This is the easiest path for normal users.

1. Open the latest release on GitHub.
2. Download `Argument-Critic-Setup.exe`.
3. Run the installer.
4. Launch Argument Critic from the Start Menu or desktop shortcut.
5. In the app, open Settings and choose `Sign in with GitHub`.

Need more hand-holding? See [INSTALL.md](INSTALL.md) or [docs/windows-guide.md](docs/windows-guide.md).

## What The Installer Does

The Windows installer is meant to give non-coders a normal app install. It will:

- install the desktop app into Windows
- bundle the local companion service so Node.js and pnpm are not required
- bundle the GitHub sign-in helper used by the default Sign in with GitHub flow
- create Start Menu shortcuts and optionally a desktop shortcut
- store runtime data under your Windows user profile

## Source Checkout Quick Start

This path is for contributors or anyone running from source instead of the installer.

1. Download this project from GitHub or clone the repository.
2. Open the project folder.
3. Double-click `Install Argument Critic.cmd`.
4. Wait for the setup to finish.
5. Double-click `Start Argument Critic.cmd`.
6. Leave that launcher window open while the source build is running.

## First Run

When the app opens for the first time:

1. Open Settings.
2. Click `Sign in with GitHub`.
3. A browser page opens.
4. Complete GitHub approval.
5. Come back to the app and start using it.

On Windows installs, the app now bundles the GitHub sign-in helper used by the default sign-in path so regular users do not have to install or manage it separately. Manual token entry is still available as an advanced fallback, but ordinary GitHub tokens usually unlock GitHub Models only, not the full Copilot catalog.

## How To Use It

### 1. Start In Chat

Use Chat when your idea is still rough.

- explain the idea in plain language
- ask the app to clarify, organize, or sharpen it
- use this before moving into critique mode

### 2. Move To Critic

Use Critic when you want pushback.

- find contradictions
- expose weak assumptions
- spot missing proof
- test whether your reasoning actually holds up

### 3. Watch The Questions Panel

Argument Critic keeps an active queue of unresolved questions.

This is useful when:

- you need to remember what still needs evidence
- you want to answer questions later instead of losing them
- you want a running list of the hardest gaps in your thinking

### 4. Use Records When You Need Exact Recall

The Records panel is for retrieval, not freeform brainstorming.

Use it when you want to ask things like:

- what did I conclude last week?
- what contradictions were found in this session?
- what report already exists on this topic?

### 5. Generate Reports

Reports turn saved work into something easier to review or share.

Use them when you want:

- a structured summary
- a checkpoint before making a decision
- a cleaner version of what happened across a session

### 6. Use Capture For Visual Evidence

You can capture the whole window or crop part of the screen.

This is useful when:

- you want to inspect a chart, claim, screenshot, or document excerpt
- you want the app to extract the visible text from a screenshot before replying
- you want to switch that chat back to direct image inspection for charts, layouts, or other visual details

## What Gets Saved

Argument Critic stores your work locally, including:

- sessions and messages
- questions and answers
- contradictions and assumptions
- generated reports
- captures and attachments
- optional imported research

Your local data lives under the project data folder and is backed by SQLite.

Installed builds store that data under your Windows user profile. Source checkouts use the local `data` folder unless you override it.

## Privacy And Sign-In

- the app is local-first
- saved runtime data stays on your machine
- stored tokens are encrypted for the current Windows user account
- the app does not show your saved token back to you after submission

## Troubleshooting

If something goes wrong, start here:

- [docs/windows-guide.md](docs/windows-guide.md)
- [docs/troubleshooting.md](docs/troubleshooting.md)

Common quick fixes:

- if install fails, run `Argument-Critic-Setup.exe` again after fixing the reported issue
- if the app does not open, make sure you used the installer or completed the source install step first
- if the drawer closes, reopen Argument Critic from the Start Menu or restart with `Start Argument Critic.cmd` for a source checkout
- if sign-in is not available, check the Settings screen or the troubleshooting guide

## Technology Used

Argument Critic currently uses:

- Electron for the desktop shell
- React for the interface
- Zustand for UI state
- Fastify for the local companion API
- SQLite for local storage
- TypeScript across the codebase
- Vite for builds
- GitHub sign-in and GitHub-hosted model access when configured

## For Developers And Maintainers

### Main commands

- `corepack pnpm build`
- `corepack pnpm --filter @argument-critic/server test`
- `corepack pnpm run build:legacy-extension`
- `corepack pnpm release:windows`
- `corepack pnpm cleanup`

### Project structure

- `apps/desktop`: Electron shell and preload bridge
- `apps/extension`: shared React sidepanel surface and legacy browser helper path
- `apps/server`: local Fastify server, SQLite persistence, orchestration, runtime control, and tests
- `scripts`: install, start, and cleanup entrypoints
- `docs`: supporting documentation

### Automated Windows releases

The repository already includes a GitHub Actions release workflow.

- `workflow_dispatch` builds a preview installer and uploads it as an Actions artifact.
- published GitHub releases run the same packaging pipeline and attach the installer automatically.

By default, this project ships unsigned Windows installers. Users will see the normal `Unknown Publisher` warning and must use `More info` -> `Run anyway` when installing from the official GitHub release page.

If you ever want optional signing later, add these repository secrets:

- `WINDOWS_CERTIFICATE_PFX_BASE64`: base64-encoded exportable `.pfx` certificate
- `WINDOWS_CERTIFICATE_PASSWORD`: password for that `.pfx`

The packaging script converts those secrets into the `CSC_LINK` and `CSC_KEY_PASSWORD` values that `electron-builder` expects. If you already manage signing through `CSC_LINK` and `CSC_KEY_PASSWORD`, the same packaging path will use those directly instead.

There is no free publicly trusted Windows code-signing certificate built into this repo flow. For a no-cost release path, keep shipping unsigned installers. See [docs/releasing.md](docs/releasing.md) for the exact release flow.

### Maintainer note for direct GitHub sign-in

If you want the browser-first OAuth device flow enabled instead of the default CLI-backed sign-in:

1. copy `.env.local.example` to `.env.local`
2. set `ARGUMENT_CRITIC_GITHUB_LOGIN_AUTH_METHOD=oauth-device`
3. set `ARGUMENT_CRITIC_GITHUB_OAUTH_CLIENT_ID`
4. restart the app

End users should not need to do that themselves.