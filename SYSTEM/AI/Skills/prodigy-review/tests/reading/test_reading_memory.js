"use strict";

const assert = require("node:assert/strict");
const { ROOT, core, fs, path, reading, retrieval } = require("./reading_memory_test_fixtures.js");
const { runStoreCases } = require("./reading_memory_store_cases.js");
const TEMPLATE_PATH = path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_reading.md");
const CARD_PATH = path.join(ROOT, "SYSTEM/Views/reading-card.js");

function testBaselineContract() {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const card = fs.readFileSync(CARD_PATH, "utf8");
  for (const term of ["purpose", "reading_purpose", "current_page", "total_page", "total_pages", "progress"]) {
    assert.equal(template.includes(term), false, `template still contains ${term}`);
    assert.equal(card.includes(term), false, `card still contains ${term}`);
  }
}

function testProjectionAliasesAndSafety() {
  const legacy = reading(
    {
      book_title: "생각에 관한 생각",
      author: "대니얼 카너먼",
      category: "심리학",
      start_date: "2026-07-01",
      finish_date: "2026-07-02",
      current_page: 87,
      total_page: 520,
    },
    [
      "# 생각에 관한 생각",
      "## 핵심 노트",
      "- 인지적 편향은 판단에 영향을 준다",
      "## 인사이트",
      "- 독립적인 기준을 먼저 세운다",
      "## 적용",
      "- 입찰 전 시세를 따로 조사한다",
      "관련 지식: [[ZETA/의사결정 원칙]]",
    ].join("\n"),
    "PARA/PROJECTS/Reading/생각에 관한 생각.md",
  );
  const before = legacy.content;
  const projected = core.projectReadingSource(legacy);

  assert.equal(projected.title, "생각에 관한 생각");
  assert.equal(projected.started, "2026-07-01");
  assert.equal(projected.finished, "2026-07-02");
  assert.deepEqual(projected.topics, ["심리학"]);
  assert.deepEqual(projected.core_claims, ["인지적 편향은 판단에 영향을 준다"]);
  assert.deepEqual(projected.my_thoughts, ["독립적인 기준을 먼저 세운다"]);
  assert.deepEqual(projected.applications, ["입찰 전 시세를 따로 조사한다", "관련 지식: [[ZETA/의사결정 원칙]]"]);
  assert.deepEqual(projected.knowledge_links, ["ZETA/의사결정 원칙"]);
  assert.ok(projected.legacy_sources_used.includes("frontmatter.book_title"));
  assert.ok(projected.legacy_sources_used.includes("frontmatter.start_date"));
  assert.ok(projected.legacy_sources_used.includes("frontmatter.finish_date"));
  assert.ok(projected.legacy_sources_used.includes("heading.핵심 노트"));
  assert.equal(Object.hasOwn(projected, "current_page"), false);
  assert.equal(Object.hasOwn(projected, "total_page"), false);
  assert.equal(legacy.content, before, "projection modified source content");

  const canonical = reading(
    { title: "Canonical Book", author: "Author", finished: "2026-07-10", topics: "focus, habits" },
    "# Canonical Book\n## Key Takeaways\n- Practice changes behavior\n## What I Learned\n- Small loops matter\n## Action Items\n- Run one experiment",
  );
  const canonicalEntry = core.projectReadingSource(canonical);
  assert.equal(canonicalEntry.title, "Canonical Book");
  assert.equal(canonicalEntry.finished, "2026-07-10");
  assert.deepEqual(canonicalEntry.topics, ["focus", "habits"]);
  assert.deepEqual(canonicalEntry.my_thoughts, ["Small loops matter"]);

  for (const [field, expected] of [["finish_date", "2026-01-02"], ["finish_read_date", "2026-01-03"]]) {
    const entry = core.projectReadingSource(reading({ title: "Alias", [field]: expected }, "# Alias"));
    assert.equal(entry.finished, expected);
  }
  for (const [field, expected] of [["start_date", "2026-01-01"], ["start_read_date", "2026-01-02"]]) {
    const entry = core.projectReadingSource(reading({ title: "Alias", [field]: expected }, "# Alias"));
    assert.equal(entry.started, expected);
  }
  const filenameFallback = core.projectReadingSource(reading({}, "", "PARA/PROJECTS/Reading/파일 제목.md"));
  assert.equal(filenameFallback.title, "파일 제목");
  const malformedLegacy = core.projectReadingSource(reading(
    { title: "Malformed" },
    "# Malformed\n### Action Items\n-## Object Summary\n| Property | Value |\n| status | reading |",
  ));
  assert.deepEqual(malformedLegacy.applications, []);

  for (const excluded of [
    "SYSTEM/AI/Memory/reading/entries/x.json",
    "SYSTEM/PRIVATE/Reading/private.md",
    "SYSTEM/SECRETS/Reading/key.md",
    "Trash/Reading/deleted.md",
    "PARA/PROJECTS/Reading/../../SYSTEM/SECRETS/key.md",
  ]) {
    assert.equal(core.isEligibleReadingPath(excluded), false, `${excluded} should be excluded`);
  }
}

