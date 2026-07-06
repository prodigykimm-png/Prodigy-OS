// ===== Prodigy OS — Object Card View =====
// Version: 0.7 — Data / Behavior / View layer separation
// Modes: greeting | today | continue

// ╔══════════════════════════════════════════════════╗
// ║  DATA LAYER                                     ║
// ║  변경 빈도: 낮음 (Type 추가/변경 시에만)         ║
// ╚══════════════════════════════════════════════════╝

const TYPE_DISPLAY = {
  auction_case:       { icon: "🏢", display: "경매",     color: "#3b82f6" },
  wedding:            { icon: "📸", display: "웨딩",     color: "#8b5cf6" },
  study:              { icon: "📚", display: "공부",     color: "#22c55e" },
  project_family:     { icon: "🚀", display: "프로젝트", color: "#f97316" },
  project_note:       { icon: "🚀", display: "프로젝트", color: "#f97316" },
  workout:            { icon: "💪", display: "운동",     color: "#ef4444" },
  reading:            { icon: "📖", display: "독서",     color: "#eab308" },
  area_family:        { icon: "🌐", display: "영역",     color: "#14b8a6" },
  area_note:          { icon: "📝", display: "영역 노트", color: "#14b8a6" },
  area_note_sub:      { icon: "📝", display: "영역 세부", color: "#14b8a6" },
  fleeting_note:      { icon: "💡", display: "메모",     color: "#14b8a6" },
  permanent_note:     { icon: "🧠", display: "영구 노트", color: "#14b8a6" },
  literature_note:    { icon: "📖", display: "문헌",     color: "#14b8a6" },
  meeting:            { icon: "📅", display: "회의",     color: "#64748b" },
  contact:            { icon: "👤", display: "연락처",   color: "#78716c" },
  workstation_note:   { icon: "💻", display: "워크스테이션", color: "#64748b" },
  documentation_note: { icon: "📄", display: "문서",     color: "#64748b" },
  new_note:           { icon: "📌", display: "노트",     color: "#6b7280" },
};

const STATUS_DISPLAY = {
  // Auction
  watching:           "관심 물건",
  rights_analysis:    "권리 분석",
  market_analysis:    "시장 조사",
  profitability:      "수익성 분석",
  site_visit:         "임장",
  ready_to_bid:       "입찰 준비",
  bid_submitted:      "입찰 완료",
  won:                "낙찰",
  lost:               "패찰",
  review_completed:   "복기 완료",
  archived:           "보관",

  // Project
  idea:               "아이디어",
  planning:           "계획 중",
  doing:              "실행 중",
  reviewing:          "복기 중",

  // Study
  capture:            "등록",
  learning:           "학습 중",

  // Workout
  planned:            "계획",

  // Reading
  to_read:            "읽을 예정",
  reading:            "읽는 중",
  finished:           "다 읽음",

  // Meeting
  scheduled:          "예정",
  in_meeting:         "진행 중",

  // Contact
  identified:         "등록",
  engaging:           "접촉 중",
  connected:          "연결 완료",

  // Generic
  completed:          "완료",
};

// ╔══════════════════════════════════════════════════╗
// ║  BEHAVIOR LAYER                                 ║
// ║  변경 빈도: 중간 (Workflow/필터 로직 변경 시)    ║
// ╚══════════════════════════════════════════════════╝

function getTypeDisplay(type) {
  return TYPE_DISPLAY[type] || { icon: "📌", display: type || "노트", color: "#6b7280" };
}

function getStatusDisplay(status) {
  return STATUS_DISPLAY[status] || status || "-";
}

function getDueLabel(dueDate, today) {
  if (!dueDate) return null;
  const d = dv.date(dueDate);
  if (!d) return null;
  const days = Math.floor(d.diff(today, "days").days);
  if (days <= 0) return { text: "🔥 D-Day", color: "#ef4444", bold: true };
  if (days === 1) return { text: "D-1", color: "#f97316", bold: false };
  if (days <= 7) return { text: "D-" + days, color: "var(--text-muted)", bold: false };
  return { text: "D-" + days, color: "var(--text-muted)", bold: false, small: true };
}

function getActiveObjects() {
  return dv.pages()
    .where(p =>
      !p.file.folder.includes("SYSTEM") &&
      !p.file.folder.includes("HUB") &&
      p.next_action &&
      p.status != "completed" &&
      p.status != "review_completed" &&
      p.status != "archived"
    );
}

function getReviewObjects() {
  return dv.pages()
    .where(p =>
      !p.file.folder.includes("SYSTEM") &&
      !p.file.folder.includes("HUB") &&
      (p.review_status == "pending" || p.status == "won" || p.status == "lost")
    );
}

