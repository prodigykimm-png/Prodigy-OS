"use strict";

function createFixtureCaseSet(doc, deepFreeze) {
  const validatedKnowledge = [
    doc("knowledge/validated-knowledge.md", {
      type: "knowledge",
      title: "검증된 지식: 되풀이 가능한 판단",
      knowledge_domain: "coding",
      knowledge_topics: ["tests", "design"],
      connections: [
        "[[SYNTHETIC/knowledge-explorer/people/정호성.md]]",
        "[[SYNTHETIC/knowledge-explorer/project/knowledge-explorer.md]]"
      ]
    }, "# 검증된 지식\n\n반복 가능한 판단을 기록한다.\n"),
    doc("knowledge/legacy-permanent-note.md", {
      type: "permanent_note",
      title: "기존 영구 노트",
      knowledge_domain: "",
      knowledge_topics: "coding, business",
      connections: ["[[SYNTHETIC/knowledge-explorer/literature/책-1.md]]"]
    }, "# 기존 영구 노트\n\n레거시 호환용 노트다.\n")
  ];

  const literatureResources = [
    doc("literature/책-1.md", {
      type: "literature_note",
      title: "문헌 자원 1",
      knowledge_domain: "reading",
      knowledge_topics: ["evidence"],
      source_type: "book"
    }, "# 문헌 자원\n\n출처가 명확한 문헌 자원이다.\n")
  ];

  const venues = [
    doc("venue/서울-강남-카페.md", {
      type: "venue",
      title: "서울 강남 카페",
      venue_category: "cafe",
      address: "서울특별시 강남구 테헤란로 1",
      connections: ["[[SYNTHETIC/knowledge-explorer/people/정호성.md]]"]
    }, "# 장소\n\n실제 주소는 synthetic only.\n")
  ];

  const auctionRegions = [
    doc("auction-region/서울-강남구.md", {
      type: "auction_region",
      title: "서울 강남구",
      region_sido: "서울특별시",
      region_sigungu: "강남구",
      region_dong: "삼성동"
    }, "# 옥션 지역\n\n지역 계약 확인용 synthetic note.\n")
  ];

  const people = [
    doc("people/정호성.md", {
      type: "people",
      title: "정호성",
      relationship: "동료",
      company: "Synthetic Labs",
      role: "Reviewer",
      connections: ["[[SYNTHETIC/knowledge-explorer/project/knowledge-explorer.md]]"]
    }, "# 사람\n\nsynthetic only.\n")
  ];

  const projects = [
    doc("project/knowledge-explorer.md", {
      type: "project",
      title: "Knowledge Explorer",
      project_type: "work",
      status: "doing",
      connections: [
        "[[SYNTHETIC/knowledge-explorer/knowledge/validated-knowledge.md]]",
        "[[SYNTHETIC/knowledge-explorer/venue/서울-강남-카페.md]]"
      ]
    }, "# 프로젝트\n\n탐색기 동작을 설명하는 synthetic project.\n")
  ];

  const journals = [
    doc("journal/2026-07-19.md", {
      type: "journal",
      title: "2026-07-19",
      status: "completed",
      summary: "하루 기록"
    }, "# 저널\n\n저녁 정리용 synthetic journal.\n")
  ];

  const dailyNotes = [
    doc("daily/2026-07-19.md", {
      type: "daily_note",
      title: "2026-07-19",
      reflection: "synthetic daily",
      connections: ["[[SYNTHETIC/knowledge-explorer/journal/2026-07-19.md]]"]
    }, "# 데일리\n\n실제 Daily가 아니다.\n")
  ];

  const malformed = [
    doc("malformed/no-type.md", {
      title: "유형 누락",
      knowledge_domain: "coding"
    }, "# 누락\n\nfrontmatter type missing.\n"),
    doc("malformed/bad-topics.md", {
      type: "knowledge",
      title: "잘못된 메타데이터",
      knowledge_domain: "unknown-domain",
      knowledge_topics: ["", "   "],
      connections: ["[[MISSING TARGET]]"]
    }, "# 잘못된 메타데이터\n\n검증 실패용.\n")
  ];

  const brokenLinks = [
    doc("links/broken.md", {
      type: "knowledge",
      title: "끊어진 링크",
      knowledge_domain: "business",
      knowledge_topics: ["signals"],
      connections: ["[[SYNTHETIC/knowledge-explorer/missing/nowhere.md]]"]
    }, "# 끊어진 링크\n\nbroken link fixture.\n")
  ];

  const duplicateLinks = [
    doc("links/duplicate.md", {
      type: "knowledge",
      title: "중복 링크",
      knowledge_domain: "coding",
      knowledge_topics: ["tests"],
      connections: [
        "[[SYNTHETIC/knowledge-explorer/people/정호성.md]]",
        "[[SYNTHETIC/knowledge-explorer/people/정호성.md]]"
      ]
    }, "# 중복 링크\n\nsame target twice.\n")
  ];

  const emptyDomains = [
    doc("knowledge/empty-domain.md", {
      type: "knowledge",
      title: "도메인 없음",
      knowledge_domain: "",
      knowledge_topics: []
    }, "# 도메인 없음\n\nprojection-only fallback case.\n")
  ];

  const longKoreanLabels = [
    doc("knowledge/long-korean-label.md", {
      type: "knowledge",
      title: "아주 길고 길고 길고 길고 길고 길고 긴 한국어 제목이 줄바꿈 없이 이어지는 상태를 검증한다",
      knowledge_domain: "personal_growth",
      knowledge_topics: ["습관", "반복", "집중"]
    }, "# 아주 길고 길고 길고 길고 길고 길고 긴 한국어 제목이 줄바꿈 없이 이어지는 상태를 검증한다\n\n긴 한국어 레이블을 위한 synthetic note.\n")
  ];

  const unbrokenUrls = [
    doc("knowledge/unbroken-url.md", {
      type: "knowledge",
      title: "URL 테스트",
      knowledge_domain: "reading",
      knowledge_topics: ["source"]
    }, "# URL 테스트\n\nhttps://example.com/this/is/a/really/long/unbroken/url/that/stays/intact?query=knowledge&mode=explore\n")
  ];

  const providerSuccess = [
    {
      id: "provider-success",
      provider: "synthetic-provider",
      ok: true,
      response: {
        summary: "deterministic summary",
        sources: ["synthetic-1", "synthetic-2"]
      }
    }
  ];

  const providerFailure = [
    {
      id: "provider-failure",
      provider: "synthetic-provider",
      ok: false,
      error: "provider unavailable"
    }
  ];

  const containers = [
    { id: "desktop", width: 1280, height: 900, mode: "wide" },
    { id: "narrow", width: 375, height: 812, mode: "drill-down" }
  ];

  return deepFreeze({
    validatedKnowledge,
    legacyPermanentNotes: deepFreeze(validatedKnowledge.filter(() => false).concat([])),
    literatureResources,
    venues,
    auctionRegions,
    people,
    projects,
    journals,
    dailyNotes,
    malformed,
    brokenLinks,
    duplicateLinks,
    emptyDomains,
    longKoreanLabels,
    unbrokenUrls,
    providerSuccess,
    providerFailure,
    containers
  });
}

module.exports = { createFixtureCaseSet };
