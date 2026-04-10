import { access, mkdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const minimumMajor = 22;
const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const desktopPackageRequire = createRequire(new URL("../apps/desktop/package.json", import.meta.url));

function assertNodeVersion(): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major < minimumMajor) {
    throw new Error(`Argument Critic requires Node ${minimumMajor}+; found ${process.versions.node}.`);
  }
}

function canRun(command: string, args: string[]): boolean {
  const result = process.platform === "win32"
    ? spawnSync([command, ...args].join(" "), {
        stdio: "ignore",
        shell: true
      })
    : spawnSync(command, args, {
        stdio: "ignore"
      });

  return result.status === 0;
}

function assertPackageManagerAvailable(): void {
  if (canRun("corepack", ["pnpm", "--version"])) {
    return;
  }

  if (canRun("pnpm", ["--version"])) {
    return;
  }

  throw new Error("Corepack or pnpm is required but was not available. Install Node.js 22+, reopen the terminal, and try again.");
}

async function ensureWritableDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await access(path, fsConstants.W_OK);
}

function ensureElectronAvailable(): void {
  try {
    const executable = desktopPackageRequire("electron");
    if (typeof executable === "string" && executable.trim()) {
      return;
    }
  } catch {
    const entryPath = desktopPackageRequire.resolve("electron");
    const installResult = spawnSync(process.execPath, [join(dirname(entryPath), "install.js")], {
      cwd: rootDir,
      stdio: "inherit"
    });

    if (installResult.status !== 0) {
      throw new Error("Electron could not be installed correctly. Delete node_modules and run Install Argument Critic.cmd again.");
    }

    const executable = desktopPackageRequire("electron");
    if (typeof executable !== "string" || !executable.trim()) {
      throw new Error("Electron could not be resolved after repair. Delete node_modules and run Install Argument Critic.cmd again.");
    }
  }
}

async function main(): Promise<void> {
  assertNodeVersion();
  assertPackageManagerAvailable();
  ensureElectronAvailable();

  const requiredDirectories = [
    join(rootDir, "data"),
    join(rootDir, "data", "attachments"),
    join(rootDir, "data", "reports"),
    join(rootDir, "data", "research-imports"),
    join(rootDir, "data", "runtime")
  ];

  for (const directory of requiredDirectories) {
    await ensureWritableDirectory(directory);
  }

  process.stdout.write("Argument Critic prerequisites verified.\n");
  process.stdout.write("Run `corepack pnpm build` after dependencies are installed if you want the prebuilt desktop fast-start path.\n");
  process.stdout.write("On Windows, use `Install Argument Critic.cmd` once and then `Start Argument Critic.cmd` for normal launches.\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});