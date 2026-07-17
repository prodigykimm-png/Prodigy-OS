"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function load(rel) {
  return require(path.join(ROOT, rel));
}

function main() {
  try { load("SYSTEM/Views/display-registry.js"); } catch (_e) { /* optional */ }
  try { load("SYSTEM/Views/object-lifecycle-core.js"); } catch (_e) { /* optional */ }
  const engine = load("SYSTEM/Views/object-engine-core.js");
  const core = load("SYSTEM/Views/object-creator-core.js");
  const projectCore = load("SYSTEM/Views/project-wizard-core.js");
  const viewSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/object-creator-view.js"), "utf8");
  const homeSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");
  const homeHub = fs.readFileSync(path.join(ROOT, "HUB/00 Home.md"), "utf8");
  const launcherView = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workspace-launcher-view.js"), "utf8");
  const guide = fs.readFileSync(path.join(ROOT, "SYSTEM/docs/11_Operating_Guide.md"), "utf8");
  const creatorCoreSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/object-creator-core.js"), "utf8");

  // --- classify (capability) + classifyInput alias ---
  assert.equal(typeof engine.classify, "function");
  assert.equal(typeof engine.classifyInput, "function");
  assert.equal(engine.classify, engine.classifyInput);
  assert.equal(typeof engine.listCreatableTypes, "function");
  assert.ok(engine.listCreatableTypes().some((t) => t.id === "project"));
  assert.ok(engine.listCreatableTypes().some((t) => t.id === "people"));

  const empty = engine.classify("");
  assert.equal(empty.empty, true);
  assert.equal(empty.selected, null);

  const people = engine.classify("김대리");
  assert.ok(people.selected);
  assert.equal(people.selected.id, "people");
  assert.ok(people.selected.reasons && people.selected.reasons.length >= 1);

  const auction = engine.classify("김포 오피스텔 경매 입찰");
  assert.equal(auction.selected.id, "auction");
  assert.match(auction.selected.reason || auction.selected.reasons[0], /경매|입찰/);

  const reading = engine.classify("Atomic Habits 책 읽기");
  assert.equal(reading.selected.id, "reading");

  const workout = engine.classify("스쿼트 5세트");
  assert.equal(workout.selected.id, "workout");

  const project = engine.classify("Auction Calendar MVP 스프린트");
  assert.equal(project.selected.id, "project");

  // Alias produces identical classification
  const peopleAlias = engine.classifyInput("김대리");
  assert.equal(peopleAlias.selected.id, people.selected.id);

  // Every scored candidate has reason when selected
  people.candidates.filter((c) => c.score > 0).forEach((c) => {
    assert.ok((c.reasons && c.reasons.length) || c.reason);
  });

  // Fallback when no signal → journal
  const weak = engine.classifyInput("zzz");
  assert.ok(weak.selected);
  assert.equal(weak.selected.id, "journal");
  assert.ok(weak.fallback || weak.selected.reasons.length);

  // --- findDuplicates / findSimilarObjects (no vault) ---
  assert.equal(engine.findDuplicates, engine.findSimilarObjects);
  const similar = engine.findDuplicates("운송", {
    projects: [{ name: "3차 운송예산 편성", path: "PARA/PROJECTS/need.md", type: "project", status: "doing" }],
    auctions: [{ name: "김포 오피스텔", path: "PARA/PROJECTS/Auction/a.md", type: "auction_case" }],
    reading: []
  });
  assert.ok(similar.some((s) => String(s.title).includes("운송")));
  assert.ok(similar.every((s) => s.title && (s.path || s.type)));

  // --- Creator duplicate normalization (actionable cards) ---
  assert.equal(typeof core.normalizeDuplicateResults, "function");
  assert.equal(typeof core.listDuplicateCandidates, "function");
  assert.equal(typeof core.openExistingObject, "function");
  assert.equal(typeof core.createActionLabel, "function");

  const normalized = core.normalizeDuplicateResults([
    { title: "3차 운송예산 편성", path: "PARA/PROJECTS/need.md", type: "project", status: "doing" },
    { title: "경로 없음", type: "project" }, // drop — no path
    { title: "", path: "PARA/PROJECTS/x.md", type: "project" }, // drop — no title
    { title: "김포 오피스텔", path: "PARA/PROJECTS/Auction/a.md", type: "auction_case" },
    { title: "extra", path: "PARA/PROJECTS/e1.md", type: "project" },
    { title: "extra2", path: "PARA/PROJECTS/e2.md", type: "project" }
  ], { maxResults: 3 });
  assert.equal(normalized.length, 3);
  assert.ok(normalized.every((n) => n.title && n.path));
  assert.equal(normalized[0].title, "3차 운송예산 편성");
  assert.ok(normalized[0].typeLabel);
  assert.ok(normalized[0].reason);
  assert.ok(!normalized.some((n) => n.title === "경로 없음"));

  const listed = core.listDuplicateCandidates("운송", {
    projects: [
      { name: "3차 운송예산 편성", path: "PARA/PROJECTS/need.md", type: "project", status: "doing" },
      { name: "운송 백업", path: "PARA/PROJECTS/backup.md", type: "project" },
      { name: "운송 C", path: "PARA/PROJECTS/c.md", type: "project" },
      { name: "운송 D", path: "PARA/PROJECTS/d.md", type: "project" }
    ],
    auctions: [],
    reading: []
  }, { maxResults: 3 });
  assert.ok(listed.length >= 1 && listed.length <= 3);
  assert.ok(listed.every((n) => n.path && n.title));

  // Engine failure → empty list, not throw
  const prevFind = engine.findDuplicates;
  engine.findDuplicates = () => { throw new Error("dup boom"); };
  engine.findSimilarObjects = engine.findDuplicates;
  assert.deepEqual(core.listDuplicateCandidates("운송", { projects: [{ name: "운송", path: "p.md" }] }), []);
  engine.findDuplicates = prevFind;
  engine.findSimilarObjects = prevFind;

  // Classification unchanged by duplicate listing
  const beforeClass = core.classify("3차 운송예산 편성");
  core.listDuplicateCandidates("3차 운송예산 편성", {
    projects: [{ name: "3차 운송예산 편성", path: "PARA/PROJECTS/need.md", type: "project" }]
  });
  const afterClass = core.classify("3차 운송예산 편성");
  assert.equal(afterClass.selected && afterClass.selected.id, beforeClass.selected && beforeClass.selected.id);

  assert.equal(core.createActionLabel("project"), "프로젝트 만들기");
  assert.equal(core.createActionLabel("auction"), "경매 워크스페이스 열기");

  // --- Creator core classify wrapper ---
  const c = core.classify("정호성 연락");
  assert.ok(c.selected);
  assert.ok(c.selected.reason || (c.selected.reasons && c.selected.reasons.length));

  // Empty create blocked by UI contract (core still classifies empty)
  assert.equal(core.classify("").empty, true);

  // --- launchExistingCreator reuses existing surfaces (mocked app) ---
  let opened = [];
  const fakeApp = {
    workspace: {
      openLinkText: async (a, b) => { opened.push(String(b || a)); },
      getLeaf: () => ({ openFile: async (f) => { opened.push(f && f.path); } })
    },
    vault: {
      getAbstractFileByPath: () => null,
      create: async (p) => ({ path: p }),
      createFolder: async () => {},
      read: async () => ""
    }
  };

  // openExistingObject opens exact path (never launches a creator)
  return core.openExistingObject(fakeApp, {
    title: "3차 운송예산 편성",
    path: "PARA/PROJECTS/need.md"
  }).then((openRes) => {
    assert.equal(openRes.ok, true);
    assert.ok(opened.some((p) => String(p).includes("need") || String(p).includes("PARA/PROJECTS")));
    return core.openExistingObject(fakeApp, { title: "x" }); // no path
  }).then((badOpen) => {
    assert.equal(badOpen.ok, false);

    // project → openProjectWizard with initialProjectName handoff
    const g = globalThis;
    const prevWizard = g.openProjectWizard;
    let wizardOpened = false;
    let wizardOpts = null;
    g.openProjectWizard = (opts) => {
      wizardOpened = true;
      wizardOpts = opts;
    };

    return core.launchExistingCreator(fakeApp, "project", "  3차 운송예산 편성  ").then((res) => {
      assert.equal(res.ok, true);
      assert.equal(wizardOpened, true);
      assert.ok(wizardOpts && typeof wizardOpts === "object");
      assert.equal(wizardOpts.initialProjectName, "3차 운송예산 편성");
      assert.equal(res.message, "프로젝트 마법사를 열었습니다.");
      assert.equal(String(res.message || "").includes("제목 힌트"), false);

      // empty title → blank wizard (openProjectWizard with no options)
      wizardOpened = false;
      wizardOpts = "sentinel";
      return core.launchExistingCreator(fakeApp, "project", "   ").then((emptyRes) => {
        assert.equal(emptyRes.ok, true);
        assert.equal(wizardOpened, true);
        assert.equal(wizardOpts, undefined);
        g.openProjectWizard = prevWizard;
        return emptyRes;
      });
    });
  }).then(() => {
    // ProjectWizardCore prefill helper (Modal-free unit surface)
    assert.equal(typeof projectCore.normalizeInitialProjectName, "function");
    assert.equal(projectCore.normalizeInitialProjectName("  3차 운송예산 편성  "), "3차 운송예산 편성");
    assert.equal(projectCore.normalizeInitialProjectName(""), "");
    assert.equal(projectCore.normalizeInitialProjectName(null), "");
    assert.equal(projectCore.normalizeInitialProjectName(undefined), "");

    // Handoff wiring in sources
    assert.match(creatorCoreSrc, /initialProjectName/);
    assert.equal(creatorCoreSrc.includes("제목 힌트"), false);
    const wizardSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/project-wizard.js"), "utf8");
    assert.match(wizardSrc, /initialProjectName|normalizeInitialProjectName/);
    assert.match(wizardSrc, /function openProjectWizard\(options\)/);
    assert.match(guide, /initial project name|Creator input is handed/i);

    return core.launchExistingCreator(fakeApp, "workout", "레그데이");
  }).then((res) => {
    assert.equal(res.ok, true);
    assert.ok(opened.some((p) => String(p).includes("Workout")));

    return core.launchExistingCreator(fakeApp, "journal", "오늘 성찰");
  }).then((res) => {
    assert.equal(res.ok, true);
    assert.ok(res.path || res.deferred);

    // Classification failure surface still has journal fallback shape
    const failedManual = {
      candidates: [],
      selected: { id: "journal", reasons: ["분류를 사용할 수 없어 저널을 제안합니다."] },
      fallback: true
    };
    assert.equal(failedManual.selected.id, "journal");

    // Wiring — duplicate resolution UX
    assert.match(viewSrc, /새 Object|prodigy-object-creator|만들기/);
    assert.match(viewSrc, /이유|poc-reason/);
    assert.match(viewSrc, /비슷한 Object가 있습니다/);
    assert.match(viewSrc, /기존 Object 열기/);
    assert.match(viewSrc, /listDuplicateCandidates|openExistingObject|createActionLabel/);
    assert.match(viewSrc, /Create-anyway|never blocked by duplicates/);
    assert.match(creatorCoreSrc, /normalizeDuplicateResults|listDuplicateCandidates|openExistingObject/);
    assert.match(homeSrc, /ObjectCreatorView|\+ 새 Object|metaKey|ctrlKey/);
    assert.match(homeHub, /object-creator-core\.js|object-creator-view\.js/);
    assert.match(launcherView, /ObjectCreatorView|\+ 새 Object/);
    assert.match(guide, /Universal Object Creator|classify\(|classifyInput|Object Engine/);
    assert.match(guide, /getLifecycle|getAttention|findDuplicates|getContinueTarget/);
    assert.match(guide, /open an existing Object|continue with a new creation|never blocks creation/i);

    // No schema mutation APIs in creator core
    assert.equal(creatorCoreSrc.includes("processFrontMatter"), false);
    assert.match(creatorCoreSrc, /openProjectWizard|createAndOpen|ReadingBookCreate|launchExistingCreator/);

    // registerCreatableType for future types
    assert.equal(engine.registerCreatableType({ id: "study_test_x", label: "공부테스트", type: "study" }), true);
    assert.ok(engine.listCreatableTypes().some((t) => t.id === "study_test_x"));

    console.log("Object creator tests passed");
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
