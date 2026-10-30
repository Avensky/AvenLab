#!/usr/bin/env node
/** AvenLab source updater. Preview by default; --apply backs up every original
 * before writing. Only manifest files change; folders are never batch-deleted.
 * Node 24 recommended, no npm dependencies. See README.md for apply/undo steps. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const textHash = (bytes) =>
  hash(Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n")));
const exists = (file) => {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
};

function safePath(value) {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9_.,/-]+$/.test(value) ||
    value.startsWith("/") ||
    value.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error(`Invalid update path: ${value}`);
  return value;
}

// Check every existing component, including Windows directory junctions. A
// missing path is allowed; an existing directory in place of a file is not.
function localFile(root, relative) {
  const parts = safePath(relative).split("/");
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (!exists(current)) return null;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink())
      throw new Error(`Refusing a symlink/junction: ${current}`);
    if (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())
      throw new Error(`Unexpected file/folder at: ${current}`);
  }
  return current;
}
const currentHash = (root, relative) => {
  const file = localFile(root, relative);
  return file ? hash(fs.readFileSync(file)) : null;
};

function repository(directory) {
  const root = fs.realpathSync(path.resolve(directory));
  for (const marker of [
    "frontend/package.json",
    "avenlab-server/Cargo.toml",
    "data-server/app/main.py",
  ])
    if (!localFile(root, marker))
      throw new Error(
        `Select your AvenLab repository root. Missing: ${marker}`,
      );
  return root;
}

/** Verify the complete payload before any destination or backup is written. */
export function loadPackage(directory = here) {
  const folder = fs.realpathSync(directory);
  const manifest = JSON.parse(
    fs.readFileSync(localFile(folder, "manifest.json"), "utf8"),
  );
  if (
    manifest.schema !== 2 ||
    manifest.repository !== "Avensky/AvenLab" ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length ||
    !Array.isArray(manifest.deleted_paths)
  )
    throw new Error("Invalid AvenLab update package. Extract the ZIP again.");
  const paths = new Set();
  for (const entry of [
    ...manifest.files,
    ...manifest.deleted_paths.map((p) => ({ path: p })),
  ]) {
    safePath(entry.path);
    const key = entry.path.toLowerCase();
    if (paths.has(key)) throw new Error(`Duplicate update path: ${entry.path}`);
    paths.add(key);
  }
  for (const entry of manifest.files) {
    const file = localFile(path.join(folder, "files"), entry.path);
    if (!file || hash(fs.readFileSync(file)) !== entry.sha256)
      throw new Error(
        `Incomplete or edited payload: ${entry.path}. Extract the original ZIP again.`,
      );
  }
  return { folder, manifest };
}

/** A read-only plan works on the GitHub base or an already copied update. */
export function planUpdate(directory, packageDirectory = here) {
  const root = repository(directory),
    { folder, manifest } = loadPackage(packageDirectory);
  const entries = [],
    edited = [];
  for (const entry of manifest.files) {
    const before = currentHash(root, entry.path);
    if (before === entry.sha256) continue;
    const file = localFile(root, entry.path);
    if (
      file &&
      entry.known_text_hashes &&
      !entry.known_text_hashes.includes(textHash(fs.readFileSync(file)))
    )
      edited.push(entry.path);
    entries.push({ path: entry.path, before, after: entry.sha256 });
  }
  for (const relative of manifest.deleted_paths) {
    const before = currentHash(root, relative);
    if (before !== null) entries.push({ path: relative, before, after: null });
  }
  return {
    root,
    packageDirectory: folder,
    entries,
    edited,
    baseCommit: manifest.base_commit,
  };
}

function journal(folder, record) {
  const destination = path.join(folder, "restore.json");
  fs.writeFileSync(
    destination + ".tmp",
    JSON.stringify(record, null, 2) + "\n",
  );
  fs.renameSync(destination + ".tmp", destination);
}

// Temp + rename prevents truncated source on interrupted writes. Only exact
// files are unlinked during removal/undo; newly empty directories can remain.
function atomicWrite(root, relative, bytes, mode) {
  localFile(root, relative);
  const destination = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temp =
    destination + ".avenlab-update-" + crypto.randomBytes(5).toString("hex");
  try {
    fs.writeFileSync(temp, bytes, { flag: "wx", ...(mode ? { mode } : {}) });
    fs.renameSync(temp, destination);
  } finally {
    if (exists(temp)) fs.unlinkSync(temp);
  }
}

/** Restore all entries only after preflighting them all. Newer edits stop undo
 * before it changes anything, so an old backup cannot silently erase new work. */
export function restoreUpdate(directory) {
  const folder = fs.realpathSync(directory);
  const record = JSON.parse(
    fs.readFileSync(localFile(folder, "restore.json"), "utf8"),
  );
  if (
    record.schema !== 1 ||
    record.kind !== "avenlab-source-update" ||
    !Array.isArray(record.entries)
  )
    throw new Error("Invalid AvenLab restore record.");
  const root = repository(record.root),
    pending = [];
  for (const entry of record.entries) {
    safePath(entry.path);
    const current = currentHash(root, entry.path);
    if (current === entry.before) continue;
    if (current !== entry.after)
      throw new Error(
        `Undo stopped before changing files: newer edit at ${entry.path}`,
      );
    let bytes = null,
      mode;
    if (entry.before !== null) {
      const original = localFile(path.join(folder, "files"), entry.path);
      if (
        !original ||
        hash((bytes = fs.readFileSync(original))) !== entry.before
      )
        throw new Error(`Missing or edited backup: ${entry.path}`);
      mode = fs.statSync(original).mode;
    }
    pending.push({ ...entry, bytes, mode });
  }
  for (const entry of pending) {
    if (entry.bytes) atomicWrite(root, entry.path, entry.bytes, entry.mode);
    else fs.unlinkSync(localFile(root, entry.path));
  }
  record.state = "restored";
  journal(folder, record);
  return pending.length;
}

