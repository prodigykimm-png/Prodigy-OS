"use strict";
// LLM Wiki 검토 테스트용 합성 픽스처.
//
// 이 파일 하나로 검토/채택/반려 테스트가 자기완결적으로 돌아간다: 라이브 볼트
// (SYSTEM/CACHE, INBOX, ZETA)나 .omo 증거 파일을 읽지 않는다. 소유자의 실제 지식
// 노트 내용도 리포지토리에 복사하지 않는다 — 전부 합성 문장이다.
const path = require("node:path");

const V = path.resolve(__dirname, "../../../../../../..", "SYSTEM", "Views");
const hash = require(path.join(V, "llmwiki-hash.js"));
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
const reviewModule = require(path.join(V, "llmwiki-document-canonical-review.js"));
const store = require(path.join(V, "knowledge-candidate-store.js"));
const { FakeElement } = require(path.join(__dirname, "..", "knowledge_explorer_view_fakes.js"));

const SOURCE_PATH = "INBOX/synthetic fixture source.md";
const SOURCE_ID = "source_synthetic_fixture";
const CLAIM_ONE = "혼주 사진을 배치할 때는 신랑측 혼주를 먼저 배치한다.";
const CLAIM_TWO = "대칭 구도 사진을 나란히 쓸 때는 머리 높이를 맞춘다.";
const OVERLAP_SENTENCE = "기존 규칙 둘: 머리 높이를 맞춘다.";
const SOURCE_BYTES = ["합성 촬영 기준", "", CLAIM_ONE, CLAIM_TWO, ""].join("\n");
const SOURCE_REVISION = hash.sha256(SOURCE_BYTES);

const LEGACY_PATH = "ZETA/PERMANENT/합성 레거시 가이드.md";
const LEGACY_TITLE = "합성 레거시 가이드";
const LEGACY_BYTES = [
  "---",
  "type: knowledge",
  `title: "${LEGACY_TITLE}"`,
  'knowledge_domain: "wedding"',
  "knowledge_topics:",
  '  - "editing"',
  "application_contexts:",
  '  - "합성 작업"',
  'invalidation_conditions: ["규격이 바뀌는 경우"]',
  "---",
  "",
  `# ${LEGACY_TITLE}`,
  "",
  "## 기존 절",
  "- 기존 규칙 하나: 혼주 사진은 신랑측을 먼저 둔다.",
  `- ${OVERLAP_SENTENCE}`,
  "",
  "## 기존 체크리스트",
  "- 기존 체크 항목 하나",
  "",
].join("\n");
const LEGACY_REVISION = hash.sha256(LEGACY_BYTES);
const PLAN_HASH = hash.sha256("synthetic fixture plan");

function citation(quote, line) {
  return { source_id: SOURCE_ID, source_path: SOURCE_PATH, locator: `${SOURCE_PATH}#L${line}`, content_hash: SOURCE_REVISION, evidence_quote: quote };
}

// 허브가 만드는 compiled_document 아이템과 같은 모양. 소유자 데이터 없이 합성 문장만 쓴다.
function makeItem({ reviewId = "plan_compiled_synthetic_fixture", title = "합성 합성 페이지", purpose = "합성 목적", sections, related = [], targetPath = LEGACY_PATH } = {}) {
  const claims = [
    { claim_id: "claim_fixture_one", text: CLAIM_ONE, citations: [citation(CLAIM_ONE, 3)] },
    { claim_id: "claim_fixture_two", text: CLAIM_TWO, citations: [citation(CLAIM_TWO, 4)] },
  ];
  const compiledSections = sections || [{
    heading: "합성 절",
    paragraphs: [
      { text: CLAIM_ONE, claim_ids: ["claim_fixture_one"] },
      { text: CLAIM_TWO, claim_ids: ["claim_fixture_two"] },
    ],
  }];
  return {
    review_id: reviewId, plan: true, plan_kind: "compiled_document", plan_page_id: "page_synthetic_fixture",
    compiled_kind: "topic_article", compiled_order: 1, plan_purpose: purpose, title,
    document_body: `# ${title}\n\n> ${purpose}\n\n## 합성 절\n\n${CLAIM_ONE}\n\n${CLAIM_TWO}\n`,
    compiled_sections: compiledSections, grounded_claims: claims, related_knowledge: related,
    proposed_target: { path: targetPath, revision: LEGACY_REVISION, action: "update" }, operation: "update",
  };
}

function memoryVault(seed = {}) {
  const files = new Map();
  const writes = [];
  const record = (filePath, bytes) => ({ path: filePath, bytes, extension: filePath.endsWith(".md") ? "md" : "json", basename: filePath.split("/").pop().replace(/\.[^.]+$/u, "") });
  for (const [filePath, bytes] of Object.entries(seed)) files.set(filePath, record(filePath, bytes));
  const app = {
    vault: {
      getAbstractFileByPath: (filePath) => files.get(filePath) || null,
      getFiles: () => [...files.values()],
      getMarkdownFiles: () => [...files.values()].filter((file) => file.path.endsWith(".md")),
      read: async (file) => files.get(typeof file === "string" ? file : file.path).bytes,
      cachedRead: async (file) => files.get(typeof file === "string" ? file : file.path).bytes,
      createFolder: async () => {},
      create: async (filePath, bytes) => { writes.push(["create", filePath]); files.set(filePath, record(filePath, bytes)); return files.get(filePath); },
      modify: async (file, bytes) => { const filePath = typeof file === "string" ? file : file.path; writes.push(["modify", filePath]); files.get(filePath).bytes = bytes; return files.get(filePath); },
      delete: async (file) => { const filePath = typeof file === "string" ? file : file.path; writes.push(["delete", filePath]); files.delete(filePath); },
    },
    metadataCache: { getFileCache: () => ({ frontmatter: {} }) },
  };
  return { app, files, writes, bytes: (filePath) => (files.get(filePath) || {}).bytes || "" };
}

