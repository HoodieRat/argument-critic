import type { FastifyInstance } from "fastify";

import type { AppServices } from "../app.js";

export async function registerHealthRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.get("/", async (request, reply) => {
    reply.type("text/html; charset=utf-8");
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Argument Critic Ready</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #f7f0e7 0%, #efe1cf 100%);
        color: #2b2119;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }
      main {
        width: min(42rem, calc(100vw - 2rem));
        padding: 1.5rem;
        border-radius: 20px;
        background: rgba(255, 250, 244, 0.9);
        box-shadow: 0 16px 40px rgba(43, 33, 25, 0.12);
        border: 1px solid rgba(43, 33, 25, 0.08);
      }
      h1 {
        margin-top: 0;
        font-family: Georgia, serif;
      }
      .actions {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin: 1rem 0;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 0.75rem 1rem;
        text-decoration: none;
        font-weight: 600;
      }
      .primary {
        background: linear-gradient(135deg, #9e3d22 0%, #d8815d 100%);
        color: #fff8f3;
      }
      .secondary {
        background: rgba(155, 61, 33, 0.12);
        color: #5f3424;
      }
      ol {
        padding-left: 1.2rem;
      }
      code {
        padding: 0.1rem 0.35rem;
        border-radius: 999px;
        background: rgba(155, 61, 33, 0.12);
      }
    </style>
  </head>
  <body>
    <main>
      <p>Argument Critic</p>
      <h1>The local companion is running.</h1>
      <p>The desktop drawer should open automatically when you start the app. If you are looking at this page directly, the local API is healthy and waiting for the desktop shell to connect.</p>
      <ol>
        <li>Open the installed Argument Critic app, or run <strong>Start Argument Critic.cmd</strong> from a source checkout.</li>
        <li>Wait for the desktop drawer window to open.</li>
        <li>If this is your first run, open Settings and use GitHub sign-in or enter a credential manually.</li>
      </ol>
      <p>Health check: <code>/health</code></p>
    </main>
  </body>
</html>`;
  });

  app.get("/favicon.ico", async (_, reply) => {
    reply.code(204);
    return null;
  });

  app.get("/health", async () => ({
    ok: true,
    app: "argument-critic",
    sessions: services.sessionsRepository.count()
  }));
}