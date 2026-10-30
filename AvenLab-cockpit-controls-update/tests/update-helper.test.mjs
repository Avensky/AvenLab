/** The installer changes real source files. These small fixtures check its
 * transaction, exact-path cleanup, backups, refusal cases and safe undo. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { planUpdate, applyUpdate, restoreUpdate } from "../apply-update.mjs";

const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const put = (root, file, data) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
};
function fixture(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "avenlab-updater-test-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const repo = path.join(directory, "AvenLab"),
    bundle = path.join(directory, "package");
  for (const file of [
    "frontend/package.json",
    "avenlab-server/Cargo.toml",
    "data-server/app/main.py",
  ])
    put(repo, file, "repository marker\n");
  put(repo, "frontend/src/example.ts", "custom existing source\r\n");
  put(repo, "frontend/src/stale.ts", "old flat module\n");
  put(repo, "my-notes.txt", "keep my own work\n");
  const contents = {
    "frontend/src/example.ts": "export const value = 2;\n",
    "frontend/src/new-feature/index.ts": "export const added = true;\n",
  };
  const manifest = {
    schema: 2,
    repository: "Avensky/AvenLab",
    base_commit: "fixture",
    files: Object.entries(contents).map(([file, data]) => ({
      path: file,
      sha256: hash(data),
      known_text_hashes: [hash("old source\n")],
    })),
    deleted_paths: ["frontend/src/stale.ts"],
  };
  for (const [file, data] of Object.entries(contents))
    put(bundle, "files/" + file, data);
  const saveManifest = () =>
    put(bundle, "manifest.json", JSON.stringify(manifest));
  saveManifest();
  const plan = () => planUpdate(repo, bundle);
  return {
    directory,
    repo,
    bundle,
    manifest,
    saveManifest,
    plan,
    read: (file) => fs.readFileSync(path.join(repo, file), "utf8"),
    original: "custom existing source\r\n",
  };
}

test("preview is read-only and identifies edited source without losing it", (t) => {
  const f = fixture(t),
    plan = f.plan();
  assert.equal(plan.entries.length, 3);
  assert.deepEqual(plan.edited, ["frontend/src/example.ts"]);
  assert.equal(f.read("frontend/src/example.ts"), f.original);
  assert.equal(
    fs.existsSync(path.join(f.directory, "AvenLab-update-backups")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(f.repo, "frontend/src/new-feature")),
    false,
  );
});
test("apply verifies backups, copies replacements, removes exact stale files and keeps unrelated work", (t) => {
  const f = fixture(t),
    backup = applyUpdate(f.plan());
  assert.equal(f.read("frontend/src/example.ts"), "export const value = 2;\n");
  assert.equal(
    f.read("frontend/src/new-feature/index.ts"),
    "export const added = true;\n",
  );
  assert.equal(
    fs.existsSync(path.join(f.repo, "frontend/src/stale.ts")),
    false,
  );
  assert.equal(
    fs.readFileSync(path.join(backup, "files/frontend/src/example.ts"), "utf8"),
    f.original,
  );
  assert.equal(
    fs.readFileSync(path.join(backup, "files/frontend/src/stale.ts"), "utf8"),
    "old flat module\n",
  );
  assert.equal(f.read("my-notes.txt"), "keep my own work\n");
  assert.equal(
    path.dirname(backup),
    path.join(f.directory, "AvenLab-update-backups"),
  );
});
test("reapplying an installed update is a no-op", (t) => {
  const f = fixture(t);
  applyUpdate(f.plan());
  assert.equal(f.plan().entries.length, 0);
  assert.equal(applyUpdate(f.plan()), null);
});
test("undo restores byte-exact originals and stale files, removes additions, and can run twice", (t) => {
  const f = fixture(t),
    backup = applyUpdate(f.plan());
  assert.equal(restoreUpdate(backup), 3);
  assert.equal(f.read("frontend/src/example.ts"), f.original);
  assert.equal(f.read("frontend/src/stale.ts"), "old flat module\n");
  assert.equal(
    fs.existsSync(path.join(f.repo, "frontend/src/new-feature/index.ts")),
    false,
  );
  assert.equal(restoreUpdate(backup), 0);
});
test("a newer edit blocks the entire undo before any file is restored", (t) => {
  const f = fixture(t),
    backup = applyUpdate(f.plan());
  put(f.repo, "frontend/src/new-feature/index.ts", "newer work\n");
  assert.throws(() => restoreUpdate(backup), /newer edit/);
  assert.equal(f.read("frontend/src/example.ts"), "export const value = 2;\n");
  assert.equal(f.read("frontend/src/new-feature/index.ts"), "newer work\n");
  assert.equal(
    fs.existsSync(path.join(f.repo, "frontend/src/stale.ts")),
    false,
  );
});
test("edited payload is refused before changing or backing up source", (t) => {
  const f = fixture(t);
  put(f.bundle, "files/frontend/src/example.ts", "broken payload");
  assert.throws(f.plan, /Incomplete or edited payload/);
  assert.equal(f.read("frontend/src/example.ts"), f.original);
  assert.equal(
    fs.existsSync(path.join(f.directory, "AvenLab-update-backups")),
    false,
  );
});
test("missing payload is refused before source changes", (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.bundle, "files/frontend/src/new-feature/index.ts"));
  assert.throws(f.plan, /Incomplete or edited payload/);
  assert.equal(f.read("frontend/src/stale.ts"), "old flat module\n");
});
test("relative traversal in a manifest is refused", (t) => {
  const f = fixture(t);
  f.manifest.deleted_paths.push("../outside.txt");
  f.saveManifest();
  assert.throws(f.plan, /Invalid update path/);
  assert.equal(f.read("frontend/src/example.ts"), f.original);
});
test("an existing directory in a file deletion slot is refused", (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.repo, "frontend/src/stale.ts"));
  fs.mkdirSync(path.join(f.repo, "frontend/src/stale.ts"));
  assert.throws(f.plan, /Unexpected file\/folder/);
  assert.equal(f.read("frontend/src/example.ts"), f.original);
});
test("a symlink or junction in a source parent is refused", (t) => {
  const f = fixture(t),
    outside = path.join(f.directory, "outside");
  fs.mkdirSync(outside);
  put(outside, "index.ts", "external source\n");
  fs.symlinkSync(
    outside,
    path.join(f.repo, "frontend/src/new-feature"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(f.plan, /symlink\/junction/);
  assert.equal(
    fs.readFileSync(path.join(outside, "index.ts"), "utf8"),
    "external source\n",
  );
});
test("missing repository markers stop installation", (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.repo, "avenlab-server/Cargo.toml"));
  assert.throws(f.plan, /repository root/);
  assert.equal(f.read("frontend/src/example.ts"), f.original);
});
test("a file changed after preview is retained and application is refused", (t) => {
  const f = fixture(t),
    plan = f.plan();
  put(f.repo, "frontend/src/example.ts", "changed after preview\n");
  assert.throws(() => applyUpdate(plan), /changed since preview/);
  assert.equal(f.read("frontend/src/example.ts"), "changed after preview\n");
  assert.equal(
    fs.existsSync(path.join(f.directory, "AvenLab-update-backups")),
    false,
  );
});
test("a write failure rolls back an earlier copied file and retains the originals", (t) => {
  const f = fixture(t),
    originalRename = fs.renameSync;
  let failed = false;
  fs.renameSync = (from, to) => {
    if (
      !failed &&
      to === path.join(f.repo, "frontend/src/new-feature/index.ts")
    ) {
      failed = true;
      throw new Error("simulated file lock");
    }
    return originalRename(from, to);
  };
  try {
    assert.throws(() => applyUpdate(f.plan()), /This run was rolled back/);
  } finally {
    fs.renameSync = originalRename;
  }
  assert.equal(failed, true);
  assert.equal(f.read("frontend/src/example.ts"), f.original);
  assert.equal(f.read("frontend/src/stale.ts"), "old flat module\n");
  assert.equal(
    fs.existsSync(path.join(f.repo, "frontend/src/new-feature/index.ts")),
    false,
  );
});
test("an edited backup blocks undo before any updated file is changed", (t) => {
  const f = fixture(t),
    backup = applyUpdate(f.plan());
  put(backup, "files/frontend/src/stale.ts", "edited backup\n");
  assert.throws(() => restoreUpdate(backup), /edited backup/);
  assert.equal(f.read("frontend/src/example.ts"), "export const value = 2;\n");
  assert.equal(
    f.read("frontend/src/new-feature/index.ts"),
    "export const added = true;\n",
  );
});
