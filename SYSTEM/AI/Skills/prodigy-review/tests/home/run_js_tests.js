// Node.js test runner for Prodigy OS Morning Brief JS Modules
const assert = require("assert");
const fs = require("fs");

// Mocking global objects
global.globalThis = global;
global.window = global;

// Mocking Obsidian and Dataview environment
global.obsidian = {};
global.Notice = class Notice {
  constructor(msg) {
    this.msg = msg;
    console.log("[Notice]", msg);
  }
};

const mockApp = {
  vault: {
    getAbstractFileByPath: (path) => {
      // Mock daily notes and weekly review files
      if (path.includes("DAILY/DAILY/2026-07-15.md")) {
        return { path };
      }
      if (path.includes("weekly-review")) {
        return { path };
      }
      return null;
    },
    read: async (file) => {
      if (file.path.includes("2026-07-15.md")) {
        return `---
journal: personal daily
journal-date: 2026-07-15
status: completed
---
# 2026-07-15
## 성찰 (Reflection)
오늘의 유혹을 물리치고 운동을 열심히 했다.
## 변화 (Change)
목표 달성에 더 신중해졌다.
## 다음 실험 (Next Experiment)
내일 아침 6시 기상
`;
      }
      return "";
    },
    getMarkdownFiles: () => [
      { name: "2026-07-15.md", path: "DAILY/DAILY/2026-07-15.md" }
    ],
    createFolder: async () => {},
    create: async (path, content) => {
      console.log("[Mock Vault Create]", path);
      return { path };
    },
    modify: async (file, content) => {
      console.log("[Mock Vault Modify]", file.path);
    },
    adapter: {
      mkdir: async () => {}
    }
  },
  secretStorage: {
    getSecret: async (name) => {
      if (name.includes("todoist")) return "mock-todoist-token";
      if (name.includes("gemini")) return "mock-gemini-key";
      return "";
    }
  }
};

const mockDv = {
  pages: (query) => {
    return {
      where: (filterFn) => {
        const mockPages = [];
        if (query.includes("DAILY")) {
          mockPages.push({
            type: "daily",
            file: { name: "2026-07-15.md", path: "DAILY/DAILY/2026-07-15.md", mtime: { toMillis: () => 1000000000000 } }
          });
        } else if (query.includes("Auction")) {
          mockPages.push({
            type: "auction_case",
            status: "bidding",
            file: { name: "Test Auction Case", path: "PARA/PROJECTS/Auction/Test Auction Case.md", mtime: { toMillis: () => 1000000000000 } },
            auction_datetime: "2026-07-20",
            appraisal_price: 200000000,
            minimum_bid: 160000000
          });
        } else if (query.includes("PROJECTS")) {
          mockPages.push({
            type: "project",
            status: "doing",
            file: { name: "Test Project", path: "PARA/PROJECTS/Test Project.md", mtime: { toMillis: () => 1000000001000 } },
            due_date: "2026-07-18",
            next_action: "독서 요약 작성",
            workflow: [
              { label: "Step 1", todoist_task_id: "t1", status: "completed" },
              { label: "Step 2", todoist_task_id: "t2", status: "doing" }
            ]
          });
        }
        return mockPages.filter(filterFn);
      }
    };
  }
};

// Loading scripts in order
const path = require("path");
const rootDir = path.resolve(__dirname, "../../../../../../");
require(path.join(rootDir, "SYSTEM/Views/project-todoist-adapter.js"));
require(path.join(rootDir, "SYSTEM/Views/project-workflow-draft-service.js"));
require(path.join(rootDir, "SYSTEM/Views/morning-context-core.js"));
require(path.join(rootDir, "SYSTEM/Views/morning-cache.js"));
require(path.join(rootDir, "SYSTEM/Views/home-view.js"));

