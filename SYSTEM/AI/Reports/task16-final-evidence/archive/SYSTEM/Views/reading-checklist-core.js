(function (root) {
  "use strict";

  const SCHEMA_VERSION = "prodigy-reading-checklist-v1";
  const ALLOWED_STATES = Object.freeze(["unchecked", "checked", "not_applicable"]);

  const PHASES = Object.freeze([
    Object.freeze({ id: "before", label: "읽기 전 · 구조 파악", question: "이 책은 전반적으로 무엇에 관한 글인가?" }),
    Object.freeze({ id: "during", label: "읽는 중 · 내용 해석", question: "무엇을, 어떻게 자세하게 다루는가?" }),
    Object.freeze({ id: "after", label: "읽은 후 · 비판·적용", question: "맞는가? 나와 무슨 상관인가?" }),
  ]);

  /**
   * universal = common for every book (Adler 3-phase spine).
   * domain keys = add-ons only when book_type / reading_strategy is explicit.
   */
  const QUESTION_REGISTRY = Object.freeze({
    universal: Object.freeze([
      { id: "common_classify", phase: "before", kind: "understanding", label: "이 책의 종류와 주제를 어떻게 분류하는가?", hint: "실용서인지 이론서인지, 이론이라면 역사·과학·철학 등 어디에 가까운지 적어 보세요." },
      { id: "common_structure", phase: "before", kind: "understanding", label: "책 전체를 한두 문장으로 요약할 수 있는가?", hint: "세부 내용 전에 통일성(주제)을 붙잡으세요." },
      { id: "common_outline", phase: "before", kind: "understanding", label: "주요 부분의 뼈대(장·절 배열)를 내 말로 그릴 수 있는가?", hint: "목차를 베끼지 말고 내 언어로 개요를 적으세요." },
      { id: "common_author_question", phase: "before", kind: "understanding", label: "저자가 던지는 핵심 질문·문제는 무엇인가?", hint: "결론보다 먼저 출발 질문을 분명히 하세요." },
      { id: "common_terms", phase: "during", kind: "understanding", label: "저자의 핵심 용어 의미를 파악해 합의했는가?", hint: "특별하게 쓰인 키워드를 찾아 저자 뜻에 맞췄는지 적으세요." },
      { id: "common_claims", phase: "during", kind: "understanding", label: "핵심 주장(명제)은 무엇인가?", hint: "가장 중요한 문장·주장을 골라 적으세요." },
      { id: "common_argument", phase: "during", kind: "understanding", label: "근거와 논증 과정을 재구성할 수 있는가?", hint: "전제 → 근거 → 결론을 스스로 다시 연결해 보세요." },
      { id: "common_resolved", phase: "during", kind: "evaluation", label: "저자가 해결한 문제와 못 푼 문제는?", hint: "읽기 전에 잡은 질문에 대해 해결/미해결을 구분하세요." },
      { id: "common_understood", phase: "after", kind: "evaluation", label: "이 책을 이해했다고 말할 수 있는가?", hint: "아니면 동의·반대·판단 유보를 보류하세요." },
      { id: "common_valid", phase: "after", kind: "evaluation", label: "전체 또는 부분에서 이 글은 맞는가? 근거는?", hint: "감정·선입견이 아니라 근거로 평가하세요. 반대한다면 무지·오류·논리 결함·분석 불완전 중 어디인지." },
      { id: "common_so_what", phase: "after", kind: "application", label: "의의는 무엇인가? 생각·행동에 무엇을 요구하는가?", hint: "What of it? 다음 실험 하나만 골라도 충분합니다." },
    ]),
    practical: Object.freeze([
      { id: "practical_method", phase: "during", kind: "application", label: "목적을 이루는 방법(어떻게)을 찾았는가?", hint: "방법론을 행동 단위로." },
      { id: "practical_experiment", phase: "after", kind: "application", label: "이번 주에 시험할 행동은 무엇인가?", hint: "작고 관찰 가능한 실험 하나." },
    ]),
    philosophy: Object.freeze([
      { id: "philosophy_root", phase: "before", kind: "understanding", label: "일상 경험에 비춘 근본 문제는 무엇인가?", hint: "실험실이 아니라 사색·경험의 질문." },
      { id: "philosophy_critique", phase: "after", kind: "evaluation", label: "어디에 동의하지 않으며, 네 비판 기준 중 어느 것인가?", hint: "무지·오류·논리 결함·분석 불완전." },
    ]),
    history: Object.freeze([
      { id: "history_meaning", phase: "during", kind: "understanding", label: "사건의 의미와 해설(사관)을 이해했는가?", hint: "사실만이 아니라 해석." },
      { id: "history_pattern", phase: "after", kind: "reflection", label: "같은 패턴이 오늘에도 있는가?", hint: "닮은 점과 다른 조건." },
    ]),
    science: Object.freeze([
      { id: "science_evidence", phase: "during", kind: "understanding", label: "전제·증거·결론을 단계로 따라갔는가?", hint: "일상 경험보다 증명 경로." },
      { id: "science_limit", phase: "after", kind: "evaluation", label: "한계와 적용 범위는 무엇인가?", hint: "표본·방법·재현성." },
    ]),
    social_science: Object.freeze([
      { id: "social_views", phase: "during", kind: "understanding", label: "어떤 관점·가정이 충돌하는가?", hint: "한 권에만 묶이지 말고 쟁점 표시." },
      { id: "social_terms", phase: "during", kind: "evaluation", label: "모호한 용어를 중립 명제로 재정의했는가?", hint: "비교 가능하게." },
    ]),
    literature: Object.freeze([
      { id: "literature_experience", phase: "during", kind: "understanding", label: "명제 찾기 대신 경험·장면으로 읽었는가?", hint: "상상력의 산물로 접근." },
      { id: "literature_scene", phase: "after", kind: "reflection", label: "관점을 바꾼 장면과 그 이유는?", hint: "요약보다 남은 감각." },
    ]),
  });

  const DIRECT_ALIASES = Object.freeze({
    practical: "practical", practice: "practical", self_help: "practical", "실용": "practical", "자기계발": "practical",
    philosophy: "philosophy", philosophical: "philosophy", "철학": "philosophy",
    history: "history", historical: "history", "역사": "history",
    science: "science", scientific: "science", "과학": "science",
    social_science: "social_science", socialscience: "social_science", "사회과학": "social_science",
    literature: "literature", fiction: "literature", novel: "literature", "문학": "literature", "소설": "literature",
  });

  const INFERENCE_RULES = Object.freeze([
    ["literature", ["소설", "문학", "시집", "희곡", "fiction", "novel", "literature"]],
    ["history", ["역사", "세계사", "한국사", "전쟁사", "history"]],
    ["philosophy", ["철학", "사상", "윤리", "형이상학", "philosophy"]],
    ["science", ["자연과학", "과학", "물리", "화학", "생물", "의학", "science"]],
    ["social_science", ["심리학", "사회학", "정치", "경제학", "인류학", "사회과학", "psychology", "sociology"]],
    ["practical", ["자기계발", "성공학", "경영", "비즈니스", "투자", "부동산", "화술", "협상", "생산성", "실용", "business", "self-help", "productivity"]],
  ]);

  function scalar(value) {
    if (Array.isArray(value)) return value.join(" ");
    return String(value == null ? "" : value).normalize("NFKC").trim();
  }

  function normalizeType(value) {
    return scalar(value).toLocaleLowerCase("ko-KR").replace(/[\s-]+/g, "_");
  }

  /** Explicit type only for domain layer. Metadata inference is legacy-compat reporting only. */
  function resolveExplicitBookType(source = {}) {
    for (const field of ["reading_strategy", "book_type", "reading_type"]) {
      const direct = DIRECT_ALIASES[normalizeType(source[field])];
      if (direct) return { type: direct, source: field, known: true };
    }
    return { type: "universal", source: "none", known: false };
  }

  function resolveBookType(source = {}) {
    const explicit = resolveExplicitBookType(source);
    if (explicit.known) return { type: explicit.type, source: explicit.source };
    // Legacy: still report inferred type for diagnostics — selectQuestions does NOT use this for domain.
    const metadata = [source.category, source.genre, source.tag, source.tags, source.title, source.book_title]
      .map(scalar).filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
    for (const [type, keywords] of INFERENCE_RULES) {
      if (keywords.some((keyword) => metadata.includes(keyword))) return { type, source: "metadata" };
    }
    return { type: "universal", source: "fallback" };
  }

  /**
   * Always common (universal) by phase. Domain appends only when type is explicit.
   * Default: full common spine (all phases). Optional limit still supported for tests.
   */
  function selectQuestions(source = {}, limit) {
    const explicit = resolveExplicitBookType(source);
    const common = (QUESTION_REGISTRY.universal || []).map((item) => ({ ...item, layer: "common" }));
    const domain = explicit.known && QUESTION_REGISTRY[explicit.type]
      ? QUESTION_REGISTRY[explicit.type].map((item) => ({ ...item, layer: "domain" }))
      : [];
    const seen = new Set();
    const questions = [];
    const push = (item) => {
      if (!item || seen.has(item.id)) return;
      if (limit != null && questions.length >= Number(limit)) return;
      seen.add(item.id);
      questions.push({
        id: item.id,
        label: item.label,
        hint: item.hint || "",
        kind: item.kind || "",
        phase: item.phase || "during",
        layer: item.layer || "common",
      });
    };
    common.forEach(push);
    domain.forEach(push);

    const phases = PHASES.map((phase) => ({
      id: phase.id,
      label: phase.label,
      question: phase.question,
      questions: questions.filter((q) => q.phase === phase.id),
    })).filter((phase) => phase.questions.length > 0);

    return {
      type: explicit.known ? explicit.type : "universal",
      source: explicit.source,
      known: explicit.known,
      common: true,
      domain: explicit.known,
      phases,
      questions,
    };
  }

  function hashText(value) {
    let hash = 0xcbf29ce484222325n;
    for (const byte of new TextEncoder().encode(String(value || ""))) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, "0");
  }

  function normalizePath(value) { return String(value || "").replace(/\\/g, "/").replace(/^\.\//, ""); }
  function isEligibleReadingPath(value) {
    const path = normalizePath(value);
    return path.startsWith("PARA/PROJECTS/Reading/") && path.endsWith(".md");
  }
  function stableSourceId(source = {}) {
    const path = normalizePath(source.source_path || (source.file && source.file.path));
    const objectId = scalar(source.id);
    if (!isEligibleReadingPath(path)) throw new Error("Reading source path is invalid.");
    return `checklist-${hashText(objectId ? `id:${objectId}` : `path:${path.toLocaleLowerCase("ko-KR")}`)}`;
  }

  function normalizeState(value) { return ALLOWED_STATES.includes(value) ? value : "unchecked"; }

  function noteBlock(question, memo) {
    const clean = String(memo || "").replace(/\r\n/g, "\n").trim();
    if (!question || !/^[a-z0-9_]+$/.test(String(question.id || "")) || !clean) throw new Error("Reading guide note is invalid.");
    const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
    return [
      `<!-- reading-guide-note:${question.id} -->`,
      `- **${String(question.label || "독서 질답").trim()}**`,
      ...lines.map((line) => `  - ${line}`),
    ].join("\n");
  }

  function upsertReadingGuideNote(content, question, memo) {
    const normalized = String(content || "").replace(/\r\n/g, "\n");
    const block = noteBlock(question, memo);
    const marker = `<!-- reading-guide-note:${question.id} -->`;
    const existingStart = normalized.indexOf(marker);
    if (existingStart >= 0) {
      const afterMarker = existingStart + marker.length;
      const nextMarker = normalized.indexOf("\n<!-- reading-guide-note:", afterMarker);
      const nextHeading = normalized.slice(afterMarker).search(/\n#{2,3}\s+/);
      const headingIndex = nextHeading >= 0 ? afterMarker + nextHeading : -1;
      const candidates = [nextMarker, headingIndex].filter((value) => value >= 0);
      const end = candidates.length ? Math.min(...candidates) : normalized.length;
      const suffix = normalized.slice(end).replace(/^\n*/, "");
      return `${normalized.slice(0, existingStart)}${block}${suffix ? `\n\n${suffix}` : "\n"}`;
    }

    const section = normalized.match(/(?:^|\n)## Key Takeaways\s*\n/);
    if (!section) return `${normalized.replace(/\s+$/, "")}\n\n## Key Takeaways\n\n### 독서 질답\n\n${block}\n`;
    const sectionStart = section.index + section[0].length;
    const rest = normalized.slice(sectionStart);
    const nextHeading = rest.search(/\n##\s+/);
    let insertAt = nextHeading >= 0 ? sectionStart + nextHeading : normalized.length;
    let sectionBody = normalized.slice(sectionStart, insertAt);
    const divider = sectionBody.match(/\n---\s*$/);
    if (divider) {
      insertAt = sectionStart + divider.index;
      sectionBody = normalized.slice(sectionStart, insertAt);
    }
    const hasHeading = /(?:^|\n)### 독서 질답\s*(?:\n|$)/.test(sectionBody)
      || /(?:^|\n)### 독서 가이드 메모\s*(?:\n|$)/.test(sectionBody);
    const heading = hasHeading ? "" : "\n### 독서 질답\n";
    return `${normalized.slice(0, insertAt).replace(/\s+$/, "")}\n${heading}\n${block}\n${normalized.slice(insertAt).replace(/^\n*/, "\n")}`;
  }

  const api = {
    ALLOWED_STATES, PHASES, QUESTION_REGISTRY, SCHEMA_VERSION, isEligibleReadingPath, normalizePath, normalizeState,
    resolveBookType, resolveExplicitBookType, selectQuestions, stableSourceId, upsertReadingGuideNote,
  };
  root.ReadingChecklistCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
