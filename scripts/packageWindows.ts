import { spawn, spawnSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(modulePath), "..");
const require = createRequire(import.meta.url);
const electronBuilderCliPath = require.resolve("electron-builder/out/cli/cli.js");
const corepackScriptPath = join(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js");
const excludedRelativePaths = [
  ".git",
  "data",
  "dist",
  "node_modules",
  "apps/desktop/dist",
  "apps/extension/dist",
  "apps/server/dist"
];
const githubCliBinaryName = process.platform === "win32" ? "gh.exe" : "gh";

function resolvePowerShellExecutable(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (systemRoot) {
    return join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  }

  return "powershell.exe";
}

function resolveCommandOnPath(command: string): string | null {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], {
    windowsHide: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    return null;
  }

  const resolved = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);

  return resolved ?? null;
}

function resolveInstalledGitHubCli(): string | null {
  const explicit = process.env.GH_PATH?.trim();
  if (explicit) {
    return explicit;
  }

  const candidates = [
    join(process.env.ProgramFiles ?? "", "GitHub CLI", githubCliBinaryName),
    join(process.env.ProgramFiles ?? "", "GitHub CLI", "bin", githubCliBinaryName),
    join(process.env.LOCALAPPDATA ?? "", "Programs", "GitHub CLI", githubCliBinaryName),
    join(process.env.LOCALAPPDATA ?? "", "Programs", "GitHub CLI", "bin", githubCliBinaryName)
  ].filter((candidate) => candidate.length > 0);

  for (const candidate of candidates) {
    if (spawnSync(candidate, ["--version"], {
      windowsHide: true,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).status === 0) {
      return candidate;
    }
  }

  return resolveCommandOnPath("gh");
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream, application/vnd.github+json",
      "User-Agent": "ArgumentCriticPackager/1.0.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Download failed with ${response.status} for ${url}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, bytes);
}

async function expandZipArchive(zipPath: string, destinationDir: string): Promise<void> {
  await runCommand(
    resolvePowerShellExecutable(),
    [
      "-NoLogo",
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`
    ],
    rootDir,
    process.env
  );
}

async function findFileRecursive(rootPath: string, fileName: string): Promise<string | null> {
  const entries = await readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(rootPath, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return entryPath;
    }

    if (entry.isDirectory()) {
      const nested = await findFileRecursive(entryPath, fileName);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

async function resolveLatestGitHubCliArchiveUrl(): Promise<string> {
  const response = await fetch("https://api.github.com/repos/cli/cli/releases/latest", {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ArgumentCriticPackager/1.0.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Could not read the latest GitHub CLI release metadata: ${response.status}.`);
  }

  const payload = await response.json() as {
    assets?: Array<{ name?: string; browser_download_url?: string }>;
  };
  const asset = payload.assets?.find((candidate) => {
    const name = candidate.name?.toLowerCase() ?? "";
    return /windows_(amd64|x86_64)\.zip$/.test(name);
  });

  if (!asset?.browser_download_url) {
    throw new Error("Could not find a Windows GitHub CLI release asset to bundle.");
  }

  return asset.browser_download_url;
}

async function prepareBundledGitHubCli(stageDir: string): Promise<void> {
  const vendorDir = join(stageDir, "vendor", "github-cli");
  await mkdir(vendorDir, { recursive: true });

  const installedCli = resolveInstalledGitHubCli();
  if (installedCli) {
    await copyFile(installedCli, join(vendorDir, githubCliBinaryName));
    return;
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "argument-critic-gh-"));
  const archivePath = join(tempRoot, "github-cli.zip");
  const extractDir = join(tempRoot, "expanded");

  try {
    await mkdir(extractDir, { recursive: true });
    await downloadFile(await resolveLatestGitHubCliArchiveUrl(), archivePath);
    await expandZipArchive(archivePath, extractDir);

    const binaryPath = await findFileRecursive(extractDir, githubCliBinaryName);
    if (!binaryPath) {
      throw new Error("The downloaded GitHub CLI archive did not contain gh.exe.");
    }

    await copyFile(binaryPath, join(vendorDir, githubCliBinaryName));

    const licensePath = await findFileRecursive(extractDir, "LICENSE");
    if (licensePath) {
      await copyFile(licensePath, join(vendorDir, "LICENSE"));
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function isTruthyEnv(value: string | undefined): boolean {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

async function prepareCodeSigningEnvironment(baseEnv: NodeJS.ProcessEnv, tempRoot: string): Promise<NodeJS.ProcessEnv> {
  if (baseEnv.CSC_LINK?.trim()) {
    return baseEnv;
  }

  const certificateBase64 = baseEnv.WINDOWS_CERTIFICATE_PFX_BASE64?.replace(/\s+/gu, "") ?? "";
  const certificatePassword = baseEnv.WINDOWS_CERTIFICATE_PASSWORD?.trim() ?? "";

  if ((certificateBase64 && !certificatePassword) || (!certificateBase64 && certificatePassword)) {
    throw new Error("WINDOWS_CERTIFICATE_PFX_BASE64 and WINDOWS_CERTIFICATE_PASSWORD must be provided together.");
  }

  if (!certificateBase64) {
    if (isTruthyEnv(baseEnv.ARGUMENT_CRITIC_REQUIRE_CODE_SIGNING)) {
      throw new Error(
        "Windows code signing was required for this build, but no signing certificate was configured. Set CSC_LINK/CSC_KEY_PASSWORD or WINDOWS_CERTIFICATE_PFX_BASE64/WINDOWS_CERTIFICATE_PASSWORD."
      );
    }

    return baseEnv;
  }

  const certificateDir = join(tempRoot, "code-signing");
  const certificatePath = join(certificateDir, "windows-code-signing.pfx");
  await mkdir(certificateDir, { recursive: true });
  await writeFile(certificatePath, Buffer.from(certificateBase64, "base64"));
  process.stdout.write("Using the configured Windows code-signing certificate for packaging.\n");

  return {
    ...baseEnv,
    CSC_LINK: certificatePath,
    CSC_KEY_PASSWORD: certificatePassword
  };
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function shouldCopyPath(sourcePath: string): boolean {
  const relativePath = normalizePath(relative(rootDir, sourcePath));
  if (!relativePath || relativePath === "") {
    return true;
  }

  const pathSegments = relativePath.split("/");
  if (pathSegments.includes("node_modules")) {
    return false;
  }

  return !excludedRelativePaths.some((excludedPath) => relativePath === excludedPath || relativePath.startsWith(`${excludedPath}/`));
}

async function createPnpmShimDirectory(): Promise<string> {
  const shimDir = await mkdtemp(join(tmpdir(), "argument-critic-pnpm-"));
  const shimPath = join(shimDir, process.platform === "win32" ? "pnpm.cmd" : "pnpm");
  const shimContents = process.platform === "win32"
    ? `@echo off\r\ncall "${process.execPath}" "${corepackScriptPath}" pnpm %*\r\n`
    : `#!/usr/bin/env sh\n"${process.execPath}" "${corepackScriptPath}" pnpm "$@"\n`;

  await writeFile(shimPath, shimContents, {
    encoding: "utf8",
    mode: 0o755
  });

  return shimDir;
}

async function runCommand(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit"
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolveCommand();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}.`));
    });
  });
}

async function createPackagingWorkspace(): Promise<{ stageRoot: string; stageDir: string }> {
  const stageRoot = await mkdtemp(join(tmpdir(), "argument-critic-package-"));
  const stageDir = join(stageRoot, "workspace");
  await cp(rootDir, stageDir, {
    recursive: true,
    filter: async (sourcePath) => shouldCopyPath(resolve(sourcePath))
  });
  return { stageRoot, stageDir };
}

async function copyReleaseArtifacts(stageDir: string): Promise<void> {
  const stageReleaseDir = join(stageDir, "dist", "release");
  const targetReleaseDir = join(rootDir, "dist", "release");
  await rm(targetReleaseDir, { recursive: true, force: true });
  await cp(stageReleaseDir, targetReleaseDir, { recursive: true });
}

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Windows packaging is only supported on Windows hosts.");
  }

  const shimDir = await createPnpmShimDirectory();
  const { stageRoot, stageDir } = await createPackagingWorkspace();
  const baseEnv = {
    ...process.env,
    PATH: `${shimDir};${process.env.PATH ?? ""}`
  };
  const env = await prepareCodeSigningEnvironment(baseEnv, stageRoot);
  const electronBuilderArgs = ["--win", "nsis", "--publish", "never"];
  if (env.CSC_LINK?.trim()) {
    electronBuilderArgs.push("-c.win.signAndEditExecutable=true");
  }

  try {
    await runCommand(process.execPath, [corepackScriptPath, "pnpm", "install", "--frozen-lockfile"], stageDir, env);
    await runCommand(process.execPath, [corepackScriptPath, "pnpm", "build"], stageDir, env);
    await prepareBundledGitHubCli(stageDir);
    await runCommand(process.execPath, [electronBuilderCliPath, ...electronBuilderArgs], stageDir, env);
    await copyReleaseArtifacts(stageDir);
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
    await rm(shimDir, { recursive: true, force: true });
  }
}

await main();