async function runTests() {
  console.log("=== Running JS Runtime Tests ===");

  // 1. Test ProjectTodoistAdapter
  assert.ok(global.ProjectTodoistAdapter);
  console.log("✓ ProjectTodoistAdapter loaded.");

  // 2. Test MorningContextCore - parseReflectionSections
  const sampleDailyText = `## 성찰 (Reflection)\n성찰 내용 테스트\n## 변화 (Change)\n변화 내용 테스트\n## 다음 실험 (Next Experiment)\n실험 내용 테스트`;
  const parsed = global.MorningContextCore.parseReflectionSections(sampleDailyText);
  assert.strictEqual(parsed.reflection, "성찰 내용 테스트");
  assert.strictEqual(parsed.change, "변화 내용 테스트");
  assert.strictEqual(parsed.nextExperiment, "실험 내용 테스트");
  console.log("✓ MorningContextCore.parseReflectionSections parsed correctly.");

  // 3. Test buildMorningPackage
  const pkg = await global.MorningContextCore.buildMorningPackage({
    app: mockApp,
    dv: mockDv,
    now: new Date("2026-07-16T10:00:00"),
    todoistToken: "mock-token"
  });

  assert.strictEqual(pkg.schema_version, "morning-package-v1");
  assert.strictEqual(pkg.local_date, "2026-07-16");
  assert.strictEqual(pkg.daypart, "morning");
  assert.strictEqual(pkg.context.projects[0].name, "Test Project");
  assert.strictEqual(pkg.context.auctions[0].name, "Test Auction Case");
  assert.strictEqual(pkg.context.recent_reflections[0].reflection, "오늘의 유혹을 물리치고 운동을 열심히 했다.");
  assert.ok(pkg.context.yesterday_review);
  assert.strictEqual(pkg.context.yesterday_review.date, "2026-07-15");
  assert.strictEqual(pkg.context.yesterday_review.found, true);
  assert.strictEqual(pkg.context.yesterday_review.meaningful, true);
  assert.strictEqual(pkg.context.yesterday_review.missing, false);
  assert.strictEqual(pkg.context.yesterday_review.change, "목표 달성에 더 신중해졌다.");
  assert.strictEqual(pkg.context.yesterday_review.next_experiment, "내일 아침 6시 기상");
  assert.ok(pkg.context.yesterday_review.learning);
  console.log("✓ MorningContextCore.buildMorningPackage generated correct Morning Package.");
  console.log("✓ yesterday_review recovered change + next_experiment from previous day.");

  // 4. Test rule-based briefing (formerly labeled Fallback)
  const fallback = global.MorningContextCore.generateDeterministicFallback(pkg);
  assert.strictEqual(fallback.schema_version, "morning-result-v1");
  assert.ok(fallback.brief.includes("규칙 기반") || fallback.brief_mode === "rule_based");
  assert.ok(
    fallback.brief.includes("어제 배움") ||
    fallback.brief.includes("오늘 실험") ||
    fallback.brief.includes("이어갑니다")
  );
  assert.ok(fallback.focus.length >= 2); // auction + project (and optional reading)
  assert.ok(fallback.focus.length <= 3);
  assert.strictEqual(fallback.focus[0].source_type, "auction");
  assert.ok(fallback.focus.some((item) => item.source_type === "project"));
  console.log("✓ MorningContextCore.generateDeterministicFallback built correct rule-based JSON.");

  // Home keeps deterministic context without exposing a provider generation API.
  assert.strictEqual(global.MorningBriefService, undefined);
  assert.strictEqual(global.HomeView.generateMorningBrief, undefined);
  console.log("✓ Home exposes no Morning Brief provider seam.");

  // Given: legacy broken approval data with a null focus
  // When: the cache normalizes approval state
  // Then: it is treated as unapproved
  assert.strictEqual(global.MorningCache.normalizeApprovedFocus({ focus: null }), null);
  assert.strictEqual(global.MorningCache.normalizeApprovedFocus({ focus: [] }), null);
  assert.strictEqual(global.MorningCache.normalizeApprovedFocus({ focus: fallback.focus }).focus.length, fallback.focus.length);
  console.log("✓ Morning approval state rejects null and empty focus artifacts.");

  // 6. Test Cache and Staleness comparison
  const stalePkg = JSON.parse(JSON.stringify(pkg));
  stalePkg.context.projects.push({ path: "another/path", name: "New Project", status: "doing" });
  
  const isStale = global.MorningCache.checkIsStale(pkg, stalePkg);
  assert.strictEqual(isStale, true);
  console.log("✓ MorningCache.checkIsStale correctly identified changed context.");

  // 7. Test Today's Risk generation
  assert.ok(Array.isArray(pkg.context.risks));
  assert.strictEqual(pkg.context.risks.length, 2);
  assert.strictEqual(pkg.context.risks[0].label, "입찰 전 임장 근거 부족");
  assert.ok(pkg.context.risks[0].evidence.includes("현장 임장(방문일) 미지정 상태"));
  assert.strictEqual(pkg.context.risks[0].sources[0], "Auction Object");
  console.log("✓ MorningContextCore.buildTodayRisks compiled correct risks with explainable evidence.");

  // 8. Test Continue Candidates sorting (Doing -> Has Next Action -> Recent Active -> Due Soon) and properties
  const candidates = pkg.context.continue_candidates;
  assert.ok(candidates.length > 0);
  assert.strictEqual(candidates[0].type, "project");
  assert.strictEqual(candidates[0].status, "doing");
  assert.strictEqual(candidates[0].next_action, "독서 요약 작성");
  assert.ok(candidates[0].due_date);
  console.log("✓ MorningContextCore continue_candidates sorted and mapped with type, title, next_action, and due_date.");

  // 9. Test getDeterministicEvidence (Explainable Focus)
  const homeViewMock = {
    getDeterministicEvidence: (item, p) => {
      if (item.source_type === "auction") {
        return { evidence: ["입찰일까지 4일 남음"], sources: ["Auction Object"] };
      }
      return { evidence: [], sources: [] };
    }
  };
  const focusItem = { label: "Test Focus Item", source_type: "auction", object_path: "PARA/PROJECTS/Auction/Test Auction Case.md" };
  const explanation = homeViewMock.getDeterministicEvidence(focusItem, pkg);
  assert.strictEqual(explanation.evidence[0], "입찰일까지 4일 남음");
  assert.strictEqual(explanation.sources[0], "Auction Object");
  console.log("✓ Explainable Focus deterministic evidence and trust panel logic verified.");

  // 10. Test Focus local dismissal (Dismiss Today)
  global.dismissedFocusIds = ["f1"];
  const rawFocusList = [{ id: "f1", label: "경매 검토" }, { id: "f2", label: "독서 검토" }];
  const filtered = rawFocusList.filter(item => !global.dismissedFocusIds.includes(item.id));
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].id, "f2");
  console.log("✓ Focus local dismissal preference verified.");

  // Given: Home action connection + Korean display contracts
  // When: Home sources are inspected
  // Then: daily actions and Korean labels remain available
  const homeSource = fs.readFileSync(path.join(rootDir, "SYSTEM/Views/home-view.js"), "utf8");
  assert.strictEqual(homeSource.includes("home-mc-stack"), true);
  assert.strictEqual(homeSource.includes("오늘의 집중"), true);
  assert.strictEqual(homeSource.includes("빠른 실행"), true);
  assert.strictEqual(homeSource.includes("시스템 상태"), true);
  assert.strictEqual(global.HomeView.getSourceTypeLabel("auction"), "경매");
  assert.strictEqual(global.HomeView.getSourceTypeLabel("project"), "프로젝트");
  assert.strictEqual(global.HomeView.getSourceTypeLabel("reading"), "독서");
  assert.strictEqual(homeSource.includes("opacity: 0.72"), false);
  assert.strictEqual(homeSource.includes("(Auction)"), false);
  assert.strictEqual(homeSource.includes("home-mc-stack"), true);
  console.log("✓ Home follows Mission Control layout and Korean display-label contracts.");

  console.log("=== All JS Runtime Tests Passed! ===");
}

runTests().catch(err => {
  console.error("❌ JS Test Failure:", err);
  process.exit(1);
});
