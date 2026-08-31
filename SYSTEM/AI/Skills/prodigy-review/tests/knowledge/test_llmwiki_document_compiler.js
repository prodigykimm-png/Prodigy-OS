"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const compilerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-document-compiler.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));

function fixture() {
  const source = {
    source_id: "source_investment",
    source_path: "INBOX/투놀카페/투놀카페 - 투자일기.md",
    content_hash: "a".repeat(64),
  };
  const citations = [1, 2, 3].map((index) => ({
    citation_id: `citation_${String(index).padStart(24, "0")}`,
    source_id: source.source_id,
    content_hash: source.content_hash,
    source_path: source.source_path,
    locators: [`${source.source_path}#${index * 10}-${index * 10 + 8}`],
    evidence_quote: `근거 ${index}`,
    confidence: "explicit",
  }));
  const claims = [
    { claim_id: `claim_${"1".repeat(24)}`, role: "source_summary", topic: "개요", text: "투자 기록은 건축과 토지를 함께 다룬다.", citation_ids: [citations[0].citation_id], suggested_candidate_ids: [] },
    { claim_id: `claim_${"2".repeat(24)}`, role: "reusable_claim", topic: "직영 건축", text: "직영 공사는 공정별 비용을 줄인다.", citation_ids: [citations[1].citation_id], suggested_candidate_ids: [] },
    { claim_id: `claim_${"3".repeat(24)}`, role: "reusable_claim", topic: "직영 건축", text: "철골조는 공사 기간을 단축한다.", citation_ids: [citations[2].citation_id], suggested_candidate_ids: [] },
  ];
  const inventoryBody = {
    inventory_version: "llmwiki_claim_inventory_v3",
    source,
    claims,
    citations,
  };
  const inventory = { ...inventoryBody, inventory_hash: hash.sha256(stable(inventoryBody)) };
  const page = {
    page_id: `page_${"4".repeat(24)}`,
    title: "직영 건축의 비용과 기간",
    purpose: "직영 공사와 철골조 선택의 효과를 설명한다.",
    claim_ids: [claims[1].claim_id, claims[2].claim_id],
    target_candidate_ids: [],
    operation_hint: "create",
    evidence_count: 2,
    selected: true,
  };
  const planBody = {
    plan_version: "llmwiki_page_plan_v1",
    inventory_hash: inventory.inventory_hash,
    source,
    source_guide: {
      title: "투놀카페 - 투자일기 자료 안내",
      overview: "건축과 투자 판단을 축적한 기록이다.",
      sections: [{ heading: "건축 투자", summary: "직영 공사와 구조 선택을 다룬다.", claim_ids: claims.map((claim) => claim.claim_id) }],
      key_questions: ["직영 공사의 절감 효과는 얼마인가?"],
    },
    pages: [page],
    source_only_claim_ids: [],
    status: "approved",
    plan_revision: 1,
  };
  const plan = { ...planBody, plan_hash: hash.sha256(stable(planBody)) };
  return { source, inventory, plan, page, claims, citations };
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

test("approved plan compiles a concise source guide and evidence-bound article", async () => {
  const { inventory, plan, page, claims } = fixture();
  const compiler = compilerApi.createDocumentCompiler({
    requestArticles: async (request) => ({
      articles: request.pages.map((row) => ({
        page_id: row.page_id,
        sections: [{
          heading: "비용과 공기",
          paragraphs: [{
            text: "직영 공사는 비용을 줄이고 철골조는 공사 기간을 단축한다.",
            claim_ids: row.claim_ids,
          }],
        }],
      })),
    }),
  });

  const result = await compiler.compile({ inventory, approved_plan: plan });

  assert.equal(result.ok, true, result.reason);
  assert.equal(result.documents.length, 2);
  const guide = result.documents.find((document) => document.document_kind === "source_guide");
  const article = result.documents.find((document) => document.document_kind === "topic_article");
  assert.equal(guide.role, "source_summary");
  assert.match(guide.body, /## 자료 개요/u);
  assert.match(guide.body, /\[\[직영 건축의 비용과 기간\]\]/u);
  assert.doesNotMatch(guide.body, /직영 공사는 공정별 비용을 줄인다/u, "guide must not dump every raw claim");
  assert.equal(article.page_id, page.page_id);
  assert.match(article.body, /직영 공사는 비용을 줄이고 철골조는 공사 기간을 단축한다/u);
  assert.equal(article.claims.length, 2);
  assert.deepEqual(article.claims.map((claim) => claim.claim_id), [claims[1].claim_id, claims[2].claim_id]);
  assert.equal(article.citations.length, 2);
  assert.equal(article.paragraphs.every((paragraph) => paragraph.claim_ids.length > 0), true);
});

test("quality receipt is self-verifying and detects rule or document drift", () => {
  const documents = [{ document_kind: "topic_article", title: "지속성", sections: [] }];
  const input = {
    source_hash: "a".repeat(64),
    inventory_hash: "b".repeat(64),
    plan_hash: "c".repeat(64),
    documents,
    quality_status: "publishable",
    quality_issues: [],
    quality_rewrite_count: 1,
  };
  const receipt = compilerApi.createQualityReceipt(input);
  assert.match(receipt.receipt_hash, /^[0-9a-f]{64}$/u);
  assert.equal(compilerApi.inspectQualityReceipt(receipt, input).status, "publishable");
  assert.equal(compilerApi.inspectQualityReceipt(receipt, { ...input, documents: [{ ...documents[0], title: "변조" }] }).status, "invalid");
  assert.equal(compilerApi.inspectQualityReceipt({ ...receipt, quality_rules_version: "old_rules" }, input).status, "invalid");
  const oldBody = {
    receipt_version: receipt.receipt_version,
    source_hash: receipt.source_hash,
    inventory_hash: receipt.inventory_hash,
    plan_hash: receipt.plan_hash,
    compiler_version: receipt.compiler_version,
    quality_rules_version: "llmwiki_quality_rules_v0",
    compiled_hash: receipt.compiled_hash,
    quality_status: receipt.quality_status,
    quality_issues: receipt.quality_issues,
    quality_rewrite_count: receipt.quality_rewrite_count,
  };
  const oldReceipt = { ...oldBody, receipt_hash: hash.sha256(stable(oldBody)) };
  assert.equal(compilerApi.inspectQualityReceipt(oldReceipt, input).status, "revalidation_required");
});

test("compiler rejects unsupported prose and incomplete claim coverage", async () => {
  const { inventory, plan, page, claims } = fixture();
  const compiler = compilerApi.createDocumentCompiler({
    requestArticles: async () => ({
      articles: [{
        page_id: page.page_id,
        sections: [{
          heading: "불완전",
          paragraphs: [{
            text: "한 주장만 사용한다.",
            claim_ids: [claims[1].claim_id, `claim_${"f".repeat(24)}`],
          }],
        }],
      }],
    }),
  });

  const result = await compiler.compile({ inventory, approved_plan: plan });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_compiled_article_coverage");
});

test("compiler rewrites duplicated draft prose once before publishing", async () => {
  const { inventory, plan } = fixture();
  let calls = 0;
  const compiler = compilerApi.createDocumentCompiler({
    requestArticles: async (request) => {
      calls += 1;
      return {
        articles: request.pages.map((page) => ({
          page_id: page.page_id,
          sections: [{
            heading: "비용과 공기",
            paragraphs: [{
              text: calls === 1
                ? "직영 공사는 공정별 비용을 줄인다. 직영 공사는 공정별 비용을 절감한다. 철골조는 공사 기간을 단축한다."
                : "직영 공사는 공정별 비용을 줄이고, 철골조는 공사 기간을 단축한다.",
              claim_ids: page.claim_ids,
            }],
          }],
        })),
      };
    },
  });

  const result = await compiler.compile({ inventory, approved_plan: plan });

  assert.equal(result.ok, true, result.reason);
  assert.equal(calls, 2);
  assert.equal(result.quality_status, "publishable");
  assert.equal(result.quality_rewrite_count, 1);
  const article = result.documents.find((document) => document.document_kind === "topic_article");
  assert.equal(article.paragraphs[0].text, "직영 공사는 공정별 비용을 줄이고, 철골조는 공사 기간을 단축한다.");
  assert.deepEqual(article.paragraphs[0].claim_ids, plan.pages[0].claim_ids);
});

test("compiler deterministically corrects source-borne draft terms without another provider call", async () => {
  const { inventory, plan } = fixture();
  let calls = 0;
  const compiler = compilerApi.createDocumentCompiler({
    requestArticles: async (request) => {
      calls += 1;
      return {
        articles: request.pages.map((page) => ({
          page_id: page.page_id,
          sections: [{
            heading: "투자 기준",
            paragraphs: [{
              text: "직영 공사는 공정별 비용을 줄이고 철골조는 공사 기간을 단축하므로, 물건 선주의 시 공주가를 확인한다.",
              claim_ids: page.claim_ids,
            }],
          }],
        })),
      };
    },
  });

  const result = await compiler.compile({ inventory, approved_plan: plan });

  assert.equal(result.ok, true, result.reason);
  assert.equal(result.quality_status, "publishable");
  assert.equal(result.quality_rewrite_count, 0);
  assert.equal(calls, 1);
  assert.doesNotMatch(result.documents.find((row) => row.document_kind === "topic_article").body, /물건 선주의|공주가/u);
});

test("compiler blocks prose that loses its bound claim meaning after one rewrite", async () => {
  const { inventory, plan } = fixture();
  let calls = 0;
  const compiler = compilerApi.createDocumentCompiler({
    requestArticles: async (request) => {
      calls += 1;
      return {
        articles: request.pages.map((page) => ({
          page_id: page.page_id,
          sections: [{
            heading: "일반 설명",
            paragraphs: [{ text: "좋은 선택은 상황에 따라 달라질 수 있다.", claim_ids: page.claim_ids }],
          }],
        })),
      };
    },
  });

  const result = await compiler.compile({ inventory, approved_plan: plan });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "article_quality_review_required");
  assert.equal(result.quality_status, "blocked");
  assert.equal(result.quality_rewrite_count, 1);
  assert.equal(calls, 2);
  assert.equal(result.quality_issues.some((issue) => issue.code === "claim_meaning_not_preserved"), true);
  assert.equal(result.canonical_writes, 0);
  assert.equal(result.source_writes, 0);
});

test("verification-sensitive claims produce machine flags and visible review warning", async () => {
  const base = fixture();
  const inventoryBody = {
    inventory_version: base.inventory.inventory_version,
    source: base.inventory.source,
    claims: base.inventory.claims.map((claim, index) => ({
      ...claim,
      text: index === 1
        ? "도시지역 농지는 농지취득자격증명 없이 개발 인허가가 가능하다."
        : index === 2
          ? "주택 담보대출 한도는 감정가의 70%까지 가능하다."
          : claim.text,
    })),
    citations: base.inventory.citations,
  };
  const inventory = { ...inventoryBody, inventory_hash: hash.sha256(stable(inventoryBody)) };
  const planBody = {
    ...Object.fromEntries(Object.entries(base.plan).filter(([key]) => key !== "plan_hash")),
    inventory_hash: inventory.inventory_hash,
  };
  const plan = { ...planBody, plan_hash: hash.sha256(stable(planBody)) };
  const compiler = compilerApi.createDocumentCompiler({
    requestArticles: async (request) => ({
      articles: request.pages.map((page) => ({
        page_id: page.page_id,
        sections: [{
          heading: "검증 대상",
          paragraphs: [{ text: "인허가와 대출 조건은 최신 기준 확인이 필요하다.", claim_ids: page.claim_ids }],
        }],
      })),
    }),
  });

  const result = await compiler.compile({ inventory, approved_plan: plan });

  assert.equal(result.ok, true, result.reason);
  const article = result.documents.find((document) => document.document_kind === "topic_article");
  assert.deepEqual(article.verification_flags.map((flag) => flag.code).sort(), ["finance_lending", "legal_regulatory", "time_sensitive_numeric"]);
  assert.match(article.body, /\[!warning\] 최신 기준 확인 필요/u);
  assert.match(article.body, /법률·인허가·세무/u);
  assert.match(article.body, /대출·담보·감정평가/u);
});
