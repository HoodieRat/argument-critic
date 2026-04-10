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
- Capture: take a screenshot or crop part of the screen and analyze it
- Research: review imported outside research in a separate lane

## Why People Like It

- your work stays on your own machine
- your sessions, questions, and reports are saved locally
- it is built around clarity and critique, not generic assistant fluff
- it gives you a repeatable place to return to hard problems

## Windows Quick Start

This is the easiest path for normal users.

1. Download this project from GitHub.
2. Extract the ZIP to a normal folder on your PC.
3. Double-click `Install Argument Critic.cmd`.
4. Wait for the installer to finish. The first install can take a few minutes.
5. Double-click `Start Argument Critic.cmd`.
6. Leave that launcher window open while the app is running.
7. In the app, open Settings and choose `Sign in with GitHub`.

Need more hand-holding? See [docs/windows-guide.md](docs/windows-guide.md).

## What The Installer Does

The install script is meant to reduce setup work for non-coders. It will:

- install or upgrade Node.js LTS with `winget` if needed
- enable Corepack for the local package workflow
- install the project dependencies
- prepare local data folders
- prebuild the desktop app for faster starts later

If `winget` is missing, install Node.js from https://nodejs.org/ and run the installer again.

## First Run

When the app opens for the first time:

1. Open Settings.
2. Click `Sign in with GitHub`.
3. A browser page opens.
4. Approve the one-time code.
5. Come back to the app and start using it.

If this build was not configured for direct browser sign-in, the app falls back to GitHub CLI or manual token entry. Regular end users should not need to edit config files.

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
- you want the app to analyze what is visible on screen

## What Gets Saved

Argument Critic stores your work locally, including:

- sessions and messages
- questions and answers
- contradictions and assumptions
- generated reports
- captures and attachments
- optional imported research

Your local data lives under the project data folder and is backed by SQLite.

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

- if install fails, run `Install Argument Critic.cmd` again after fixing the reported issue
- if the app does not open, make sure you used the install step first
- if the drawer closes, restart with `Start Argument Critic.cmd`
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
- `corepack pnpm cleanup`

### Project structure

- `apps/desktop`: Electron shell and preload bridge
- `apps/extension`: shared React sidepanel surface and legacy browser helper path
- `apps/server`: local Fastify server, SQLite persistence, orchestration, runtime control, and tests
- `scripts`: install, start, and cleanup entrypoints
- `docs`: supporting documentation

### Maintainer note for direct GitHub sign-in

If you want the browser-first GitHub sign-in flow enabled in your build:

1. copy `.env.local.example` to `.env.local`
2. set `ARGUMENT_CRITIC_GITHUB_OAUTH_CLIENT_ID`
3. restart the app

End users should not need to do that themselves.