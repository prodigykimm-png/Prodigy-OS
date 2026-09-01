(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("LLMWikiHash is required.");

  const COMPILER_VERSION = "llmwiki_document_compiler_v1";
  const QUALITY_RECEIPT_VERSION = "llmwiki_quality_receipt_v1";
  const QUALITY_RULES_VERSION = "llmwiki_quality_rules_v1";
  const ARTICLE_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["articles"],
    properties: {
      articles: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["page_id", "sections"],
          properties: {
            page_id: { type: "string", pattern: "^page_[0-9a-f]{24}$" },
            sections: {
              type: "array",
              minItems: 1,
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["heading", "paragraphs"],
                properties: {
                  heading: { type: "string", minLength: 1, maxLength: 120 },
                  paragraphs: {
                    type: "array",
                    minItems: 1,
                    maxItems: 20,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["text", "claim_ids"],
                      properties: {
                        text: { type: "string", minLength: 1, maxLength: 4000 },
                        claim_ids: {
                          type: "array",
                          minItems: 1,
                          uniqueItems: true,
                          items: { type: "string", pattern: "^claim_[0-9a-f]{24}$" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clean(value) { return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : ""; }
  const QUALITY_TOKEN = /[가-힣a-z0-9]{2,}/giu;
  const QUALITY_STOPWORDS = new Set(["그리고", "그러나", "따라서", "또한", "대한", "위한", "한다", "있다", "된다", "경우", "것이다"]);
  function qualityToken(token) {
    return token.replace(/(?:으로|에서|에게|까지|부터|처럼|보다|에는|에도|은|는|이|가|을|를|와|과|의|에|도|만)$/u, "");
  }
  function qualityTokens(value) {
    return new Set((clean(value).toLowerCase().match(QUALITY_TOKEN) || [])
      .map(qualityToken).filter((token) => token.length >= 2 && !QUALITY_STOPWORDS.has(token)));
  }
  function tokenCoverage(needle, haystack) {
    const expected = qualityTokens(needle);
    if (expected.size === 0) return 1;
    const actual = qualityTokens(haystack);
    let hits = 0;
    for (const token of expected) {
      if ([...actual].some((candidate) => candidate === token
        || candidate.length >= 2 && token.length >= 2 && (candidate.includes(token) || token.includes(candidate)))) hits += 1;
    }
    return hits / expected.size;
  }
  function tokenSimilarity(left, right) {
    const a = qualityTokens(left);
    const b = qualityTokens(right);
    if (a.size === 0 || b.size === 0) return 0;
    let hits = 0;
    for (const token of a) if (b.has(token)) hits += 1;
    return hits / Math.min(a.size, b.size);
  }
  function sentenceRows(value) {
    return clean(value).split(/(?<=[.!?。！？])\s+/u).map(clean).filter((row) => qualityTokens(row).size >= 3);
  }
  function invalidArticleCoverage(response, selectedPages, claimById) {
    if (!plain(response) || !Array.isArray(response.articles)) return true;
    for (const page of selectedPages) {
      const article = response.articles.find((row) => row?.page_id === page.page_id);
      const allowed = new Set(page.claim_ids);
      if (!plain(article) || !Array.isArray(article.sections)) return true;
      const used = [];
      for (const section of article.sections) {
        if (!plain(section) || !Array.isArray(section.paragraphs)) return true;
        for (const paragraph of section.paragraphs) {
          if (!plain(paragraph) || !Array.isArray(paragraph.claim_ids)
            || paragraph.claim_ids.length === 0 || new Set(paragraph.claim_ids).size !== paragraph.claim_ids.length
            || paragraph.claim_ids.some((claimId) => !allowed.has(claimId) || !claimById.has(claimId))) return true;
          used.push(...paragraph.claim_ids);
        }
      }
      if (new Set(used).size !== allowed.size || [...allowed].some((claimId) => !used.includes(claimId))) return true;
    }
    return false;
  }
  const DRAFT_TERMS = Object.freeze([
    Object.freeze({ pattern: /물건\s*선주의\s*시/gu, replacement: "물건 선정 시", label: "물건 선정 시" }),
    Object.freeze({ pattern: /물건\s*선주의/gu, replacement: "물건 선정의", label: "물건 선정의" }),
    Object.freeze({ pattern: /공주가/gu, replacement: "공동주택 공시가격", label: "공동주택 공시가격" }),
  ]);
  function draftTermIssues(text, location) {
    const issues = [];
    for (const rule of DRAFT_TERMS) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(text)) issues.push(freeze({ code: "draft_term", suggested_term: rule.label, ...location }));
    }
    return issues;
  }
  function normalizeDraftTerms(response) {
    if (!plain(response) || !Array.isArray(response.articles)) return response;
    return {
      ...response,
      articles: response.articles.map((article) => ({
        ...article,
        sections: Array.isArray(article.sections) ? article.sections.map((section) => ({
          ...section,
          paragraphs: Array.isArray(section.paragraphs) ? section.paragraphs.map((paragraph) => {
            let normalized = String(paragraph && paragraph.text || "");
            for (const rule of DRAFT_TERMS) normalized = normalized.replace(rule.pattern, rule.replacement);
            return { ...paragraph, text: normalized };
          }) : section.paragraphs,
        })) : article.sections,
      })),
    };
  }
  function articleQualityIssues(response, selectedPages, claimById) {
    if (!plain(response) || !Array.isArray(response.articles)) return [];
    const issues = [];
    for (const page of selectedPages) {
      const article = response.articles.find((row) => row?.page_id === page.page_id);
      if (!plain(article) || !Array.isArray(article.sections)) continue;
      const seenParagraphs = [];
      for (let sectionIndex = 0; sectionIndex < article.sections.length; sectionIndex += 1) {
        const section = article.sections[sectionIndex];
        if (!plain(section) || !Array.isArray(section.paragraphs)) continue;
        for (let paragraphIndex = 0; paragraphIndex < section.paragraphs.length; paragraphIndex += 1) {
          const paragraph = section.paragraphs[paragraphIndex];
          if (!plain(paragraph) || !clean(paragraph.text) || !Array.isArray(paragraph.claim_ids)) continue;
          const location = { page_id: page.page_id, section_index: sectionIndex, paragraph_index: paragraphIndex };
          issues.push(...draftTermIssues(paragraph.text, location));
          for (const claimId of paragraph.claim_ids) {
            const claim = claimById.get(claimId);
            if (claim && tokenCoverage(claim.text, paragraph.text) < 0.1) {
              issues.push(freeze({ code: "claim_meaning_not_preserved", claim_id: claimId, ...location }));
            }
          }
          const sentences = sentenceRows(paragraph.text);
          for (let left = 0; left < sentences.length; left += 1) {
            for (let right = left + 1; right < sentences.length; right += 1) {
              if (tokenSimilarity(sentences[left], sentences[right]) >= 0.72) {
                issues.push(freeze({ code: "duplicated_sentence", ...location }));
                left = sentences.length;
                break;
              }
            }
          }
          if (seenParagraphs.some((prior) => tokenSimilarity(prior, paragraph.text) >= 0.86)) {
            issues.push(freeze({ code: "duplicated_paragraph", ...location }));
          }
          seenParagraphs.push(paragraph.text);
        }
      }
    }
    return freeze(issues);
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function sha(value) { return hashApi.sha256(String(value)); }
  function qualityReceiptBody(receipt) {
    return {
      receipt_version: receipt.receipt_version,
      source_hash: receipt.source_hash,
      inventory_hash: receipt.inventory_hash,
      plan_hash: receipt.plan_hash,
      compiler_version: receipt.compiler_version,
      quality_rules_version: receipt.quality_rules_version,
      compiled_hash: receipt.compiled_hash,
      quality_status: receipt.quality_status,
      quality_issues: receipt.quality_issues,
      quality_rewrite_count: receipt.quality_rewrite_count,
    };
  }
  function createQualityReceipt(input) {
    const body = {
      receipt_version: QUALITY_RECEIPT_VERSION,
      source_hash: input.source_hash,
      inventory_hash: input.inventory_hash,
      plan_hash: input.plan_hash,
      compiler_version: COMPILER_VERSION,
      quality_rules_version: QUALITY_RULES_VERSION,
      compiled_hash: sha(stable(input.documents)),
      quality_status: input.quality_status,
      quality_issues: Array.isArray(input.quality_issues) ? input.quality_issues : [],
      quality_rewrite_count: Number(input.quality_rewrite_count || 0),
    };
    return freeze({ ...body, receipt_hash: sha(stable(body)) });
  }
  function inspectQualityReceipt(receipt, input) {
    if (!plain(receipt) || receipt.receipt_version !== QUALITY_RECEIPT_VERSION
      || receipt.receipt_hash !== sha(stable(qualityReceiptBody(receipt)))
      || receipt.compiled_hash !== sha(stable(input.documents))) return freeze({ status: "invalid" });
    if (receipt.source_hash !== input.source_hash || receipt.inventory_hash !== input.inventory_hash
      || receipt.plan_hash !== input.plan_hash || receipt.compiler_version !== COMPILER_VERSION
      || receipt.quality_rules_version !== QUALITY_RULES_VERSION) return freeze({ status: "revalidation_required" });
    return freeze({ status: receipt.quality_status, receipt });
  }
  function exactSet(values, expected) {
    return values.length === expected.size && new Set(values).size === values.length && values.every((value) => expected.has(value));
  }
  const VERIFICATION_RULES = Object.freeze([
    Object.freeze({
      code: "legal_regulatory",
      label: "법률·인허가·세무 조건",
      pattern: /허가|인허가|개발 승인|지구단위계획|농지취득|유치권|권리|취득세|증여세|재산세|세금|법원|공유물/iu,
    }),
    Object.freeze({
      code: "finance_lending",
      label: "대출·담보·감정평가 조건",
      pattern: /대출|담보|감정평가|이자|레버리지|전세|월세|보증금/iu,
    }),
    Object.freeze({
      code: "time_sensitive_numeric",
      label: "시점에 따라 달라지는 금액·비율",
      pattern: /\d[\d,.]*\s*(?:%|원|만원|억원|평당)|비과세|한도|세율/iu,
    }),
  ]);
  function classifyVerificationClaims(claims) {
    return freeze(VERIFICATION_RULES.map((rule) => {
      const claimIds = claims.filter((claim) => rule.pattern.test(clean(claim.text))).map((claim) => claim.claim_id);
      return claimIds.length ? { code: rule.code, label: rule.label, claim_ids: claimIds } : null;
    }).filter(Boolean));
  }
  function inventoryBody(inventory) {
    return {
      inventory_version: inventory.inventory_version,
      source: inventory.source,
      claims: inventory.claims,
      citations: inventory.citations,
    };
  }
  function planBody(plan) {
    return {
      plan_version: plan.plan_version,
      inventory_hash: plan.inventory_hash,
      source: plan.source,
      source_guide: plan.source_guide,
      pages: plan.pages,
      source_only_claim_ids: plan.source_only_claim_ids,
      status: plan.status,
      plan_revision: plan.plan_revision,
    };
  }
  function renderGuide(guide, pages, sourcePath) {
    const sections = guide.sections.map((section) => `### ${section.heading}\n\n${section.summary}`).join("\n\n");
    const pageLinks = pages.length ? pages.map((page) => `- [[${page.title}]] — ${page.purpose}`).join("\n") : "- 승인된 주제 문서 없음";
    const questions = guide.key_questions.length ? guide.key_questions.map((question) => `- ${question}`).join("\n") : "- 추가 질문 없음";
    return `# ${guide.title}\n\n> [!info] 자료 안내\n> 원문을 탐색하기 위한 출처 가이드이며, 정본 지식이 아닙니다.\n\n## 자료 개요\n\n${guide.overview}\n\n## 문서 지도\n\n${sections}\n\n## 연결 문서\n\n${pageLinks}\n\n## 더 살펴볼 질문\n\n${questions}\n\n## 원본\n\n- ${sourcePath}\n`;
  }
  function renderArticle(page, sections, claims, citations, verificationFlags, tags = []) {
    const body = sections.map((section) => `## ${section.heading}\n\n${section.paragraphs.map((paragraph) => paragraph.text).join("\n\n")}`).join("\n\n");
    const claimLines = claims.map((claim) => `- ${claim.text}`).join("\n");
    const sourceLines = [...new Set(citations.flatMap((citation) => citation.locators || []))].map((locator) => `- ${locator}`).join("\n");
    const verification = verificationFlags.length
      ? `\n> [!warning] 최신 기준 확인 필요\n> 검증 항목: ${verificationFlags.map((flag) => `${flag.label} ${flag.claim_ids.length}건`).join(" · ")}. 원문 기록 시점과 현재 기준을 대조하세요.\n`
      : "";
    const frontmatter = tags.length ? `---\ntags:\n${tags.map((tag) => `  - ${tag}`).join("\n")}\n---\n` : "";
    return `${frontmatter}# ${page.title}\n\n> [!info] 검토 상태\n> 원문 근거에서 편집한 지식 후보이며, 아직 정본으로 승격되지 않았습니다.\n${verification}\n> ${page.purpose}\n\n${body}\n\n## 근거 주장\n\n${claimLines}\n\n## 출처\n\n${sourceLines}\n`;
  }

  function createDocumentCompiler(options = {}) {
    if (typeof options.requestArticles !== "function") throw new TypeError("article_provider_required");

    async function compile(input) {
      const inventory = input && input.inventory;
      const plan = input && input.approved_plan;
      if (!plain(inventory) || inventory.inventory_version !== "llmwiki_claim_inventory_v3"
        || !Array.isArray(inventory.claims) || !Array.isArray(inventory.citations)
        || inventory.inventory_hash !== sha(stable(inventoryBody(inventory)))) {
        return freeze({ ok: false, reason: "invalid_claim_inventory" });
      }
      if (!plain(plan) || plan.plan_version !== "llmwiki_page_plan_v1" || plan.status !== "approved"
        || plan.inventory_hash !== inventory.inventory_hash || !Array.isArray(plan.pages)
        || plan.plan_hash !== sha(stable(planBody(plan)))) {
        return freeze({ ok: false, reason: "approved_page_plan_required" });
      }
      const selectedPages = plan.pages.filter((page) => page.selected !== false);
      const executionRows = new Map((input.execution?.resolution?.rows || []).map((row) => [row.page_id, row]));
      const claimById = new Map(inventory.claims.map((claim) => [claim.claim_id, claim]));
      const citationById = new Map(inventory.citations.map((citation) => [citation.citation_id, citation]));
      if (selectedPages.some((page) => !Array.isArray(page.claim_ids) || page.claim_ids.some((claimId) => !claimById.has(claimId)))) {
        return freeze({ ok: false, reason: "invalid_approved_page_claims" });
      }
      const articleRequest = freeze({
        source: inventory.source,
        inventory_hash: inventory.inventory_hash,
        plan_hash: plan.plan_hash,
        pages: selectedPages.map((page) => freeze({
          page_id: page.page_id,
          title: page.title,
          purpose: page.purpose,
          claim_ids: page.claim_ids,
          claims: page.claim_ids.map((claimId) => claimById.get(claimId)),
          citations: [...new Set(page.claim_ids.flatMap((claimId) => claimById.get(claimId).citation_ids))]
            .map((citationId) => citationById.get(citationId)),
        })),
      });
      let response = { articles: [] };
      let qualityRewriteCount = 0;
      if (selectedPages.length > 0) {
        try {
          response = await options.requestArticles(articleRequest);
        } catch (error) {
          return freeze({ ok: false, reason: "article_provider_failed", provider_error: clean(error?.message) || "unknown_provider_error" });
        }
      }
      if (!plain(response) || Object.keys(response).some((key) => key !== "articles") || !Array.isArray(response.articles)) {
        return freeze({ ok: false, reason: "invalid_compiled_articles" });
      }
      const expectedPageIds = new Set(selectedPages.map((page) => page.page_id));
      if (!exactSet(response.articles.map((article) => article && article.page_id), expectedPageIds)) {
        return freeze({ ok: false, reason: "invalid_compiled_article_coverage" });
      }
      if (invalidArticleCoverage(response, selectedPages, claimById)) {
        return freeze({ ok: false, reason: "invalid_compiled_article_coverage" });
      }
      response = normalizeDraftTerms(response);
      let qualityIssues = articleQualityIssues(response, selectedPages, claimById);
      if (qualityIssues.length > 0) {
        qualityRewriteCount = 1;
        try {
          response = await options.requestArticles(freeze({
            ...articleRequest,
            quality_revision: {
              attempt: 1,
              instruction: "Copyedit every supplied article into publication-ready Korean. Correct all spelling, spacing, grammatical, terminology, and awkward draft errors; remove semantic repetition; preserve every bound claim meaning; and keep claim_ids unchanged. Treat source claim wording as factual authority, not as approved prose. Do not add facts.",
              issues: qualityIssues,
              prior_articles: response.articles,
            },
          }));
        } catch (error) {
          return freeze({ ok: false, reason: "article_provider_failed", provider_error: clean(error?.message) || "unknown_provider_error" });
        }
        if (!plain(response) || Object.keys(response).some((key) => key !== "articles") || !Array.isArray(response.articles)) {
          return freeze({ ok: false, reason: "invalid_compiled_articles" });
        }
        if (!exactSet(response.articles.map((article) => article && article.page_id), expectedPageIds)) {
          return freeze({ ok: false, reason: "invalid_compiled_article_coverage" });
        }
        if (invalidArticleCoverage(response, selectedPages, claimById)) {
          return freeze({ ok: false, reason: "invalid_compiled_article_coverage" });
        }
        response = normalizeDraftTerms(response);
      }
      qualityIssues = articleQualityIssues(response, selectedPages, claimById);
      if (qualityIssues.length > 0) {
        return freeze({
          ok: false,
          reason: "article_quality_review_required",
          quality_status: "blocked",
          quality_rewrite_count: qualityRewriteCount,
          quality_issues: qualityIssues,
          canonical_writes: 0,
          source_writes: 0,
        });
      }
      const articles = [];
      for (const page of selectedPages) {
        const article = response.articles.find((row) => row.page_id === page.page_id);
        const allowedClaimIds = new Set(page.claim_ids);
        if (!plain(article) || Object.keys(article).some((key) => !["page_id", "sections"].includes(key))
          || !Array.isArray(article.sections) || article.sections.length === 0 || article.sections.length > 12) {
          return freeze({ ok: false, reason: "invalid_compiled_articles" });
        }
        const usedClaimIds = [];
        const sections = [];
        for (const section of article.sections) {
          if (!plain(section) || Object.keys(section).some((key) => !["heading", "paragraphs"].includes(key))
            || !clean(section.heading) || !Array.isArray(section.paragraphs) || section.paragraphs.length === 0) {
            return freeze({ ok: false, reason: "invalid_compiled_articles" });
          }
          const paragraphs = [];
          for (const paragraph of section.paragraphs) {
            if (!plain(paragraph) || Object.keys(paragraph).some((key) => !["text", "claim_ids"].includes(key))
              || !clean(paragraph.text) || !Array.isArray(paragraph.claim_ids) || paragraph.claim_ids.length === 0
              || new Set(paragraph.claim_ids).size !== paragraph.claim_ids.length
              || paragraph.claim_ids.some((claimId) => !allowedClaimIds.has(claimId))) {
              return freeze({ ok: false, reason: "invalid_compiled_article_coverage" });
            }
            usedClaimIds.push(...paragraph.claim_ids);
            paragraphs.push(freeze({ text: clean(paragraph.text), claim_ids: [...paragraph.claim_ids] }));
          }
          sections.push(freeze({ heading: clean(section.heading), paragraphs }));
        }
        if (new Set(usedClaimIds).size !== allowedClaimIds.size || [...allowedClaimIds].some((claimId) => !usedClaimIds.includes(claimId))) {
          return freeze({ ok: false, reason: "invalid_compiled_article_coverage" });
        }
        const claims = page.claim_ids.map((claimId) => claimById.get(claimId));
        const citations = [...new Set(claims.flatMap((claim) => claim.citation_ids))].map((citationId) => citationById.get(citationId));
        const paragraphs = sections.flatMap((section) => section.paragraphs);
        const verificationFlags = classifyVerificationClaims(claims);
        const executionRow = executionRows.get(page.page_id);
        const tags = executionRow?.tag_decision?.ok ? executionRow.tag_decision.tags : [];
        articles.push(freeze({
          contract_version: COMPILER_VERSION,
          document_kind: "topic_article",
          role: "reusable_claim",
          page_id: page.page_id,
          title: page.title,
          purpose: page.purpose,
          sections,
          paragraphs,
          claims,
          citations,
          verification_flags: verificationFlags,
          tags,
          matched_candidate_ids: page.target_candidate_ids,
          related_candidate_ids: page.target_candidate_ids,
          operation_hint: page.operation_hint,
          review_reasons: [],
          body: renderArticle(page, sections, claims, citations, verificationFlags, tags),
        }));
      }
      const guideClaimIds = [...new Set(plan.source_guide.sections.flatMap((section) => section.claim_ids))];
      const guideClaims = plan.source_guide.sections.map((section, index) => freeze({
        claim_id: `guide_claim_${String(index + 1).padStart(3, "0")}`,
        text: section.summary,
        derived_from_claim_ids: section.claim_ids,
      }));
      const guideCitations = [...new Set(guideClaimIds.flatMap((claimId) => claimById.get(claimId)?.citation_ids || []))]
        .map((citationId) => citationById.get(citationId));
      const guideDocument = freeze({
        contract_version: COMPILER_VERSION,
        document_kind: "source_guide",
        role: "source_summary",
        title: plan.source_guide.title,
        sections: plan.source_guide.sections,
        claims: guideClaims,
        citations: guideCitations,
        matched_candidate_ids: [],
        related_candidate_ids: [],
        operation_hint: "create",
        review_reasons: [],
        body: renderGuide(plan.source_guide, selectedPages, inventory.source.source_path),
      });
      const documents = [guideDocument, ...articles];
      const qualityReceipt = createQualityReceipt({
        source_hash: inventory.source.content_hash,
        inventory_hash: inventory.inventory_hash,
        plan_hash: plan.plan_hash,
        documents,
        quality_status: "publishable",
        quality_issues: [],
        quality_rewrite_count: qualityRewriteCount,
      });
      return freeze({
        ok: true,
        compiler_version: COMPILER_VERSION,
        inventory_hash: inventory.inventory_hash,
        plan_hash: plan.plan_hash,
        quality_status: "publishable",
        quality_rewrite_count: qualityRewriteCount,
        quality_issues: [],
        quality_receipt: qualityReceipt,
        documents,
        selected_page_count: selectedPages.length,
      });
    }

    return freeze({ compile });
  }

  const api = freeze({ COMPILER_VERSION, QUALITY_RECEIPT_VERSION, QUALITY_RULES_VERSION, ARTICLE_SCHEMA, classifyVerificationClaims, createQualityReceipt, inspectQualityReceipt, createDocumentCompiler });
  root.LLMWikiDocumentCompiler = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
