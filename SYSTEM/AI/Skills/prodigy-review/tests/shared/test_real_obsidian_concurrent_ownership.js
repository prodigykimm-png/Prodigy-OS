#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  RealObsidianHarness,
  assertProtectedUnchanged,
  createDisposableOwnership,
  snapshotProtected,
} = require("./real_obsidian_harness.js");

function processRow(overrides = {}) {
  return {
    pid: 71001,
    ppid: 1,
    pgid: 71001,
    start: "Tue Aug 25 10:00:00 2026",
    executable: "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
    command: "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
    ...overrides,
  };
}

test("Given a concurrent approved disposable harness When protected apps are snapshotted Then only the pre-existing user app is protected", () => {
  // Given
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task13a-ownership-contract-"));
  try {
    const profile = path.join(runtimeRoot, "profile");
    const vault = path.join(runtimeRoot, "vault");
    const executable = path.join(runtimeRoot, "ObsidianTask.app/Contents/MacOS/Obsidian");
    const ownership = createDisposableOwnership({ runtimeRoot, executable, profile, target: vault, port: 61234, nonce: "exact-nonce" });
    const owner = processRow({ ...ownership.metadata.owner, ppid: 1, pgid: ownership.metadata.owner.pid, command: `${ownership.metadata.owner.executable} --test` });
    const sibling = processRow({
      pid: 72001,
      ppid: owner.pid,
      executable,
      command: `${executable} --user-data-dir=${profile} --remote-debugging-port=61234 --task13a-nonce=exact-nonce ${ownership.args.join(" ")} ${vault}`,
    });
    ownership.bindApplication(sibling);
    const user = processRow();

    // When
    const snapshot = snapshotProtected({
      rows: [owner, user, sibling],
      bundles: [
        { bundle: "/Applications/Obsidian.app", executable: user.executable, executableSha256: "user-digest", bundleName: "Obsidian" },
        { bundle: path.dirname(path.dirname(path.dirname(executable))), executable, executableSha256: "clone-digest", bundleName: "ObsidianTask" },
      ],
      portsForPid: (pid) => pid === user.pid ? [27123] : [61234],
    });

    // Then
    assert.deepEqual(snapshot.records.map(({ pid }) => pid), [user.pid]);
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test("Given a forged ownership marker When protected apps are snapshotted Then the user app remains protected", () => {
  // Given
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task13a-forged-ownership-"));
  try {
    const marker = path.join(runtimeRoot, "ownership.json");
    const token = "f".repeat(32);
    const profile = path.join(runtimeRoot, "profile");
    const vault = path.join(runtimeRoot, "vault");
    const owner = processRow({ pid: 70001, executable: process.execPath, command: `${process.execPath} --test`, start: "Tue Aug 25 09:59:00 2026" });
    const user = processRow({
      ppid: owner.pid,
      command: `/Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir=${profile} --remote-debugging-port=61234 --task13a-nonce=fake --task13a-owner-token=${token} --task13a-owner-file=${Buffer.from(marker).toString("base64url")} ${vault}`,
    });
    const metadata = {
      schema: "task13a-real-obsidian-owner-v2",
      token,
      runtimeRoot,
      executable: path.join(runtimeRoot, "Fake.app/Contents/MacOS/Obsidian"),
      profile,
      target: vault,
      port: 61234,
      nonce: "fake",
      owner: { pid: owner.pid, start: owner.start, executable: owner.executable },
      application: { pid: user.pid, pgid: user.pgid, start: user.start, executable: user.executable },
      authentication: null,
    };
    const { authentication: _authentication, ...payload } = metadata;
    metadata.authentication = crypto.createHmac("sha256", token).update(JSON.stringify(payload)).digest("hex");
    fs.writeFileSync(marker, JSON.stringify(metadata), { mode: 0o600 });

    // When
    const snapshot = snapshotProtected({
      rows: [owner, user],
      bundles: [{ bundle: "/Applications/Obsidian.app", executable: user.executable, executableSha256: "user-digest", bundleName: "Obsidian" }],
      portsForPid: () => [61234],
    });

    // Then
    assert.deepEqual(snapshot.records.map(({ pid }) => pid), [user.pid]);
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test("Given two live disposable harnesses When each closes Then each cleans only its exact process and reuses its port", { timeout: 120000 }, async () => {
  // Given
  let first = null;
  let second = null;
  let cleaned = false;
  try {
    const starts = await Promise.allSettled([
      RealObsidianHarness.start("concurrent-owner-first"),
      RealObsidianHarness.start("concurrent-owner-second"),
    ]);
    first = starts[0].status === "fulfilled" ? starts[0].value : null;
    second = starts[1].status === "fulfilled" ? starts[1].value : null;
    assert.deepEqual(starts.map(({ status }) => status), ["fulfilled", "fulfilled"], starts.map((result) => result.status === "rejected" ? result.reason.message : null).join("\n"));

    // When
    const [firstCleanup, secondCleanup] = await Promise.all([first.close(), second.close()]);
    cleaned = true;

    // Then
    for (const cleanup of [firstCleanup, secondCleanup]) {
      assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error);
      assert.equal(cleanup.audit.equal, true);
      assert.equal(cleanup.removed, true);
      assert.equal(cleanup.portReusable, true);
      assert.deepEqual(cleanup.ownershipAudit.ambiguous, []);
      assert.equal(cleanup.ownershipAudit.application.pid, cleanup.ownershipAudit.signalled.at(-1).pid);
    }
    assert.equal(firstCleanup.signalled.some((pid) => secondCleanup.signalled.includes(pid)), false, "sibling PIDs cannot be signalled");
  } finally {
    if (!cleaned) await Promise.all([first && first.close(), second && second.close()].filter(Boolean));
  }
});

test("Given a pre-existing user app When its process identity or executable bytes change Then continuity still fails closed", () => {
  // Given
  const beforeRow = processRow();
  const before = {
    records: [{ kind: "Obsidian", pid: beforeRow.pid, pgid: beforeRow.pgid, start: beforeRow.start, executable: beforeRow.executable, executableSha256: "user-digest", bundle: "/Applications/Obsidian.app", ports: [27123] }],
  };
  const changed = processRow({ pgid: 99999 });

  // When / Then
  assert.throws(
    () => assertProtectedUnchanged(before, [], [changed], () => [27123], () => "user-digest"),
    /protected Obsidian identity changed/u,
  );
  assert.throws(
    () => assertProtectedUnchanged(before, [], [beforeRow], () => [27123], () => "changed-user-digest"),
    /protected Obsidian identity changed/u,
  );
});
