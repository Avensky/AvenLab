import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const dataServerDir = path.join(rootDir, "data-server");
const appDir = path.join(dataServerDir, "app");

if (!existsSync(appDir)) {
  console.error(
    `[check:data] Data-server app directory was not found: ${appDir}`,
  );
  process.exit(1);
}

const interpreterCandidates = [];

if (process.env.DATA_PYTHON?.trim()) {
  const configuredPython = process.env.DATA_PYTHON.trim();

  interpreterCandidates.push({
    command: configuredPython,
    prefixArgs: [],
    requiresFile: path.isAbsolute(configuredPython),
    label: `DATA_PYTHON=${configuredPython}`,
  });
}

if (process.platform === "win32") {
  interpreterCandidates.push(
    {
      command: path.join(
        dataServerDir,
        ".venv",
        "Scripts",
        "python.exe",
      ),
      prefixArgs: [],
      requiresFile: true,
      label: "data-server/.venv/Scripts/python.exe",
    },
    {
      command: path.join(
        dataServerDir,
        "venv",
        "Scripts",
        "python.exe",
      ),
      prefixArgs: [],
      requiresFile: true,
      label: "data-server/venv/Scripts/python.exe",
    },
    {
      command: "py",
      prefixArgs: ["-3"],
      requiresFile: false,
      label: "py -3",
    },
    {
      command: "python",
      prefixArgs: [],
      requiresFile: false,
      label: "python",
    },
  );
} else {
  interpreterCandidates.push(
    {
      command: path.join(
        dataServerDir,
        ".venv",
        "bin",
        "python",
      ),
      prefixArgs: [],
      requiresFile: true,
      label: "data-server/.venv/bin/python",
    },
    {
      command: path.join(
        dataServerDir,
        "venv",
        "bin",
        "python",
      ),
      prefixArgs: [],
      requiresFile: true,
      label: "data-server/venv/bin/python",
    },
    {
      command: "python3",
      prefixArgs: [],
      requiresFile: false,
      label: "python3",
    },
    {
      command: "python",
      prefixArgs: [],
      requiresFile: false,
      label: "python",
    },
  );
}

function probeInterpreter(candidate) {
  if (candidate.requiresFile && !existsSync(candidate.command)) {
    return false;
  }

  const probe = spawnSync(
    candidate.command,
    [...candidate.prefixArgs, "--version"],
    {
      cwd: dataServerDir,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
      windowsHide: true,
    },
  );

  return !probe.error && probe.status === 0;
}

const interpreter = interpreterCandidates.find(probeInterpreter);

if (!interpreter) {
  console.error("[check:data] No usable Python interpreter was found.");
  console.error("[check:data] Checked:");

  for (const candidate of interpreterCandidates) {
    console.error(`  - ${candidate.label}`);
  }

  console.error(
    process.platform === "win32"
      ? "\nInstall Python or create the venv with: py -3 -m venv data-server/.venv"
      : "\nInstall python3 or create the venv with: python3 -m venv data-server/.venv",
  );

  process.exit(1);
}

console.log(`[check:data] Using ${interpreter.label}`);

const result = spawnSync(
  interpreter.command,
  [
    ...interpreter.prefixArgs,
    "-m",
    "compileall",
    "app",
  ],
  {
    cwd: dataServerDir,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  },
);

if (result.error) {
  console.error(
    `[check:data] Failed to execute ${interpreter.label}`,
  );
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    `[check:data] Python compile check failed with exit code ${result.status}.`,
  );
  process.exit(result.status ?? 1);
}

console.log("[check:data] Python syntax check passed.");