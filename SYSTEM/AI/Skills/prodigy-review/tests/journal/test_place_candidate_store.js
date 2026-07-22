"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const store = require(path.join(ROOT, "SYSTEM/Views/place-candidate-store.js"));
const TEMPLATE = fs.readFileSync(path.join(ROOT, store.TEMPLATE_PATH), "utf8");

function fixtureVault(options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "place-candidate-store-"));
  const filePath = (relative) => path.join(root, relative);
  const files = new Map();
  const folder = (relative) => ({ path: relative, children: [] });
  function refresh() {
    files.clear();
    function walk(dir, relative) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
        const next = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.set(nextRelative, folder(nextRelative));
          walk(next, nextRelative);
        } else if (entry.isFile()) {
          files.set(nextRelative, {
            path: nextRelative,
            basename: path.basename(entry.name, ".md"),
            extension: path.extname(entry.name).slice(1)
          });
        }
      }
    }
    walk(root, "");
  }
  function write(relative, text) {
    fs.mkdirSync(path.dirname(filePath(relative)), { recursive: true });
    fs.writeFileSync(filePath(relative), text, "utf8");
    refresh();
  }
  write(store.TEMPLATE_PATH, TEMPLATE);
  if (!options || options.defaultDaily !== false) {
    write("DAILY/DAILY/2026-07-20.md", "---\ntype: journal\n---\n");
  }
  const app = {
    vault: {
      getAbstractFileByPath(relative) { refresh(); return files.get(relative) || null; },
      getMarkdownFiles() { refresh(); return Array.from(files.values()).filter((file) => file.extension === "md"); },
      async read(file) { return fs.readFileSync(filePath(file.path), "utf8"); },
      async createFolder(relative) { fs.mkdirSync(filePath(relative), { recursive: true }); refresh(); },
      async create(relative, content) {
        if (fs.existsSync(filePath(relative))) throw new Error("EEXIST");
        write(relative, content);
        return app.vault.getAbstractFileByPath(relative);
      },
      async modify(file, content) { write(file.path, content); }
    }
  };
  return {
    root,
    app,
    write,
    mkdir(relative) { fs.mkdirSync(filePath(relative), { recursive: true }); refresh(); },
    read(relative) { return fs.readFileSync(filePath(relative), "utf8"); },
    exists(relative) { return fs.existsSync(filePath(relative)); }
  };
}

function candidate(overrides) {
  return Object.assign({
    name: "성수 커피",
    place_kind: "cafe",
    daily_path: "DAILY/DAILY/2026-07-20.md"
  }, overrides || {});
}

