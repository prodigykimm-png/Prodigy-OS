(function (root) {
  "use strict";

  /**
   * Reading Strategy Layer
   * Common (all books) + Domain (only when book_type / reading_strategy is explicit).
   * Never silent-classify from title/category. Future AI may set book_type.
   */

  const SCHEMA = "prodigy-reading-strategy-v2";

  const STRATEGY_LABELS = Object.freeze({
    practical: "실용 독서",
    philosophy: "철학 독서",
    history: "역사 독서",
    science: "과학 독서",
    literature: "문학 독서",
    social_science: "사회과학 독서",
    generic: "공통 독서",
    common: "공통 독서"
  });

  const DIRECT_TYPE = Object.freeze({
    practical: "practical",
    practice: "practical",
    self_help: "practical",
    "실용": "practical",
    "자기계발": "practical",
    philosophy: "philosophy",
    philosophical: "philosophy",
    "철학": "philosophy",
    history: "history",
    historical: "history",
    "역사": "history",
    science: "science",
    scientific: "science",
    "과학": "science",
    social_science: "social_science",
    socialscience: "social_science",
    "사회과학": "social_science",
    literature: "literature",
    fiction: "literature",
    novel: "literature",
    "문학": "literature",
    "소설": "literature",
    generic: "generic",
    universal: "generic",
    unknown: "generic",
    "일반": "generic",
    common: "generic"
  });

  /**
   * Common layer — every book (Adler analytical reading spine).
   * Guide = structure · Checklist = interpretation · Reflection = critique + apply
   */
  const COMMON_GUIDE = Object.freeze([
    { id: "g_common_classify", label: "이 책의 종류와 주제를 어떻게 분류하는가?", phase: "before" },
    { id: "g_common_unity", label: "책 전체를 한두 문장으로 요약할 수 있는가?", phase: "before" },
    { id: "g_common_structure", label: "주요 부분의 뼈대(장·절 배열)를 내 말로 그릴 수 있는가?", phase: "before" },
    { id: "g_common_question", label: "저자가 던지는 핵심 질문·문제는 무엇인가?", phase: "before" }
  ]);

  const COMMON_CHECKLIST = Object.freeze([
    { id: "c_common_terms", label: "저자의 핵심 용어 의미를 파악해 합의했는가?", phase: "during" },
    { id: "c_common_claims", label: "핵심 주장(명제)은 무엇인가?", phase: "during" },
    { id: "c_common_argument", label: "근거와 논증 과정을 재구성할 수 있는가?", phase: "during" },
    { id: "c_common_resolved", label: "저자가 해결한 문제와 못 푼 문제는?", phase: "during" }
  ]);

  const COMMON_REFLECTION = Object.freeze([
    { id: "r_common_understood", label: "이 책을 이해했다고 말할 수 있는가?", phase: "after" },
    { id: "r_common_true", label: "전체 또는 부분에서 이 글은 맞는가? 근거는?", phase: "after" },
    { id: "r_common_so_what", label: "의의는 무엇인가? 생각·행동에 무엇을 요구하는가?", phase: "after" }
  ]);

  /** Domain add-ons — only when type is explicit. Do not replace common. */
  const DOMAIN_GUIDE = Object.freeze({
    practical: Object.freeze([
      { id: "g_prac_1", label: "목적을 이루는 ‘방법’에 특히 주목하라." }
    ]),
    philosophy: Object.freeze([
      { id: "g_phil_1", label: "일상 경험에 비춘 근본 질문에 주목하라." }
    ]),
    history: Object.freeze([
      { id: "g_hist_1", label: "사건만이 아니라 의미·사관에 주목하라." }
    ]),
    science: Object.freeze([
      { id: "g_sci_1", label: "전제·실험·증명 단계에 주목하라." }
    ]),
    literature: Object.freeze([
      { id: "g_lit_1", label: "논리 명제보다 경험·감정·장면에 주목하라." }
    ]),
    social_science: Object.freeze([
      { id: "g_soc_1", label: "쟁점과 다른 견해의 충돌에 주목하라." }
    ])
  });

  const DOMAIN_CHECKLIST = Object.freeze({
    practical: Object.freeze([
      { id: "c_prac_1", label: "방법론(어떻게)을 찾았는가?" },
      { id: "c_prac_2", label: "실제로 행동으로 옮길 준비가 되었는가?" }
    ]),
    philosophy: Object.freeze([
      { id: "c_phil_1", label: "철학자의 근본 문제를 붙잡았는가?" },
      { id: "c_phil_2", label: "가장 강한 논증(또는 반론)을 말했는가?" }
    ]),
    history: Object.freeze([
      { id: "c_hist_1", label: "사건의 의미와 해설(사관)을 이해했는가?" },
      { id: "c_hist_2", label: "같은 패턴이 오늘에도 있는지 물었는가?" }
    ]),
    science: Object.freeze([
      { id: "c_sci_1", label: "전제·증거·결론을 단계로 따라갔는가?" },
      { id: "c_sci_2", label: "한계와 적용 범위를 표시했는가?" }
    ]),
    literature: Object.freeze([
      { id: "c_lit_1", label: "상상·경험의 작품으로 읽었는가? (명제 찾기 강요 금지)" },
      { id: "c_lit_2", label: "관점을 바꾼 장면이 무엇인가?" }
    ]),
    social_science: Object.freeze([
      { id: "c_soc_1", label: "어떤 관점·가정이 충돌하는가?" },
      { id: "c_soc_2", label: "용어를 중립적으로 재정의하며 비교할 수 있는가?" }
    ])
  });

  const DOMAIN_REFLECTION = Object.freeze({
    practical: Object.freeze([
      { id: "r_prac_1", label: "이번 주에 무엇을 적용할 것인가?" }
    ]),
    philosophy: Object.freeze([
      { id: "r_phil_1", label: "어디에 동의하지 않으며, 네 비판 기준 중 어느 것인가?" }
    ]),
    history: Object.freeze([
      { id: "r_hist_1", label: "이 역사가 오늘 판단에 무엇을 남기는가?" }
    ]),
    science: Object.freeze([
      { id: "r_sci_1", label: "어떤 한계를 기억한 채 결론을 쓸 것인가?" }
    ]),
    literature: Object.freeze([
      { id: "r_lit_1", label: "이 경험이 내 현실 감각을 어떻게 바꿨는가?" }
    ]),
    social_science: Object.freeze([
      { id: "r_soc_1", label: "가져갈 관점과 버릴 가정은 무엇인가?" }
    ])
  });

  // Compat surfaces for tests / older callers (domain maps + common as generic)
  const GUIDE_BY_STRATEGY = Object.freeze({
    generic: COMMON_GUIDE,
    practical: DOMAIN_GUIDE.practical,
    philosophy: DOMAIN_GUIDE.philosophy,
    history: DOMAIN_GUIDE.history,
    science: DOMAIN_GUIDE.science,
    literature: DOMAIN_GUIDE.literature,
    social_science: DOMAIN_GUIDE.social_science
  });
  const CHECKLIST_BY_STRATEGY = Object.freeze({
    generic: COMMON_CHECKLIST,
    practical: DOMAIN_CHECKLIST.practical,
    philosophy: DOMAIN_CHECKLIST.philosophy,
    history: DOMAIN_CHECKLIST.history,
    science: DOMAIN_CHECKLIST.science,
    literature: DOMAIN_CHECKLIST.literature,
    social_science: DOMAIN_CHECKLIST.social_science
  });
  const REFLECTION_BY_STRATEGY = Object.freeze({
    generic: COMMON_REFLECTION,
    practical: DOMAIN_REFLECTION.practical,
    philosophy: DOMAIN_REFLECTION.philosophy,
    history: DOMAIN_REFLECTION.history,
    science: DOMAIN_REFLECTION.science,
    literature: DOMAIN_REFLECTION.literature,
    social_science: DOMAIN_REFLECTION.social_science
  });

  function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function clonePrompt(item) {
    return { id: item.id, label: item.label, phase: item.phase || "", kind: item.kind || "" };
  }

  function cloneCheck(item) {
    return { id: item.id, label: item.label, checked: false, phase: item.phase || "" };
  }

  function mergeUnique(base, extra, limit) {
    const out = [];
    const seen = new Set();
    for (const item of [...(base || []), ...(extra || [])]) {
      if (!item || !item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (limit && out.length >= limit) break;
    }
    return out;
  }

  /**
   * Explicit fields only — never title/category/tags.
   * Future AI may populate book_type; until then domain stays off.
   */
  function resolveStrategy(source) {
    const src = source || {};
    for (const field of ["reading_strategy", "book_type", "reading_type"]) {
      const raw = clean(src[field]);
      if (!raw) continue;
      const key = raw.toLocaleLowerCase("ko-KR").replace(/[\s-]+/g, "_");
      const mapped = DIRECT_TYPE[key] || DIRECT_TYPE[raw];
      if (mapped) {
        const strategy = (mapped === "unknown" || mapped === "generic") ? "generic" : mapped;
        const isTyped = strategy !== "generic";
        return Object.freeze({
          strategy: isTyped ? strategy : "generic",
          known: isTyped,
          source_field: field,
          strategy_label: isTyped
            ? (STRATEGY_LABELS[strategy] || strategy)
            : STRATEGY_LABELS.generic,
          generic: !isTyped
        });
      }
    }
    return Object.freeze({
      strategy: "generic",
      known: false,
      source_field: "none",
      strategy_label: STRATEGY_LABELS.generic,
      generic: true
    });
  }

  function normalizeStrategyKey(strategy) {
    const key = clean(strategy) || "generic";
    if (key === "unknown" || key === "universal" || key === "common") return "generic";
    if (DOMAIN_GUIDE[key] || key === "generic") return key;
    return "generic";
  }

  function domainList(map, strategyKey) {
    const key = normalizeStrategyKey(strategyKey);
    if (key === "generic") return [];
    return map[key] || [];
  }

  /**
   * @param {string} strategyKey
   * @param {{ known?: boolean }} options — if known false, domain off
   */
  function buildGuide(strategyKey, options) {
    const opts = options || {};
    const key = normalizeStrategyKey(strategyKey);
    const known = opts.known === true && key !== "generic";
    const domain = known ? domainList(DOMAIN_GUIDE, key) : [];
    const prompts = mergeUnique(
      COMMON_GUIDE.map(clonePrompt),
      domain.map(clonePrompt),
      5
    );
    return Object.freeze({
      phase: "before",
      strategy: known ? key : "generic",
      strategy_label: known ? (STRATEGY_LABELS[key] || key) : STRATEGY_LABELS.generic,
      common: true,
      domain: known,
      prompts,
      purpose: "1단계 · 구조 파악 — 이 책은 전반적으로 무엇인가?"
    });
  }

  function buildChecklist(strategyKey, options) {
    const opts = options || {};
    const key = normalizeStrategyKey(strategyKey);
    const known = opts.known === true && key !== "generic";
    const domain = known ? domainList(DOMAIN_CHECKLIST, key) : [];
    const items = mergeUnique(
      COMMON_CHECKLIST.map(cloneCheck),
      domain.map(cloneCheck),
      6
    ).map((item) => ({ id: item.id, label: item.label, checked: false }));
    return Object.freeze({
      phase: "during",
      strategy: known ? key : "generic",
      strategy_label: known ? (STRATEGY_LABELS[key] || key) : STRATEGY_LABELS.generic,
      common: true,
      domain: known,
      items,
      auto_complete: false,
      purpose: "2단계 · 내용 해석 — 무엇을, 어떻게 다루는가?"
    });
  }

  function buildReflection(strategyKey, options) {
    const opts = options || {};
    const key = normalizeStrategyKey(strategyKey);
    const known = opts.known === true && key !== "generic";
    const domain = known ? domainList(DOMAIN_REFLECTION, key) : [];
    // Max 3: keep common critique spine; if domain, replace last slot with domain apply
    let prompts = COMMON_REFLECTION.map(clonePrompt);
    if (known && domain.length) {
      prompts = mergeUnique(prompts.slice(0, 2), domain.map(clonePrompt), 3);
    } else {
      prompts = prompts.slice(0, 3);
    }
    return Object.freeze({
      phase: "after",
      strategy: known ? key : "generic",
      strategy_label: known ? (STRATEGY_LABELS[key] || key) : STRATEGY_LABELS.generic,
      common: true,
      domain: known,
      prompts,
      max: 3,
      purpose: "3단계 · 비판·적용 — 맞는가? 나와 무슨 상관인가?"
    });
  }

  function buildStrategyBundle(source, options) {
    const opts = options || {};
    const active = opts.active !== false;
    if (!active) {
      return Object.freeze({
        schema_version: SCHEMA,
        empty: true,
        message: "진행 중인 독서가 없습니다.",
        strategy: null,
        strategy_label: null,
        known: false,
        generic: true,
        source_field: null,
        guide: null,
        checklist: null,
        reflection: null
      });
    }

    const resolved = resolveStrategy(source);
    const known = !!resolved.known;
    const strategy = known ? normalizeStrategyKey(resolved.strategy) : "generic";
    const buildOpts = { known };

    const guide = buildGuide(strategy, buildOpts);
    const checklist = buildChecklist(strategy, buildOpts);
    const reflection = buildReflection(strategy, buildOpts);

    const label = known
      ? `공통 + ${STRATEGY_LABELS[strategy] || strategy}`
      : STRATEGY_LABELS.generic;

    return Object.freeze({
      schema_version: SCHEMA,
      empty: false,
      message: null,
      strategy,
      strategy_label: known ? (STRATEGY_LABELS[strategy] || strategy) : STRATEGY_LABELS.generic,
      known,
      generic: !known,
      domain: known,
      common: true,
      source_field: resolved.source_field,
      guide,
      checklist,
      reflection,
      explain: known
        ? `전략 · ${label} (분야는 명시 타입일 때만)`
        : "전략 · 공통 독서 (유형 미분류 · 분야 질문 없음)"
    });
  }

  const api = {
    SCHEMA,
    STRATEGY_LABELS,
    COMMON_GUIDE,
    COMMON_CHECKLIST,
    COMMON_REFLECTION,
    DOMAIN_GUIDE,
    DOMAIN_CHECKLIST,
    DOMAIN_REFLECTION,
    GUIDE_BY_STRATEGY,
    CHECKLIST_BY_STRATEGY,
    REFLECTION_BY_STRATEGY,
    clean,
    resolveStrategy,
    normalizeStrategyKey,
    buildGuide,
    buildChecklist,
    buildReflection,
    buildStrategyBundle
  };

  root.ReadingStrategyCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
