# Releasing Windows Builds

This repository already has an automated Windows release pipeline.

The default no-cost release path is to ship an unsigned installer.

That means Windows will show the usual `Unknown Publisher` warning until you add a real code-signing certificate from outside this repository.

## Preview builds

Use the `release-windows` workflow with `workflow_dispatch` when you want a build artifact without publishing a GitHub release.

That path:

1. installs dependencies
2. builds the desktop and server packages
3. bundles the GitHub sign-in helper
4. packages the NSIS installer
5. uploads the installer artifacts to the workflow run

If no signing certificate is configured, that preview build will be unsigned.

## Published releases

When you publish a GitHub release, the same workflow runs automatically.

That path now attaches the installer whether or not signing is configured.

If you do nothing else, the official release will still be unsigned.

That is the correct path if you do not want to buy a certificate.

## What free options actually mean

- Unsigned installer: works for public releases, but users will see `Unknown Publisher` and must choose `More info` -> `Run anyway`.
- Self-signed certificate: only suitable for your own machines or a controlled environment where users manually trust your certificate first.
- GitHub attestations or normal release artifacts: useful for provenance, but they do not replace Windows code signing or remove the `Unknown Publisher` warning.
- Open-source signing programs: sometimes available for eligible public OSS projects, but they are external programs with their own approval rules, not something this repo can grant by itself.

## Optional signing secrets

Add these GitHub repository secrets:

- `WINDOWS_CERTIFICATE_PFX_BASE64`: base64-encoded contents of an exportable Windows code-signing `.pfx`
- `WINDOWS_CERTIFICATE_PASSWORD`: password for that `.pfx`

The packaging script will decode that certificate at build time, feed it into `electron-builder`, and clean it up afterward.

If you already manage signing with `CSC_LINK` and `CSC_KEY_PASSWORD`, the same packaging script honors those directly and does not need the Argument Critic-specific secret names.

## Certificate expectations

This automation path expects a standard exportable code-signing certificate.

Hardware-bound EV certificates that require a USB token do not fit this GitHub Actions workflow.

If you never add these secrets, the workflow still works. The installer just stays unsigned.

## Release output

The workflow publishes:

- `Argument-Critic-Setup.exe`
- `Argument-Critic-Setup.exe.blockmap`

## Local signed packaging

Local packaging still uses the same command:

`corepack pnpm package:windows`

You can drive signing locally either by setting:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

or by setting:

- `WINDOWS_CERTIFICATE_PFX_BASE64`
- `WINDOWS_CERTIFICATE_PASSWORD`

If you want local packaging to fail when signing is missing, set:

`ARGUMENT_CRITIC_REQUIRE_CODE_SIGNING=true`