// ╔══════════════════════════════════════════════════╗
// ║  VIEW LAYER                                     ║
// ║  변경 빈도: 높음 (UX/레이아웃 변경 시)           ║
// ╚══════════════════════════════════════════════════╝

function renderCard(obj) {
  const typeInfo = getTypeDisplay(obj.type);
  const displayStatus = getStatusDisplay(obj.status);
  const dueLabel = getDueLabel(obj.due_date, dv.date("today"));

  const card = dv.container.createEl("div", { cls: "prodigy-object-card" });
  card.style.setProperty("--card-accent", typeInfo.color);

  // Row 1: Icon + Type (Display)
  card.createEl("div", { cls: "prodigy-card-type", text: typeInfo.icon + " " + typeInfo.display });

  // Row 2: Object Name (clickable internal link)
  const nameRow = card.createEl("div", { cls: "prodigy-card-name" });
  nameRow.createEl("a", {
    cls: "internal-link",
    text: obj.file.name,
    attr: { "data-href": obj.file.path, href: "#" }
  });

  // Row 3: Divider
  card.createEl("hr", { cls: "prodigy-card-divider" });

  // Row 4: Status (Korean display + dot) + Due badge
  const statusRow = card.createEl("div", { cls: "prodigy-card-status" });
  const statusLeft = statusRow.createEl("div", { cls: "prodigy-card-status-left" });
  statusLeft.createEl("span", { cls: "prodigy-status-dot" });
  statusLeft.createEl("span", { text: displayStatus });

  if (dueLabel) {
    const due = statusRow.createEl("span", { cls: "prodigy-due-badge", text: dueLabel.text });
    if (dueLabel.color) due.style.color = dueLabel.color;
    if (dueLabel.bold) due.style.fontWeight = "700";
    if (dueLabel.small) due.style.fontSize = "0.8em";
  }

  // Row 5: Next Action
  if (obj.next_action) {
    card.createEl("div", { cls: "prodigy-card-action", text: "→ " + obj.next_action });
  }
}

// ╔══════════════════════════════════════════════════╗
// ║  RENDERING DISPATCH                             ║
// ╚══════════════════════════════════════════════════╝

const mode = input.mode || "today";
const days = input.days || 7;
const limit = input.limit || 10;
const today = dv.date("today");

// --- Greeting mode ---
if (mode === "greeting") {
  const active = getActiveObjects();

  const counts = {};
  for (const obj of active) {
    const td = getTypeDisplay(obj.type);
    const key = td.icon + " " + td.display;
    counts[key] = (counts[key] || 0) + 1;
  }

  const reviewCount = getReviewObjects().length;

  const box = dv.container.createEl("div", { cls: "prodigy-good-morning" });
  box.createEl("div", {
    text: "Good Morning.",
    attr: { style: "font-weight: 600; font-size: 1.15em; margin-bottom: 8px;" }
  });

  if (Object.keys(counts).length > 0) {
    box.createEl("div", {
      text: "오늘",
      attr: { style: "color: var(--text-muted); margin-bottom: 4px;" }
    });
    for (const [key, count] of Object.entries(counts)) {
      box.createEl("div", { text: key + " " + count + "건" });
    }
  } else {
    box.createEl("div", {
      text: "오늘 예정된 Object가 없습니다.",
      attr: { style: "color: var(--text-muted);" }
    });
  }

  if (reviewCount > 0) {
    box.createEl("div", { attr: { style: "height: 8px;" } });
    box.createEl("div", {
      text: "⚠ 복기 필요 " + reviewCount + "건",
      attr: { style: "color: var(--color-orange);" }
    });
  }
}

// --- Today mode ---
else if (mode === "today") {
  const pages = getActiveObjects()
    .where(p => p.due_date && p.due_date <= today.plus({ days: days }))
    .sort(p => p.due_date)
    .sort(p => p.priority)
    .limit(limit);

  if (pages.length === 0) {
    dv.paragraph("*마감 예정인 Object가 없습니다.*");
  } else {
    for (const obj of pages) {
      renderCard(obj);
    }
  }
}

// --- Continue mode ---
else if (mode === "continue") {
  const pages = getActiveObjects()
    .where(p => !p.due_date || p.due_date > today.plus({ days: days }))
    .sort(p => p.priority)
    .sort(p => p.due_date)
    .limit(limit);

  if (pages.length === 0) {
    dv.paragraph("*진행 중인 Object가 없습니다.*");
  } else {
    for (const obj of pages) {
      renderCard(obj);
    }
  }
}
