(function () {
  const STATE_START = "<!-- PRODIGY_SITE_VISIT_STATE";
  const STATE_END = "-->";
  const REPORT_START = "<!-- PRODIGY_SITE_VISIT_REPORT_START -->";
  const REPORT_END = "<!-- PRODIGY_SITE_VISIT_REPORT_END -->";

  // Rating: unset | high | medium | low | na
  // Legacy: unchecked → unset, checked → medium, na → na
  const RATING_VALUES = ["unset", "high", "medium", "low", "na"];
  const RATING_LABELS = {
    unset: "미평가",
    high: "상",
    medium: "중",
    low: "하",
    na: "관계없음"
  };

  const COMMON_ITEMS = [
    "Environment", "Building Condition", "Common Areas", "Accessibility",
    "Parking", "Noise", "Odor", "Photos", "Management Office",
    "Broker Interview", "Unexpected Findings", "Occupancy", "General Atmosphere"
  ];
  const SPECIFIC_ITEMS = {
    generic: [],
    commercial: ["Street Visibility", "Pedestrian Flow", "Tenant Mix", "Loading Access"],
    apartment: ["Unit Layout", "Sunlight", "View", "Security", "Elevator"],
    officetel: [
      "Unit Layout", "Sunlight", "View", "Security", "Elevator",
      "Parking Type", "Management Fee", "Management Presence", "Residential Use", "Heating Cooling"
    ],
    lodging: [
      "Front Desk Operation", "Operation Contract", "Room Condition", "Fire Evacuation",
      "Common Facilities", "Management Fee", "Actual Lodging Use"
    ],
    land: ["Road Access", "Land Boundary", "Slope", "Drainage", "Neighboring Uses"],
    factory: ["Vehicle Access", "Power Supply", "Ceiling Height", "Loading Area", "Equipment Condition"],
    neighborhood: ["Customer Access", "Commercial Visibility", "Utilities", "Fire Safety"],
    multifamily: ["Unit Layout", "Common Entrance", "Parking Capacity", "Management", "Tenant Condition"]
  };
  const PRIORITY_ITEMS = {
    generic: ["Environment", "Building Condition", "Accessibility", "Parking", "Occupancy"],
    commercial: ["Street Visibility", "Pedestrian Flow", "Tenant Mix", "Accessibility", "Parking", "Loading Access"],
    apartment: ["Building Condition", "Parking", "Unit Layout", "Sunlight", "Security", "Elevator"],
    officetel: ["Parking Type", "Management Fee", "Management Presence", "Occupancy", "Common Areas", "Security"],
    lodging: ["Front Desk Operation", "Operation Contract", "Room Condition", "Fire Evacuation", "Common Facilities", "Management Fee"],
    land: ["Road Access", "Land Boundary", "Slope", "Drainage", "Neighboring Uses"],
    factory: ["Vehicle Access", "Power Supply", "Ceiling Height", "Loading Area", "Equipment Condition"],
    neighborhood: ["Customer Access", "Commercial Visibility", "Pedestrian Flow", "Parking", "Utilities", "Fire Safety"],
    multifamily: ["Common Entrance", "Parking Capacity", "Management", "Tenant Condition", "Occupancy", "Building Condition"]
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
    "Common Entrance": "공동 현관", "Parking Capacity": "주차 수용력", Management: "관리 상태", "Tenant Condition": "임차 상태",
    "Parking Type": "주차 방식", "Management Fee": "관리비", "Management Presence": "관리 인력 상주",
    "Residential Use": "실제 주거 이용", "Heating Cooling": "냉난방 방식",
    "Front Desk Operation": "프런트 운영", "Operation Contract": "위탁운영 계약", "Room Condition": "객실 상태",
    "Fire Evacuation": "소방·피난", "Common Facilities": "공용시설 운영", "Actual Lodging Use": "실제 숙박 운영"
  };

  const normalizeType = (value) => {
    const text = String(value || "").toLowerCase();
    if (/생활숙박|숙박시설|호텔|레지던스|lodging|hotel/.test(text)) return "lodging";
    if (/토지|land/.test(text)) return "land";
    if (/공장|지식산업|산업센터|factory|industrial/.test(text)) return "factory";
    if (/근린|상가/.test(text)) return "neighborhood";
    if (/다세대|다가구|연립|multi|multifamily/.test(text)) return "multifamily";
    if (/오피스텔|officetel/.test(text)) return "officetel";
    if (/아파트|apartment/.test(text)) return "apartment";
    if (/상업|commercial|retail/.test(text)) return "commercial";
    return "generic";
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const normalizeRating = (value) => {
    const raw = String(value || "").toLowerCase().trim();
    if (raw === "high" || raw === "상") return "high";
    if (raw === "medium" || raw === "중" || raw === "checked") return "medium";
    if (raw === "low" || raw === "하") return "low";
    if (raw === "na" || raw === "해당없음" || raw === "해당 없음") return "na";
    if (raw === "unset" || raw === "unchecked" || raw === "미확인" || raw === "미평가" || !raw) return "unset";
    return RATING_VALUES.includes(raw) ? raw : "unset";
  };

  const createState = (propertyType) => {
    const items = [...COMMON_ITEMS, ...SPECIFIC_ITEMS[normalizeType(propertyType)]];
    return {
      version: 2,
      propertyType: normalizeType(propertyType),
      startedAt: new Date().toISOString(),
      finishedAt: "",
      checklist: Object.fromEntries(items.map((label) => [label, "unset"])),
      checklistNotes: Object.fromEntries(items.map((label) => [label, ""])),
      notes: [],
      unexpected: [],
      photos: []
    };
  };

  const reconcileState = (state, propertyType) => {
    const normalizedType = normalizeType(propertyType);
    const expectedItems = [...COMMON_ITEMS, ...SPECIFIC_ITEMS[normalizedType]];
    const previous = state && typeof state === "object" ? state : createState(propertyType);
    const prevNotes = previous.checklistNotes && typeof previous.checklistNotes === "object"
      ? previous.checklistNotes
      : {};
    const checklist = Object.fromEntries(expectedItems.map((item) => {
      return [item, normalizeRating(previous.checklist?.[item])];
    }));
    const checklistNotes = Object.fromEntries(expectedItems.map((item) => {
      const note = prevNotes[item];
      return [item, note == null ? "" : String(note)];
    }));
    return {
      ...previous,
      version: 2,
      propertyType: normalizedType,
      checklist,
      checklistNotes,
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

  const ratingLine = (state, labels, rating) => {
    const notes = state.checklistNotes || {};
    return Object.entries(state.checklist || {})
      .filter(([, value]) => normalizeRating(value) === rating)
      .map(([key]) => {
        const label = labels[key] || key;
        const memo = String(notes[key] || "").trim();
        return memo ? `${label} (${RATING_LABELS[rating]}) — ${memo}` : `${label} (${RATING_LABELS[rating]})`;
      });
  };

  const buildReport = (state, labels, visitedAt) => {
    const high = ratingLine(state, labels, "high");
    const medium = ratingLine(state, labels, "medium");
    const low = ratingLine(state, labels, "low");
    const na = ratingLine(state, labels, "na");
    const findings = [...(state.notes || []), ...(state.unexpected || [])];
    const itemMemos = Object.entries(state.checklistNotes || {})
      .filter(([, note]) => String(note || "").trim())
      .map(([key, note]) => `${labels[key] || key}: ${String(note).trim()}`);
    const values = Object.values(state.checklist || {}).map(normalizeRating);
    return [
      "## 현장 방문 요약",
      "",
      "### 방문 일시",
      `- ${visitedAt}`,
      "",
      "### 주요 확인 내용 (상)",
      lines(high),
      "",
      "### 보통 (중)",
      lines(medium),
      "",
      "### 주의 (하)",
      lines(low),
      "",
      "### 관계없음",
      lines(na),
      "",
      "### 중요 관찰",
      lines(findings),
      "",
      "### 추가 확인 사항",
      lines(state.unexpected, "- 추가 확인 필요 사항 없음"),
      "",
      "### 체크리스트 기록",
      `- 상: ${values.filter((v) => v === "high").length}개`,
      `- 중: ${values.filter((v) => v === "medium").length}개`,
      `- 하: ${values.filter((v) => v === "low").length}개`,
      `- 관계없음: ${values.filter((v) => v === "na").length}개`,
      "",
      "### 항목 메모",
      lines(itemMemos),
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

  const isRated = (value) => {
    const rating = normalizeRating(value);
    return rating !== "unset";
  };

  const hasMeaningfulEvidence = (state) => {
    if (!state || typeof state !== "object") return false;
    if (Object.values(state.checklist || {}).some((value) => isRated(value))) return true;
    if (Object.values(state.checklistNotes || {}).some((value) => String(value || "").trim())) return true;
    return ["notes", "unexpected", "photos"].some((key) => (
      Array.isArray(state[key]) && state[key].some((value) => String(value || "").trim())
    ));
  };

  const priorityItemsFor = (propertyType) => {
    const type = normalizeType(propertyType);
    return clone(PRIORITY_ITEMS[type] || PRIORITY_ITEMS.generic);
  };

  window.prodigySiteVisit = {
    commonItems: clone(COMMON_ITEMS),
    specificItems: clone(SPECIFIC_ITEMS),
    ratingValues: clone(RATING_VALUES),
    ratingLabels: clone(RATING_LABELS),
    normalizeType,
    normalizeRating,
    priorityItemsFor,
    labelFor: (value) => ITEM_LABELS[value] || value,
    ratingLabel: (value) => RATING_LABELS[normalizeRating(value)] || value,
    createState,
    reconcileState,
    readState,
    readFileState,
    saveState,
    updateStateInContent,
    updateReportInContent,
    completeVisitInContent,
    buildReport,
    hasMeaningfulEvidence,
    isComplete: hasMeaningfulEvidence,
    progress: (state) => {
      const values = Object.values(state?.checklist || {});
      return { done: values.filter((value) => isRated(value)).length, total: values.length };
    }
  };
})();