/** Back up every original first. On an ordinary write error, undo this run; a
 * recovery journal also covers interruption and concurrent-file-change errors. */
export function applyUpdate(plan) {
  const fresh = planUpdate(plan.root, plan.packageDirectory);
  if (JSON.stringify(fresh.entries) !== JSON.stringify(plan.entries))
    throw new Error(
      "Files changed since preview. Rerun the updater; no files changed.",
    );
  if (!fresh.entries.length) return null;
  const parent = path.join(
    path.dirname(fresh.root),
    path.basename(fresh.root) + "-update-backups",
  );
  if (
    exists(parent) &&
    (fs.lstatSync(parent).isSymbolicLink() ||
      !fs.lstatSync(parent).isDirectory())
  )
    throw new Error(`Invalid backup folder: ${parent}`);
  fs.mkdirSync(parent, { recursive: true });
  const backup = path.join(
    parent,
    new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      crypto.randomBytes(4).toString("hex"),
  );
  fs.mkdirSync(backup);
  const record = {
    schema: 1,
    kind: "avenlab-source-update",
    root: fresh.root,
    baseCommit: fresh.baseCommit,
    createdAt: new Date().toISOString(),
    state: "backing-up",
    entries: fresh.entries,
  };
  journal(backup, record);
  try {
    for (const entry of fresh.entries) {
      if (entry.before === null) continue;
      const source = localFile(fresh.root, entry.path);
      const destination = path.join(backup, "files", ...entry.path.split("/"));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      if (
        hash(fs.readFileSync(destination)) !== entry.before ||
        currentHash(fresh.root, entry.path) !== entry.before
      )
        throw new Error(`File changed during backup: ${entry.path}`);
    }
    record.state = "applying";
    journal(backup, record);
    // Writes precede deletions: every replacement is present before stale flat
    // modules can be removed (including SandBox.tsx on Windows).
    for (const entry of fresh.entries) {
      if (currentHash(fresh.root, entry.path) !== entry.before)
        throw new Error(`File changed during update: ${entry.path}`);
      if (entry.after !== null) {
        const source = localFile(
          path.join(fresh.packageDirectory, "files"),
          entry.path,
        );
        const bytes = fs.readFileSync(source);
        if (hash(bytes) !== entry.after)
          throw new Error(`Payload changed: ${entry.path}`);
        atomicWrite(fresh.root, entry.path, bytes, fs.statSync(source).mode);
      } else fs.unlinkSync(localFile(fresh.root, entry.path));
    }
    record.state = "complete";
    journal(backup, record);
    return backup;
  } catch (error) {
    try {
      restoreUpdate(backup);
    } catch (recovery) {
      throw new Error(
        `${error.message}\nRecovery requires attention: ${recovery.message}\nBackup: ${backup}`,
      );
    }
    throw new Error(
      `${error.message}\nThis run was rolled back. Backup: ${backup}`,
    );
  }
}

function main(argv) {
  let repo = process.cwd(),
    apply = false,
    restore = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") apply = true;
    else if (argv[i] === "--repo" && argv[i + 1]) repo = argv[++i];
    else if (argv[i] === "--restore" && argv[i + 1]) restore = argv[++i];
    else if (argv[i] === "--help") {
      console.log(
        'Preview: node apply-update.mjs --repo "path to AvenLab"\nApply: add --apply\nUndo: node apply-update.mjs --restore "printed backup folder"',
      );
      return;
    } else throw new Error(`Unknown/incomplete option: ${argv[i]}`);
  }
  if (restore) {
    if (apply) throw new Error("Use either --apply or --restore.");
    console.log(`Restored ${restoreUpdate(restore)} files.`);
    return;
  }
  const plan = planUpdate(repo),
    writes = plan.entries.filter((e) => e.after !== null).length;
  console.log(
    `Repository: ${plan.root}\nFiles to copy: ${writes}\nStale files to archive/remove: ${plan.entries.length - writes}\nCustom/edited affected files: ${plan.edited.length} (backed up before replacement)`,
  );
  if (!plan.entries.length) {
    console.log("Already current. No files changed.");
    return;
  }
  if (!apply) {
    for (const e of plan.entries)
      console.log(`  ${e.after === null ? "REMOVE" : "COPY"} ${e.path}`);
    console.log(
      "\nPREVIEW ONLY. Add --apply to back up and apply these exact changes.",
    );
    return;
  }
  const backup = applyUpdate(plan);
  console.log(
    `Update complete. Backup: ${backup}\nUndo: node apply-update.mjs --restore "${backup}"\nNext: npm --prefix frontend ci, then npm --prefix frontend run build. Rebuild/restart Rust too.`,
  );
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
