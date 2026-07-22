"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const creator = require(path.join(ROOT, "SYSTEM/Views/venue-creator.js"));
const TEMPLATE_PATH = "SYSTEM/TEMPLATE/FORMAT/template_venue.md";

function makeTemporaryVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-venue-creator-"));
  const absolute = (relativePath) => path.join(root, ...relativePath.split("/"));
  const opened = [];
  const createCalls = [];

  function file(relativePath) {
    return { path: relativePath, extension: path.extname(relativePath).slice(1) };
  }

  function folder(relativePath) {
    return { path: relativePath, extension: path.extname(relativePath).slice(1), children: [] };
  }

  const vault = {
    getAbstractFileByPath(relativePath) {
      const target = absolute(relativePath);
      if (!fs.existsSync(target)) return null;
      return fs.statSync(target).isDirectory() ? folder(relativePath) : file(relativePath);
    },
    async read(entry) {
      return fs.promises.readFile(absolute(entry.path), "utf8");
    },
    async createFolder(relativePath) {
      await fs.promises.mkdir(absolute(relativePath));
    },
    async create(relativePath, content) {
      const target = absolute(relativePath);
      await fs.promises.writeFile(target, content, { encoding: "utf8", flag: "wx" });
      createCalls.push(relativePath);
      return file(relativePath);
    }
  };

  function write(relativePath, content) {
    fs.mkdirSync(path.dirname(absolute(relativePath)), { recursive: true });
    fs.writeFileSync(absolute(relativePath), content, "utf8");
  }

  write(TEMPLATE_PATH, fs.readFileSync(path.join(ROOT, TEMPLATE_PATH), "utf8"));
  write("DAILY/DAILY/2026-07-20.md", "---\ntype: journal\n---\n\n# 2026-07-20\n");

  return {
    root,
    opened,
    createCalls,
    app: {
      vault,
      workspace: { openLinkText: async (link) => { opened.push(link); } }
    },
    read(relativePath) { return fs.readFileSync(absolute(relativePath), "utf8"); },
    exists(relativePath) { return fs.existsSync(absolute(relativePath)); },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

function frontmatterKeys(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, "created Venue must begin with frontmatter");
  return match[1]
    .split("\n")
    .filter((line) => /^[a-z_][a-z0-9_]*:/.test(line))
    .map((line) => line.slice(0, line.indexOf(":")));
}

function validInput(overrides) {
  return Object.assign({
    title: "메이필드호텔",
    venue_category: "wedding_hall",
    address: "서울 강서구",
    dailyPath: "DAILY/DAILY/2026-07-20.md"
  }, overrides || {});
}

async function withVault(run) {
  const fixture = makeTemporaryVault();
  try {
    await run(fixture);
  } finally {
    fixture.cleanup();
  }
}