class FixtureModal {
  constructor() { this.contentEl = new FakeElement("section"); this.closed = false; }
  open() { this.ready = this.onOpen(); }
  close() { this.closed = true; this.onClose?.(); }
}

const find = (node, pred) => [...(pred(node) ? [node] : []), ...(node.children || []).flatMap((child) => find(child, pred))];
const byAttr = (el, name) => find(el, (node) => node.attr?.[name] !== undefined);
const byAction = (el, action) => find(el, (node) => node.attr?.["data-action"] === action)[0] || null;
const field = (el, name) => find(el, (node) => node.attr?.["data-review-field"] === name)[0];
const statusText = (el) => (find(el, (node) => node.attr?.["data-decision-status"] !== undefined)[0] || {}).textContent || "";

// 검토 화면을 실제 제품 경로로 연다(라이브 볼트 접근 없음).
async function openReview({ item = makeItem(), files = {}, targetPath = LEGACY_PATH, targetBytes = LEGACY_BYTES, seedLegacy = true, review = null } = {}) {
  const seed = {
    [SOURCE_PATH]: SOURCE_BYTES,
    ...(seedLegacy ? { [targetPath]: targetBytes } : {}),
    ...files,
  };
  const { app, files: vaultFiles, writes, bytes } = memoryVault(seed);
  const disk = new Map();
  const storage = { exists: async (key) => disk.has(key), read: async (key) => disk.get(key), writeAtomic: async (key, value) => disk.set(key, value), quarantine: async () => { throw new Error("unexpected corrupt job"); } };
  const jobStore = jobs.createBatchJobStore({ storage });
  await jobStore.load();
  const job = await jobStore.createJob({ request_key: hash.sha256(`fixture-${item.review_id}`), sources: [{ source_id: SOURCE_ID, revision_hash: SOURCE_REVISION }] });
  await jobStore.savePlanSnapshot({ job_id: job.job_id, source_id: SOURCE_ID, source_revision: SOURCE_REVISION,
    inventory_hash: hash.sha256("synthetic inventory"), plan_hash: PLAN_HASH, plan_revision: 1, status: "compiled",
    plan: { plan_version: "synthetic_fixture_v1", pages: [] } });
  const api = review || reviewModule;
  const flow = api.create({ app, jobStore, jobId: job.job_id });
  const modal = api.open({ app, Modal: FixtureModal, item, jobStore, jobId: job.job_id });
  await modal.ready;
  return { app, vaultFiles, writes, bytes, jobStore, storage, jobId: job.job_id, flow, modal, item };
}

// 같은 스토어/작업 위에서 검토를 다시 연다. 모달을 닫으면 다음 open()이 저장된 초안을
// 복원하므로(제품 경로) 초안 복원 검증에 쓴다 — 스토어를 다시 읽는 재마운트는 remount()다.
async function restoreAgain(harness, { item = null } = {}) {
  const target = item || harness.item;
  const modal = (harness.review || reviewModule).open({ app: harness.app, Modal: FixtureModal, item: target, jobStore: harness.jobStore, jobId: harness.jobId });
  await modal.ready;
  return { ...harness, modal, item: target };
}

// 진짜 재마운트: 같은 저장소에서 상태를 다시 읽어 새 스토어·새 흐름을 만든다.
async function remount(harness, { item = null } = {}) {
  const target = item || harness.item;
  const jobStore = jobs.createBatchJobStore({ storage: harness.storage });
  await jobStore.load();
  const api = harness.review || reviewModule;
  const flow = api.create({ app: harness.app, jobStore, jobId: harness.jobId });
  const modal = api.open({ app: harness.app, Modal: FixtureModal, item: target, jobStore, jobId: harness.jobId });
  await modal.ready;
  return { ...harness, jobStore, flow, modal, item: target };
}

const REVIEW_FIELDS = { knowledge_kind: "claim", classification: "epistemic", knowledge_domain: "wedding", relation_status: "resolved", evidence_strength: "sufficient", conditions: "합성 조건" };

module.exports = {
  V, SOURCE_PATH, SOURCE_ID, SOURCE_BYTES, SOURCE_REVISION, CLAIM_ONE, CLAIM_TWO, OVERLAP_SENTENCE,
  LEGACY_PATH, LEGACY_TITLE, LEGACY_BYTES, LEGACY_REVISION, PLAN_HASH, REVIEW_FIELDS,
  hash, reviewModule, store, makeItem, memoryVault, openReview, restoreAgain, remount, find, byAttr, byAction, field, statusText,
};