test("creates a fleeting candidate from the canonical template with Korean body fields", async (t) => {
  const vault = fixtureVault();
  t.after(() => fs.rmSync(vault.root, { recursive: true, force: true }));
  const result = await store.createCandidate(vault.app, candidate({ address: "서울 성동구", memo: "산미가 좋아 재방문", verified_address: true }), { now: new Date("2026-07-20T01:02:03.000Z"), human_confirmed: true });
  assert.equal(result.status, "created");
  assert.equal(result.path, "PARA/INBOX/Place Candidates/성수 커피.md");
  const content = vault.read(result.path);
  assert.match(content, /^type: fleeting_note$/m);
  assert.doesNotMatch(content, /^(?:place|resource|place_kind|lifecycle|review_ready):/m);
  assert.match(content, /^## 장소 후보$/m);
  assert.match(content, /- 라이프사이클: `candidate`/);
  assert.match(content, /- 장소 종류: `cafe` \(카페\)/);
  assert.match(content, /- 주소: 서울 성동구/);
  assert.match(content, /- 메모: 산미가 좋아 재방문/);
  assert.match(content, /- 검증 근거: `verified_address`/);
  assert.match(content, /- 검토 준비: `review_ready`/);
  assert.match(content, /\[\[DAILY\/DAILY\/2026-07-20\]\]/);
  assert.doesNotMatch(content, /<%/);
});

test("requires the human-confirmed place kind enum", () => {
  assert.throws(() => store.normalizeCandidateInput(candidate({ place_kind: "" })), /종류/);
  assert.throws(() => store.normalizeCandidateInput(candidate({ place_kind: "venue" })), /종류/);
  assert.throws(() => store.normalizeCandidateInput(candidate({ place_kind: "place" })), /종류/);
  assert.throws(() => store.normalizeCandidateInput(candidate({ daily_path: "PARA/INBOX/not-daily.md" })), /Daily/);
  assert.equal(store.normalizeCandidateInput(candidate({ place_kind: "travel_spot" })).place_kind, "travel_spot");
});

test("exact normalized-name collision never overwrites the candidate", async (t) => {
  const vault = fixtureVault();
  t.after(() => fs.rmSync(vault.root, { recursive: true, force: true }));
  vault.write("DAILY/DAILY/2026-07-21.md", "---\ntype: journal\n---\n");
  const first = await store.createCandidate(vault.app, candidate({ memo: "원본 메모" }), { human_confirmed: true });
  const before = vault.read(first.path);
  const collision = await store.createCandidate(vault.app, candidate({ name: "  성수   커피  ", place_kind: "restaurant", daily_path: "DAILY/DAILY/2026-07-21.md" }), { human_confirmed: true });
  assert.equal(collision.status, "collision");
  assert.equal(vault.read(first.path), before);
  assert.equal(vault.exists("PARA/INBOX/Place Candidates/성수 커피 2.md"), false);
});

test("a separately confirmed Daily link appends once and promotes only from two independent Dailies", async (t) => {
  const vault = fixtureVault();
  t.after(() => fs.rmSync(vault.root, { recursive: true, force: true }));
  vault.write("DAILY/DAILY/2026-07-21.md", "---\ntype: journal\n---\n");
  const first = await store.createCandidate(vault.app, candidate(), { human_confirmed: true });
  assert.match(vault.read(first.path), /- 검토 준비: `candidate`/);
  await assert.rejects(
    store.appendDailyLinkToCandidate(vault.app, candidate({ daily_path: "DAILY/DAILY/2026-07-21.md" })),
    /명시적 확인/
  );
  const appended = await store.appendDailyLinkToCandidate(
    vault.app,
    candidate({ daily_path: "DAILY/DAILY/2026-07-21.md" }),
    { human_confirmed: true }
  );
  assert.equal(appended.status, "appended");
  const afterAppend = vault.read(first.path);
  assert.match(afterAppend, /\[\[DAILY\/DAILY\/2026-07-20\]\]/);
  assert.match(afterAppend, /\[\[DAILY\/DAILY\/2026-07-21\]\]/);
  assert.match(afterAppend, /- 검토 준비: `review_ready`/);
  const duplicate = await store.appendDailyLinkToCandidate(
    vault.app,
    candidate({ daily_path: "DAILY/DAILY/2026-07-21.md" }),
    { human_confirmed: true }
  );
  assert.equal(duplicate.status, "unchanged");
  assert.equal(vault.read(first.path), afterAppend);
});

test("both write paths require confirmation and an existing Daily markdown file", async (t) => {
  const vault = fixtureVault();
  t.after(() => fs.rmSync(vault.root, { recursive: true, force: true }));
  await assert.rejects(store.createCandidate(vault.app, candidate()), /명시적 확인/);
  assert.equal(vault.exists("PARA/INBOX/Place Candidates/성수 커피.md"), false);
  await assert.rejects(
    store.createCandidate(vault.app, candidate({ daily_path: "DAILY/DAILY/2099-01-01.md" }), { human_confirmed: true }),
    /Daily 파일/
  );
  await store.createCandidate(vault.app, candidate(), { human_confirmed: true });
  await assert.rejects(
    store.appendDailyLinkToCandidate(vault.app, candidate({ daily_path: "DAILY/DAILY/2099-01-01.md" }), { human_confirmed: true }),
    /Daily 파일/
  );
});

test("a folder named like a Daily markdown file is rejected without writes", async (t) => {
  const vault = fixtureVault({ defaultDaily: false });
  t.after(() => fs.rmSync(vault.root, { recursive: true, force: true }));
  vault.mkdir("DAILY/DAILY/2026-07-20.md");
  await assert.rejects(
    store.createCandidate(vault.app, candidate(), { human_confirmed: true }),
    /Daily 파일/
  );
  assert.equal(vault.exists("PARA/INBOX/Place Candidates/성수 커피.md"), false);

  vault.write("DAILY/DAILY/2026-07-21.md", "---\ntype: journal\n---\n");
  const created = await store.createCandidate(
    vault.app,
    candidate({ daily_path: "DAILY/DAILY/2026-07-21.md" }),
    { human_confirmed: true }
  );
  const before = vault.read(created.path);
  await assert.rejects(
    store.appendDailyLinkToCandidate(vault.app, candidate(), { human_confirmed: true }),
    /Daily 파일/
  );
  assert.equal(vault.read(created.path), before);
});

test("concurrent confirmed appends keep both distinct Daily links", async (t) => {
  const vault = fixtureVault();
  t.after(() => fs.rmSync(vault.root, { recursive: true, force: true }));
  vault.write("DAILY/DAILY/2026-07-21.md", "---\ntype: journal\n---\n");
  vault.write("DAILY/DAILY/2026-07-22.md", "---\ntype: journal\n---\n");
  const first = await store.createCandidate(vault.app, candidate(), { human_confirmed: true });
  const results = await Promise.all([
    store.appendDailyLinkToCandidate(vault.app, candidate({ daily_path: "DAILY/DAILY/2026-07-21.md" }), { human_confirmed: true }),
    store.appendDailyLinkToCandidate(vault.app, candidate({ daily_path: "DAILY/DAILY/2026-07-22.md" }), { human_confirmed: true })
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["appended", "appended"]);
  const links = store.extractDailyEvidenceLinks(vault.read(first.path));
  assert.deepEqual(links.sort(), [
    "DAILY/DAILY/2026-07-20.md",
    "DAILY/DAILY/2026-07-21.md",
    "DAILY/DAILY/2026-07-22.md"
  ]);
});

test("review-ready is limited to two Daily links or explicit verified address/revisit memo", () => {
  const plain = candidate();
  assert.equal(store.isReviewReady(plain, [plain.daily_path]), false);
  assert.equal(store.isReviewReady(plain, [plain.daily_path, "DAILY/DAILY/2026-07-21.md"]), true);
  assert.equal(store.isReviewReady(candidate({ address: "서울", verified_address: true }), []), true);
  assert.equal(store.isReviewReady(candidate({ address: "서울", verified_address: false }), []), false);
  assert.equal(store.isReviewReady(candidate({ memo: "다시 가서 좌석 확인", revisit_memo: true }), []), true);
  assert.equal(store.isReviewReady(candidate({ memo: "다시 가서 좌석 확인", revisit_memo: false }), []), false);
});
