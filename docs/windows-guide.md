# Windows Guide

This guide is for normal users who just want the app working.

## Before You Start

You should have:

- a Windows PC
- an internet connection for sign-in and model access
- a GitHub account if you want to use GitHub sign-in

You do not need to know how to code.

## The Easy Install Path

1. Open the latest release page on GitHub.
2. Download `Argument-Critic-Setup.exe`.
3. Open the installer.
4. Follow the Windows install prompts.
5. Launch Argument Critic from the Start Menu or desktop shortcut.

## What To Expect During Install

The installer may:

- ask for normal Windows install permission
- copy the desktop app and bundled local companion to your PC
- include the GitHub sign-in helper used by the default sign-in flow
- create Start Menu shortcuts
- offer a desktop shortcut
- keep your app data under your Windows user profile

You do not need Node.js, pnpm, or a ZIP extraction step for the normal install path.

## First Sign-In

1. Open Settings.
2. Click `Sign in with GitHub`.
3. A browser window or tab opens.
4. Approve the GitHub sign-in step.
5. Return to the app.

Normal users should use that sign-in button. Manual token entry is only an advanced fallback.

## Your First Session

Start in `Chat` if your idea is still messy.

Move to `Critic` when you want the app to challenge the idea.

Watch the `Questions` panel to keep track of missing answers.

Use `Reports` when you want a more structured write-up.

## What Each Area Means

- `Chat`: talk through an idea and make it clearer
- `Critic`: stress-test the idea and look for weaknesses
- `Questions`: save unresolved questions instead of losing them
- `Records`: search what the app already knows from past work
- `Reports`: generate structured summaries
- `Capture`: analyze a screenshot or crop
- `Research`: review imported outside research separately
- `Settings`: sign in, review access, and adjust runtime options

## Stopping The App

You can stop it in any of these ways:

1. use `Exit app` inside the app
2. close the app window and reopen it later from the Start Menu
3. if you are running from source instead of the installer, stop the launcher window or restart with `Start Argument Critic.cmd`

## Need Help?

If something is failing, read [docs/troubleshooting.md](docs/troubleshooting.md).