async function testValidCreatePreservesTemplateContract() {
  await withVault(async (fixture) => {
    const result = await creator.createVenue(fixture.app, validInput(), { now: "2026-07-20T09:30:00.000Z" });
    const target = "PARA/RESOURCES/Venues/메이필드호텔.md";
    const content = fixture.read(target);

    assert.equal(result.ok, true);
    assert.equal(result.path, target);
    assert.deepEqual(frontmatterKeys(content), creator.ALLOWED_FRONTMATTER_KEYS);
    assert.match(content, /^type: venue$/m);
    assert.match(content, /^venue_category: "wedding_hall"$/m);
    assert.match(content, /^address: "서울 강서구"$/m);
    assert.match(content, /^  - "\[\[DAILY\/DAILY\/2026-07-20\]\]"$/m);
    assert.match(content, /^created: 2026-07-20T09:30$/m);
    assert.match(content, /^updated: 2026-07-20T09:30$/m);
    assert.match(content, /^# 메이필드호텔$/m);
    for (const heading of creator.REQUIRED_HEADINGS) assert.match(content, new RegExp(`^## ${heading}$`, "m"));
    assert.deepEqual(fixture.opened, ["PARA/RESOURCES/Venues/메이필드호텔"]);
  });
}

async function testCategoryValidationDoesNotWrite() {
  await withVault(async (fixture) => {
    await assert.rejects(() => creator.createVenue(fixture.app, validInput({ venue_category: "" })), /분류/);
    await assert.rejects(() => creator.createVenue(fixture.app, validInput({ venue_category: "Wedding Hall" })), /snake_case/);
    assert.equal(fixture.exists("PARA/RESOURCES/Venues"), false);
    assert.deepEqual(fixture.createCalls, []);
  });
}

async function testDailyFolderNamedMarkdownIsRejectedWithoutWrite() {
  await withVault(async (fixture) => {
    fs.mkdirSync(path.join(fixture.root, "DAILY/DAILY/2026-07-21.md"));
    await assert.rejects(
      () => creator.createVenue(fixture.app, validInput({ dailyPath: "DAILY/DAILY/2026-07-21.md" })),
      /실제 Markdown 파일/
    );
    assert.equal(fixture.exists("PARA/RESOURCES/Venues"), false);
    assert.deepEqual(fixture.createCalls, []);
  });
}

async function testOptionalAddressAndSavedDailyAreStored() {
  await withVault(async (fixture) => {
    await creator.createVenue(fixture.app, validInput({ title: "아뜰리에", address: "" }), { now: "2026-07-20T10:00:00Z" });
    const content = fixture.read("PARA/RESOURCES/Venues/아뜰리에.md");
    assert.match(content, /^address: ""$/m);
    assert.match(content, /^connections:\n  - "\[\[DAILY\/DAILY\/2026-07-20\]\]"$/m);
  });
}

async function testExactTitleCollisionOpensWithoutOverwrite() {
  await withVault(async (fixture) => {
    const target = "PARA/RESOURCES/Venues/메이필드호텔.md";
    const original = "existing venue must remain untouched\n";
    const targetDirectory = path.join(fixture.root, "PARA/RESOURCES/Venues");
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.writeFileSync(path.join(targetDirectory, "메이필드호텔.md"), original, "utf8");

    const result = await creator.createVenue(fixture.app, validInput());
    assert.equal(result.ok, false);
    assert.equal(result.collision, true);
    assert.equal(result.path, target);
    assert.equal(fixture.read(target), original);
    assert.deepEqual(fixture.createCalls, []);
    assert.deepEqual(fixture.opened, ["PARA/RESOURCES/Venues/메이필드호텔"]);
  });
}

async function testOpenOutcomesAreStructuredAndSingleSettlement() {
  const unavailable = await creator.open(null);
  assert.deepEqual(unavailable, {
    outcome: "unavailable",
    ok: false,
    unavailable: true,
    message: "Obsidian 앱 컨텍스트가 필요합니다."
  });
  assert.equal(creator.openVenueCreator, creator.open);

  const cancelledModal = new creator.VenueCreatorModal({}, {});
  const cancelled = new Promise((resolve) => cancelledModal.setOutcomeResolver(resolve));
  cancelledModal.onClose();
  assert.equal(cancelledModal.settle(creator.outcome("failed", { failed: true })), false);
  assert.deepEqual(await cancelled, {
    outcome: "cancelled",
    ok: false,
    cancelled: true,
    message: "장소 저장을 취소했습니다."
  });

  await withVault(async (fixture) => {
    const targetDirectory = path.join(fixture.root, "PARA/RESOURCES/Venues");
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.writeFileSync(path.join(targetDirectory, "메이필드호텔.md"), "existing\n", "utf8");
    const modal = new creator.VenueCreatorModal(fixture.app, validInput());
    const collision = new Promise((resolve) => modal.setOutcomeResolver(resolve));
    modal.close = () => modal.onClose();
    await modal.save();
    assert.deepEqual(await collision, {
      outcome: "collision",
      ok: false,
      collision: true,
      path: "PARA/RESOURCES/Venues/메이필드호텔.md",
      message: "같은 이름의 장소가 이미 있습니다. 기존 장소를 열었습니다."
    });
    assert.deepEqual(fixture.createCalls, []);
  });
}

async function main() {
  await testValidCreatePreservesTemplateContract();
  await testCategoryValidationDoesNotWrite();
  await testDailyFolderNamedMarkdownIsRejectedWithoutWrite();
  await testOptionalAddressAndSavedDailyAreStored();
  await testExactTitleCollisionOpensWithoutOverwrite();
  await testOpenOutcomesAreStructuredAndSingleSettlement();
  console.log("Venue creator tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
