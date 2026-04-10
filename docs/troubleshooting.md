# Troubleshooting

## Install Did Not Finish

If `Install Argument Critic.cmd` stops with an error:

1. read the message in the installer window
2. fix that one problem first
3. run the installer again

Common reasons:

- `winget` is missing
- Node.js could not be installed or upgraded
- the internet connection dropped during dependency install

## The App Does Not Open

Check these first:

1. Did you run `Install Argument Critic.cmd` first?
2. Did you leave the launcher window open after using `Start Argument Critic.cmd`?
3. Did the launcher window show an error message?

If the launcher window reports a startup error, fix that issue and start again.

## GitHub Sign-In Does Not Work

If the browser sign-in flow does not complete:

1. open Settings and try `Sign in with GitHub` again
2. finish the approval step in the browser
3. return to the app and wait a moment

If the app says direct browser sign-in is not enabled for this build, that is a maintainer configuration issue, not something a normal user should have to fix.

## No Models Are Showing Up

If the model list is empty:

1. make sure sign-in completed successfully
2. wait a moment for the app to refresh access
3. open Settings and confirm the credential was stored

## Capture Is Not Working

Capture works through the desktop shell.

If capture fails:

1. make sure you are using the desktop app
2. try the capture action again
3. restart the app if the capture session was interrupted

## The App Was Closed Unexpectedly

Start it again with `Start Argument Critic.cmd`.

The app keeps its own cleanup records and should recover from most interrupted runs automatically.

## Advanced Cleanup

If you know how to use a terminal and the app had a badly interrupted run, you can use:

`corepack pnpm cleanup`

That runs the same stale-process cleanup logic without launching the app.