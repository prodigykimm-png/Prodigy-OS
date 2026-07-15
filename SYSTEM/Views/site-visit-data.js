(function () {
  const STATE_START = "<!-- PRODIGY_SITE_VISIT_STATE";
  const STATE_END = "-->";
  const REPORT_START = "<!-- PRODIGY_SITE_VISIT_REPORT_START -->";
  const REPORT_END = "<!-- PRODIGY_SITE_VISIT_REPORT_END -->";

  const COMMON_ITEMS = [
    "Environment", "Building Condition", "Common Areas", "Accessibility",
    "Parking", "Noise", "Odor", "Photos", "Management Office",
    "Broker Interview", "Unexpected Findings", "Occupancy", "General Atmosphere"
  ];
  const SPECIFIC_ITEMS = {
    generic: [],
    commercial: ["Street Visibility", "Pedestrian Flow", "Tenant Mix", "Loading Access"],
    apartment: ["Unit Layout", "Sunlight", "View", "Security", "Elevator"],
    land: ["Road Access", "Land Boundary", "Slope", "Drainage", "Neighboring Uses"],
    factory: ["Vehicle Access", "Power Supply", "Ceiling Height", "Loading Area", "Equipment Condition"],
    neighborhood: ["Customer Access", "Commercial Visibility", "Utilities", "Fire Safety"],
    multifamily: ["Unit Layout", "Common Entrance", "Parking Capacity", "Management", "Tenant Condition"]
  };
  const ITEM_LABELS = {
    Environment: "주변 환경", "Building Condition": "건물 상태", "Common Areas": "공용부", Accessibility: "접근성",
    Parking: "주차", Noise: "소음", Odor: "냄새", Photos: "사진", "Management Office": "관리사무소",
    "Broker Interview": "중개사 인터뷰", "Unexpected Findings": "예상 밖 발견", Occupancy: "점유 상태", "General Atmosphere": "전체 분위기",
    "Street Visibility": "도로 노출도", "Pedestrian Flow": "보행자 흐름", "Tenant Mix": "임차인 구성", "Loading Access": "하역 접근성",
    "Unit Layout": "호실 구조", Sunlight: "채광", View: "조망", Security: "보안", Elevator: "엘리베이터",
    "Road Access": "도로 접근성", "Land Boundary": "토지 경계", Slope: "경사", Drainage: "배수", "Neighboring Uses": "인접 토지 이용",
    "Vehicle Access": "차량 접근성", "Power Supply": "전력 공급", "Ceiling Height": "층고", "Loading Area": "하역 공간", "Equipment Condition": "설비 상태",
    "Customer Access": "고객 접근성", "Commercial Visibility": "상권 노출도", Utilities: "기반시설", "Fire Safety": "소방 안전",
    "Common Entrance": "공동 현관", "Parking Capacity": "주차 수용력", Management: "관리 상태", "Tenant Condition": "임차 상태"
  };

  const normalizeType = (value) => {
    const text = String(value || "").toLowerCase();
    if (/토지|land/.test(text)) return "land";
    if (/공장|지식산업|산업센터|factory|industrial/.test(text)) return "factory";
    if (/근린|상가/.test(text)) return "neighborhood";
    if (/다세대|다가구|연립|multi|multifamily/.test(text)) return "multifamily";
    if (/아파트|오피스텔|apartment|officetel/.test(text)) return "apartment";
    if (/상업|commercial|retail/.test(text)) return "commercial";
    return "generic";
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const createState = (propertyType) => ({
    version: 1,
    propertyType: normalizeType(propertyType),
    startedAt: new Date().toISOString(),
    finishedAt: "",
    checklist: Object.fromEntries([...COMMON_ITEMS, ...SPECIFIC_ITEMS[normalizeType(propertyType)]].map((label) => [label, "unchecked"])),
    notes: [],
    unexpected: [],
    photos: []
  });

  const reconcileState = (state, propertyType) => {
    const normalizedType = normalizeType(propertyType);
    const expectedItems = [...COMMON_ITEMS, ...SPECIFIC_ITEMS[normalizedType]];
    const previous = state && typeof state === "object" ? state : createState(propertyType);
    const checklist = Object.fromEntries(expectedItems.map((item) => {
      const value = previous.checklist?.[item];
      return [item, ["unchecked", "checked", "na"].includes(value) ? value : "unchecked"];
    }));
    return {
      ...previous,
      version: 1,
      propertyType: normalizedType,
      checklist,
      notes: Array.isArray(previous.notes) ? previous.notes : [],
      unexpected: Array.isArray(previous.unexpected) ? previous.unexpected : [],
      photos: Array.isArray(previous.photos) ? previous.photos : []
    };
  };

  const sectionRange = (content) => {
    const match = /(^|\n)# (?:현장 방문|Site Visit(?: Report)?)[ \t]*\n([\s\S]*?)(?=\n#[^#\n][^\n]*(?:\n|$)|$)/.exec(content);
    if (!match) throw new Error("현장 방문 섹션을 찾을 수 없습니다.");
    return { start: match.index + (match[1] ? match[1].length : 0), end: match.index + match[0].length, body: match[0] };
  };

  const readState = (content) => {
    const match = new RegExp(`${STATE_START}\\n([\\s\\S]*?)\\n${STATE_END}`).exec(content);
    if (!match) return null;
    try {
      const payload = match[1].trim();
      return JSON.parse(payload.startsWith("v1:") ? decodeURIComponent(payload.slice(3)) : payload);
    } catch (_) { throw new Error("현장 방문 내부 상태가 손상되었습니다."); }
  };

  const stateComment = (state) => `${STATE_START}\nv1:${encodeURIComponent(JSON.stringify(state))}\n${STATE_END}`;

  const updateStateInContent = (content, state) => {
    const comment = stateComment(state);
    const current = new RegExp(`${STATE_START}\\n[\\s\\S]*?\\n${STATE_END}`);
    if (current.test(content)) return content.replace(current, comment);
    const range = sectionRange(content);
    const insertAt = content.indexOf("\n", range.start) + 1;
    return content.slice(0, insertAt) + comment + "\n\n" + content.slice(insertAt);
  };

  const updateReportInContent = (content, report) => {
    const block = `${REPORT_START}\n${report}\n${REPORT_END}`;
    const current = new RegExp(`${REPORT_START}[\\s\\S]*?${REPORT_END}`);
    if (current.test(content)) return content.replace(current, block);
    const range = sectionRange(content);
    return content.slice(0, range.end) + "\n\n" + block + content.slice(range.end);
  };

  const completeVisitInContent = (content, state, report) => (
    updateReportInContent(updateStateInContent(content, state), report)
  );

  const readFileState = async (file, propertyType) => {
    const state = readState(await app.vault.read(file));
    return reconcileState(state, propertyType);
  };

  const saveState = async (file, state) => {
    const content = await app.vault.read(file);
    await app.vault.modify(file, updateStateInContent(content, state));
  };

  const reportText = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n]+/g, " ");

  const lines = (values, empty = "- 기록 없음") => {
    const items = (values || []).filter(Boolean);
    return items.length ? items.map((value) => `- ${reportText(value)}`).join("\n") : empty;
  };

  const buildReport = (state, labels, visitedAt) => {
    const checked = Object.entries(state.checklist).filter(([, value]) => value === "checked").map(([key]) => labels[key] || key);
    const na = Object.entries(state.checklist).filter(([, value]) => value === "na").map(([key]) => labels[key] || key);
    const findings = [...(state.notes || []), ...(state.unexpected || [])];
    return [
      "## 현장 방문 요약",
      "",
      "### 방문 일시",
      `- ${visitedAt}`,
      "",
      "### 주요 확인 내용",
      lines(checked.map((item) => `${item} 확인`)),
      "",
      "### 중요 관찰",
      lines(findings),
      "",
      "### 추가 확인 사항",
      lines(state.unexpected, "- 추가 확인 필요 사항 없음"),
      "",
      "### 체크리스트 기록",
      `- 확인: ${checked.length}개`,
      `- 해당 없음: ${na.length}개`,
      "",
      "### 짧은 현장 메모",
      lines(state.notes),
      "",
      "### 예상 밖 발견",
      lines(state.unexpected),
      "",
      "### 사진",
      (state.photos || []).length ? state.photos.map((path) => `- ![[${path}]]`).join("\n") : "- 사진 없음"
    ].join("\n");
  };

  window.prodigySiteVisit = {
    commonItems: clone(COMMON_ITEMS),
    specificItems: clone(SPECIFIC_ITEMS),
    normalizeType,
    labelFor: (value) => ITEM_LABELS[value] || value,
    createState,
    reconcileState,
    readState,
    readFileState,
    saveState,
    updateStateInContent,
    updateReportInContent,
    completeVisitInContent,
    buildReport,
    isComplete: (state) => state && Object.values(state.checklist || {}).every((value) => value !== "unchecked"),
    progress: (state) => {
      const values = Object.values(state?.checklist || {});
      return { done: values.filter((value) => value !== "unchecked").length, total: values.length };
    }
  };
})();
