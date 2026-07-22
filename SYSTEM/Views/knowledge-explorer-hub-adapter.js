"use strict";

(function (root) {
  const CATEGORY_LABELS = Object.freeze({
    Knowledge: "지식",
    Resources: "자료",
    People: "사람",
    Projects: "프로젝트",
    Journal: "저널",
    Reading: "읽기",
    Other: "기타",
    warnings: "확인 필요",
    "recent learning": "최근 학습"
  });
  const REASON_LABELS = Object.freeze({
    canonical: "검증된 지식",
    legacy: "기존 형식 지식",
    resource: "보조 자료",
    literature_note: "문헌 자료",
    venue: "장소 자료",
    auction_region: "경매 지역 자료",
    connection: "연결 속성",
    direct_outlink: "문서 링크",
    backlink: "역방향 링크",
    recent_addition: "최근 추가됨",
    repeated_related_topic: "반복 연결 주제",
    broken_link: "열 수 없는 연결",
    malformed_link: "형식이 올바르지 않은 연결",
    unsafe_path: "안전하지 않은 경로",
    unclassified_domain: "분류되지 않은 도메인"
  });
  const WARNING_DISPLAY_DETAILS = Object.freeze({
    invalid_recency: "업데이트 시각 형식을 확인해 주세요. 파일 수정 시각을 기준으로 표시했습니다."
  });

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function categoryLabel(value) {
    return CATEGORY_LABELS[value] || "기타";
  }

  function reasonLabel(value) {
    return REASON_LABELS[value] || "연결 정보";
  }

  function warningLabel(value) {
    return REASON_LABELS[value] || "확인이 필요한 연결";
  }

  function relationItem(relation) {
    return {
      title: relation.target_title || relation.target_path,
      path: relation.target_path,
      clickable: relation.clickable,
      category: categoryLabel(relation.category),
      reason: reasonLabel(relation.reason),
      provenance_label: reasonLabel(relation.reason),
      provenance_source_path: relation.provenance_source_path,
      detail: relation.warning ? warningLabel(relation.warning) : "",
      warning: relation.warning
    };
  }

  function warningItem(warning) {
    const code = typeof warning.code === "string" ? warning.code : "";
    return {
      title: "연결 확인 필요",
      path: warning.target_path || warning.path || "",
      clickable: false,
      category: "확인 필요",
      reason: warningLabel(code),
      detail: WARNING_DISPLAY_DETAILS[code] || warningLabel(code),
      warning: code || undefined
    };
  }

  function section(key, title, summary, items, empty) {
    return { key, title, summary, items, empty };
  }

  function appendHydrationSection(sections, hydration) {
    const result = list(sections).slice();
    if (!isObject(hydration) || typeof hydration.status !== "string") return result;
    if (hydration.status === "loading") {
      result.push(section("selected-note", "선택한 노트", "선택한 노트 본문을 불러오는 중입니다.", [], "본문을 불러오는 중입니다."));
    } else if (hydration.status === "ready") {
      result.push(section("selected-note", "선택한 노트", "선택한 노트 본문은 필요할 때만 읽습니다.", [{
        title: "본문",
        path: "",
        clickable: false,
        category: "선택한 노트",
        reason: "선택한 노트",
        detail: typeof hydration.body === "string" && hydration.body.trim() ? hydration.body : "본문이 비어 있습니다."
      }], "본문이 비어 있습니다."));
    } else if (hydration.status === "error") {
      result.push(section("selected-note-warning", "확인 필요", "선택한 노트를 읽지 못했습니다. 다시 선택해 시도해 주세요.", [], "선택한 노트를 읽지 못했습니다. 다시 선택해 시도해 주세요."));
    }
    return result;
  }

  function buildDetailSections(model, relationsModel) {
    const byPath = {};
    const signals = isObject(relationsModel && relationsModel.signals_by_domain) ? relationsModel.signals_by_domain : {};
    const relationsBySource = isObject(relationsModel && relationsModel.relations_by_source) ? relationsModel.relations_by_source : {};
    const warnings = list(model && model.warnings);

    for (const domain of list(model && model.domains)) {
      const domainRelations = signals[domain.key] || {};
      const knowledgeItems = list(domain.knowledge).map((asset) => ({
        title: asset.title || asset.path,
        path: asset.path,
        detail: asset.legacy ? "기존 형식 지식" : list(asset.topics).join(", "),
        category: "지식",
        reason: asset.legacy ? "기존 형식 지식" : "검증된 지식",
        clickable: true
      }));
      const resourceItems = list(domain.resources).map((asset) => ({
        title: asset.title || asset.path,
        path: asset.path,
        detail: reasonLabel(asset.type || "resource"),
        category: "자료",
        reason: reasonLabel(asset.type || "resource"),
        clickable: true
      }));

      for (const asset of [...list(domain.knowledge), ...list(domain.resources)]) {
        const relations = list(relationsBySource[asset.path]);
        const relationItems = relations.map(relationItem);
        const relatedItems = relations
          .filter((relation) => relation.category !== "Knowledge" && relation.category !== "Resources")
          .map(relationItem);
        const journalItems = relations.filter((relation) => relation.category === "Journal").map(relationItem);
        const projectItems = relations.filter((relation) => relation.category === "Projects").map(relationItem);
        const warningItems = [
          ...warnings.filter((warning) => warning.path === asset.path || warning.source_path === asset.path || warning.target_path === asset.path).map(warningItem),
          ...relationItems.filter((item) => item.warning)
        ];
        const recentLearning = [];
        for (const entry of list(domainRelations.recent_additions).slice(0, 3)) {
          recentLearning.push({
            title: entry.title || entry.source_path,
            path: entry.source_path,
            clickable: true,
            category: "최근 학습",
            reason: "최근 추가됨",
            detail: "최근에 추가된 항목"
          });
        }
        for (const entry of list(domainRelations.repeated_related_topics)) {
          recentLearning.push({
            title: entry.topic,
            path: "",
            clickable: false,
            category: "최근 학습",
            reason: "반복 연결 주제",
            detail: `${entry.mentions}회 연결됨`
          });
        }
        const provenanceItems = relationItems.map((item) => ({
          ...item,
          detail: item.warning ? item.detail : "연결 근거가 있는 항목"
        }));
        byPath[String(asset.path || "").toLowerCase()] = [
          section("knowledge", "지식", `${domain.label || domain.key} 도메인의 지식`, knowledgeItems, "표시할 지식이 없습니다."),
          section("resources", "자료", `${domain.label || domain.key} 도메인의 보조 자료`, resourceItems, "표시할 자료가 없습니다."),
          section("related-objects", "연결된 항목", "명시적으로 연결된 항목입니다.", relatedItems, "연결된 항목이 없습니다."),
          section("journal", "저널", "명시적으로 연결된 저널 항목입니다.", journalItems, "연결된 저널 항목이 없습니다."),
          section("projects", "프로젝트", "명시적으로 연결된 프로젝트 항목입니다.", projectItems, "연결된 프로젝트 항목이 없습니다."),
          section("recent-learning", "최근 학습", "도메인 안에서 확인한 최근 학습 신호입니다.", recentLearning, "최근 학습 신호가 없습니다."),
          section("warnings", "확인 필요", "복구 가능한 연결 및 검증 확인 사항입니다.", warningItems, "확인할 항목이 없습니다."),
          section("provenance", "연결 근거", "항목을 표시한 명시적 연결 근거입니다.", provenanceItems, "표시할 연결 근거가 없습니다.")
        ];
      }
    }
    return byPath;
  }

  const api = Object.freeze({ buildDetailSections, appendHydrationSection });
  root.KnowledgeExplorerHubAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
