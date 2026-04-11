# Troubleshooting

## Install Did Not Finish

If `Argument-Critic-Setup.exe` stops with an error:

1. read the message in the installer window
2. fix that one problem first
3. run the installer again

Common reasons:

- Windows blocked or interrupted the installer
- the installer could not write to the chosen install location
- the download was incomplete

## The App Does Not Open

Check these first:

1. Did you finish the Windows installer?
2. Did you launch the app from the Start Menu or desktop shortcut?
3. If you are running from source instead, did you run `Install Argument Critic.cmd` first?

If the installed app reports a startup error, close it fully and open it again from the Start Menu.

If the source launcher window reports a startup error, fix that issue and start again.

## GitHub Sign-In Does Not Work

If the browser sign-in flow does not complete:

1. open Settings and try `Sign in with GitHub` again
2. finish the approval step in the browser
3. return to the app and wait a moment

If the installed app says the GitHub sign-in helper is missing, reinstall the latest release.

If you are running from a source checkout and sign-in says the helper is missing, run `Install Argument Critic.cmd` again.

## No Models Are Showing Up

If the model list is empty:

1. make sure sign-in completed successfully
2. wait a moment for the app to refresh access
3. open Settings and confirm the credential was stored

If GitHub sign-in completed but you only see a single older Azure OpenAI model such as `GPT-4o`, remove the stored credential in Settings and sign in again so the app can import a fresh token.

If you pasted a manual token and only see GitHub Models, that is expected for many normal GitHub tokens. Use `Sign in with GitHub` if you need the broader Copilot model catalog.

## Capture Is Not Working

Capture works through the desktop shell.

If capture fails:

1. make sure you are using the desktop app
2. try the capture action again
3. restart the app if the capture session was interrupted

## The App Was Closed Unexpectedly

Start it again from the Start Menu or desktop shortcut.

The app keeps its own cleanup records and should recover from most interrupted runs automatically.

## Advanced Cleanup

If you are running from a source checkout and the app had a badly interrupted run, you can use:

`corepack pnpm cleanup`

That runs the same stale-process cleanup logic without launching the app.