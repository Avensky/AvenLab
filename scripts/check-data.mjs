import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const dataServerDir = path.join(rootDir, "data-server");

const candidates =
  process.platform === "win32"
    ? [
        path.join(dataServerDir, ".venv", "Scripts", "python.exe"),
        path.join(dataServerDir, "venv", "Scripts", "python.exe"),
      ]
    : [
        path.join(dataServerDir, ".venv", "bin", "python"),
        path.join(dataServerDir, "venv", "bin", "python"),
      ];

const pythonPath = candidates.find(existsSync);

if (!pythonPath) {
  console.error("Data-server Python virtual environment was not found.");
  console.error("Checked:");
  for (const candidate of candidates) {
    console.error(`  - ${candidate}`);
  }

  console.error(
    process.platform === "win32"
      ? "\nCreate it with: py -3 -m venv data-server/.venv"
      : "\nCreate it with: python3 -m venv data-server/.venv",
  );

  process.exit(1);
}

const result = spawnSync(pythonPath, ["-m", "compileall", "app"], {
  cwd: dataServerDir,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Failed to execute ${pythonPath}`);
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);