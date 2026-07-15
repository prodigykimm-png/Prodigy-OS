(function () {
  const PROPERTY_LABELS = Object.freeze({
    id: "식별자", type: "유형", status: "상태", created: "생성일", updated: "수정일",
    next_action: "다음 행동", due_date: "마감일", start_date: "시작일", priority: "우선순위",
    review_status: "복기 상태", connections: "연결", source: "출처", auction: "옥션원",
    naver: "네이버 부동산", cafe: "네이버 카페", recommend: "추천 여부",
    recommend_level: "추천 등급", recommend_note: "추천 메모", recommend_sources: "추천 근거",
    case_number: "사건번호", court: "법원", auction_dept: "경매계", auction_datetime: "입찰 일시",
    region_sido: "시도", region_sigungu: "시군구", region_dong: "읍면동", address: "주소",
    property_type: "물건 유형", building_year: "준공 연도", exclusive_area: "전용 면적",
    supply_area: "공급 면적", appraisal_price: "감정가", minimum_bid: "최저 입찰가",
    minimum_bid_rate: "최저가율", bid_deposit: "입찰 보증금", recommendation: "추천",
    expected_bid: "예상 입찰가", my_bid_price: "실제 입찰가", winning_bid_price: "낙찰가",
    market_sale_price: "매매 시세", market_jeonse_price: "전세 시세", expected_deposit: "예상 보증금",
    expected_monthly_rent: "예상 월세", exit_price: "출구가", market_price_basis: "시세 근거",
    loan_ratio: "대출 비율", interest_rate: "대출 이율", site_visit_date: "현장 방문일",
    decision_reason: "판단 사유", decision_date: "판단일", review_date: "복기 완료일",
    auction_note: "참고 메모", my_opinion: "나의 의견", attachments: "첨부자료",
    appraisal_report: "감정평가서", sale_statement: "매각물건명세서", field_report: "현장 보고서",
    category: "분류", author: "저자", started: "시작일", finished: "완료일", rating: "평점",
    progress: "진행도", todoist_project_id: "Todoist 프로젝트", todoist_sync_status: "Todoist 연동 상태"
  });

  const STATUS_INFO = Object.freeze({
    watching: Object.freeze({ label: "관심", icon: "👀", color: "#888888" }),
    idea: Object.freeze({ label: "아이디어", icon: "💡", color: "#8b5cf6" }),
    planning: Object.freeze({ label: "계획", icon: "📋", color: "#3b82f6" }),
    doing: Object.freeze({ label: "진행", icon: "▶", color: "#22c55e" }),
    active: Object.freeze({ label: "활성", icon: "▶", color: "#22c55e" }),
    bidding: Object.freeze({ label: "입찰 예정", icon: "⚖️", color: "#3b82f6" }),
    reviewing: Object.freeze({ label: "복기 중", icon: "🔄", color: "#f97316" }),
    won: Object.freeze({ label: "낙찰", icon: "🏆", color: "#22c55e" }),
    lost: Object.freeze({ label: "패찰", icon: "✕", color: "#ef4444" }),
    skipped: Object.freeze({ label: "입찰 포기", icon: "✕", color: "#666666" }),
    archived: Object.freeze({ label: "보관", icon: "▣", color: "#555555" }),
    blocked: Object.freeze({ label: "지연", icon: "!", color: "#ef4444" }),
    completed: Object.freeze({ label: "완료", icon: "✓", color: "#06b6d4" }),
    queue: Object.freeze({ label: "독서 대기", icon: "📚", color: "#8e8e93" }),
    to_read: Object.freeze({ label: "읽을 예정", icon: "📚", color: "#8e8e93" }),
    reading: Object.freeze({ label: "독서 중", icon: "📖", color: "#22c55e" }),
    finished: Object.freeze({ label: "완독", icon: "✓", color: "#06b6d4" }),
    paused: Object.freeze({ label: "일시 정지", icon: "Ⅱ", color: "#eab308" }),
    dropped: Object.freeze({ label: "중단", icon: "✕", color: "#ef4444" }),
    capture: Object.freeze({ label: "등록", icon: "+", color: "#14b8a6" }),
    learning: Object.freeze({ label: "학습 중", icon: "▶", color: "#22c55e" }),
    planned: Object.freeze({ label: "계획", icon: "📋", color: "#3b82f6" }),
    scheduled: Object.freeze({ label: "예정", icon: "📅", color: "#64748b" }),
    in_meeting: Object.freeze({ label: "진행 중", icon: "▶", color: "#22c55e" }),
    identified: Object.freeze({ label: "등록", icon: "+", color: "#78716c" }),
    engaging: Object.freeze({ label: "접촉 중", icon: "▶", color: "#78716c" }),
    connected: Object.freeze({ label: "연결 완료", icon: "✓", color: "#06b6d4" })
  });

  const PRIORITY_LABELS = Object.freeze({
    1: "매우 높음", 2: "높음", 3: "보통", 4: "낮음", 5: "매우 낮음",
    low: "낮음", medium: "보통", high: "높음", critical: "매우 높음",
    "매우 낮음": "매우 낮음", "낮음": "낮음", "보통": "보통", "높음": "높음", "매우 높음": "매우 높음"
  });
  const TYPE_INFO = Object.freeze({
    auction_case: Object.freeze({ label: "경매", icon: "🏢", color: "#3b82f6" }),
    reading: Object.freeze({ label: "독서", icon: "📖", color: "#eab308" }),
    project: Object.freeze({ label: "프로젝트", icon: "📁", color: "#f97316" }),
    project_family: Object.freeze({ label: "프로젝트", icon: "📁", color: "#f97316" }),
    project_note: Object.freeze({ label: "프로젝트", icon: "📁", color: "#f97316" }),
    knowledge: Object.freeze({ label: "지식", icon: "🧠", color: "#a855f7" }),
    journal: Object.freeze({ label: "저널", icon: "📅", color: "#ec4899" }),
    people: Object.freeze({ label: "사람", icon: "👤", color: "#78716c" }),
    contact: Object.freeze({ label: "사람", icon: "👤", color: "#78716c" }),
    workout: Object.freeze({ label: "운동", icon: "💪", color: "#ef4444" }),
    wedding: Object.freeze({ label: "웨딩", icon: "📸", color: "#8b5cf6" }),
    study: Object.freeze({ label: "공부", icon: "📚", color: "#22c55e" }),
    area_family: Object.freeze({ label: "영역", icon: "🌐", color: "#14b8a6" }),
    area_note: Object.freeze({ label: "영역 노트", icon: "📝", color: "#14b8a6" }),
    area_note_sub: Object.freeze({ label: "영역 세부", icon: "📝", color: "#14b8a6" }),
    fleeting_note: Object.freeze({ label: "메모", icon: "💡", color: "#14b8a6" }),
    permanent_note: Object.freeze({ label: "영구 노트", icon: "🧠", color: "#14b8a6" }),
    literature_note: Object.freeze({ label: "문헌", icon: "📖", color: "#14b8a6" }),
    meeting: Object.freeze({ label: "회의", icon: "📅", color: "#64748b" }),
    workstation_note: Object.freeze({ label: "워크스테이션", icon: "💻", color: "#64748b" }),
    documentation_note: Object.freeze({ label: "문서", icon: "📄", color: "#64748b" }),
    new_note: Object.freeze({ label: "노트", icon: "📌", color: "#6b7280" })
  });

  const fallbackInfo = (label) => Object.freeze({ label, icon: "", color: "#6b7280" });
  const statusInfo = (value) => STATUS_INFO[value] || fallbackInfo(value ? "미등록 상태" : "미지정");
  const typeInfo = (value) => TYPE_INFO[value] || fallbackInfo(value ? "미등록 유형" : "미지정");

  window.prodigyDisplay = Object.freeze({
    property: (key) => PROPERTY_LABELS[key] || "미등록 항목",
    status: (value) => statusInfo(value).label,
    statusInfo,
    priority: (value) => PRIORITY_LABELS[value] || (value ? "미등록 우선순위" : "미지정"),
    type: (value) => typeInfo(value).label,
    typeInfo
  });
})();