function memoryEntry(overrides) {
  return {
    schema_version: "prodigy-reading-memory-v1",
    source_path: "PARA/PROJECTS/Reading/base.md",
    source_mtime: 1,
    source_hash: "hash",
    title: "Base",
    author: "",
    status: "completed",
    book_type: "",
    started: "",
    finished: "",
    topics: [],
    key_concepts: [],
    core_claims: [],
    my_thoughts: [],
    applications: [],
    thinking_before: "",
    thinking_after: "",
    thinking_delta: "",
    review_summary: "",
    explicit_links: [],
    knowledge_links: [],
    legacy_sources_used: [],
    ...overrides,
  };
}

function testDeterministicRetrieval() {
  const query = memoryEntry({
    source_path: "PARA/PROJECTS/Reading/query.md",
    title: "Query",
    author: "공통 저자",
    topics: ["의사결정"],
    key_concepts: ["환경 설계"],
    core_claims: ["환경을 먼저 바꾸면 행동이 달라진다"],
    thinking_delta: "의지보다 환경을 먼저 본다",
    explicit_links: ["Linked Book"],
    knowledge_links: ["ZETA/행동 원칙"],
  });
  const candidates = [
    memoryEntry({ source_path: "PARA/PROJECTS/Reading/topic.md", title: "Topic", topics: ["의사결정"] }),
    memoryEntry({ source_path: "PARA/PROJECTS/Reading/concept.md", title: "Concept", key_concepts: ["환경 설계"] }),
    memoryEntry({ source_path: "PARA/PROJECTS/Reading/linked.md", title: "Linked Book" }),
    memoryEntry({ source_path: "PARA/PROJECTS/Reading/knowledge.md", title: "Knowledge", knowledge_links: ["ZETA/행동 원칙"] }),
    memoryEntry({ source_path: "PARA/PROJECTS/Reading/claim.md", title: "Claim", core_claims: ["환경을 바꾸면 행동이 달라진다"] }),
    memoryEntry({ source_path: "PARA/PROJECTS/Reading/author.md", title: "Author", author: "공통 저자" }),
    memoryEntry({ source_path: query.source_path, title: "Self", topics: ["의사결정"] }),
    memoryEntry({ source_path: "PARA/PROJECTS/Reading/topic.md", title: "Duplicate", topics: ["의사결정"] }),
  ];
  const first = retrieval.retrieveReadingMemoryCandidates(query, candidates);
  const second = retrieval.retrieveReadingMemoryCandidates(query, candidates);

  assert.deepEqual(first, second, "retrieval ordering must be deterministic");
  assert.equal(first.length, 5);
  assert.deepEqual(retrieval.retrieveReadingMemoryCandidates(query, candidates, 0), []);
  assert.deepEqual(retrieval.retrieveReadingMemoryCandidates(query, candidates, -1), []);
  assert.equal(first.some((item) => item.source_path === query.source_path), false);
  assert.equal(new Set(first.map((item) => item.source_path)).size, first.length);
  assert.ok(first.some((item) => item.relation_types.includes("shared_topic")));
  assert.ok(first.some((item) => item.relation_types.includes("shared_concept")));
  assert.ok(first.some((item) => item.relation_types.includes("explicit_link")));
  assert.ok(first.some((item) => item.relation_types.includes("related_knowledge")));
  for (const item of first) {
    assert.equal(Object.hasOwn(item, "confidence"), false);
    assert.equal(Object.hasOwn(item, "score"), false);
    assert.ok(item.reason);
    assert.ok(item.evidence.length > 0);
    assert.deepEqual(item.ordering_basis.source_path, item.source_path);
  }
  const claimOnly = retrieval.retrieveReadingMemoryCandidates(query, [candidates[4]]);
  assert.ok(claimOnly[0].relation_types.includes("claim_keyword_overlap"));
  const authorOnly = retrieval.retrieveReadingMemoryCandidates(query, [candidates[5]]);
  assert.deepEqual(authorOnly[0].relation_types, ["same_author"]);
  const deltaOnly = retrieval.retrieveReadingMemoryCandidates(
    query,
    [memoryEntry({ source_path: "PARA/PROJECTS/Reading/delta.md", title: "Delta", thinking_delta: "환경을 먼저 바꾸고 의지를 덜 믿는다" })],
  );
  assert.ok(deltaOnly[0].relation_types.includes("thinking_delta_relation"));
}

async function main() {
  testBaselineContract();
  testProjectionAliasesAndSafety();
  await runStoreCases();
  testDeterministicRetrieval();
  console.log("Reading Memory runtime tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
