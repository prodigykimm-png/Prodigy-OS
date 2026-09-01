(function () {
  // allow: SIZE_OK — one central, static Korean display registry prevents label ownership from fragmenting across Views.
  const T = (typeof globalThis !== "undefined" ? globalThis : this).ProdigyTokens;
  const C = T ? T.COLORS : {};
  const PROPERTY_LABELS = Object.freeze({
    id: "식별자", schema_version: "스키마 버전", type: "유형", status: "상태", created: "생성일", updated: "수정일",
    next_action: "다음 행동", due_date: "마감일", start_date: "시작일", priority: "우선순위",
    review_status: "복기 상태", connections: "연결", source: "출처", auction: "옥션원",
    naver: "네이버 부동산", cafe: "네이버 카페", recommend: "추천 여부",
    recommend_level: "추천 등급", recommend_note: "추천 메모", recommend_sources: "추천 근거",
    case_number: "사건번호", court: "법원", auction_dept: "경매계", auction_datetime: "입찰 일시",
    court_status: "법원 진행 상태", court_status_as_of: "법원 상태 기준일", court_status_note: "법원 상태 메모",
    region_sido: "시도", region_sigungu: "시군구", region_dong: "읍면동", address: "주소", venue_category: "장소 분류",
    metrics_as_of: "지표 기준일", metrics_scope: "지표 범위", metrics_provider: "시장 지표 공급자",
    metrics_source: "지표 출처", source_as_of: "출처 확인일", verification_status: "검증 상태",
    housing_stock_basis: "재고 정의", sale_price_change_basis: "매매가 변동 기준",
    households_provider: "세대 지표 공급자", auction_metrics_provider: "경매 지표 공급자",
    auction_bid_rate_basis: "낙찰가율 기준",
    sale_volume_3m: "매매 거래량(3개월)", housing_stock: "주택 재고",
    sale_turnover_rate: "매매 회전율", sale_price_change_yoy: "매매가 변동 YoY",
    jeonse_ratio: "전세가율", move_in_12m: "입주 예정 12개월", move_in_24m: "입주 예정 24개월",
    move_in_36m: "입주 예정 36개월", move_in_48m: "입주 예정 48개월", move_in_60m: "입주 예정 60개월",
    land_price_trend_yoy: "지가 변동률", land_price_trend_as_of: "지가 기준일", land_price_trend_scope: "지가 범위", land_price_trend_source: "지가 출처",
    households: "세대수", household_change_yoy: "세대수 변동 YoY",
    auction_bid_rate_6m: "경매 낙찰가율(6개월)",
    property_type: "물건 유형", building_year: "준공 연도", exclusive_area: "전용 면적",
    land_parcel_id: "공시지가 필지", official_land_price_per_sqm: "개별공시지가(㎡당)", official_land_price_as_of: "공시지가 기준일", official_land_price_source: "공시지가 출처", land_rights_area_sqm: "토지권 면적",
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
    progress: "진행도", title: "제목", creator: "제작자", goal: "목표", difficulty: "난이도",
    duration: "기간", exercise: "운동", date: "날짜", intensity: "강도", sets: "세트",
    reps: "횟수", weight: "중량", distance: "거리", calories: "칼로리", mood: "기분", notes: "메모",
    publish_date: "출간일", cover_url: "표지", language: "언어",
    key_takeaway: "핵심 배움", review_summary: "복기 요약",
    todoist_project_id: "Todoist 프로젝트", todoist_sync_status: "Todoist 연동 상태",
    project_type: "프로젝트 유형",
    reflection: "성찰", change: "변화", next_experiment: "다음 실험",
    daily_reflection: "성찰", learning: "배움", lesson: "교훈",
    delta: "변화", next_step: "다음 단계", experiment: "실험", review: "복기",
    book_id: "책 ID", book_title: "책 제목", reading_purpose: "독서 목적",
    purpose: "목적", current_page: "현재 페이지", total_page: "전체 페이지",
    started_at: "시작 시각", completed_at: "완료 시각",
    session_id: "세션 ID", book: "책", start_page: "시작 페이지", end_page: "종료 페이지",
    reading_range: "읽은 범위", key_content: "핵심 내용", my_thought: "내 생각",
    thinking_delta: "생각의 변화", next_position: "다음 위치",
    knowledge_candidate_ids: "지식 후보",
    candidate_id: "후보 ID", statement: "지식 문장", reason: "이유",
    source_type: "출처 유형", source_note: "학습 출처 메모", source_evidence_ids: "출처 증거 ID", source_objects: "출처 Object",
    source_kind: "자료 유형", source_id: "자료 ID", source_batch_id: "자료 묶음 ID", source_url: "자료 URL", source_title: "자료 제목",
    publisher: "발행처", published_at: "발행일", summary_origin: "요약 출처",
    application_trigger: "적용 계기", application_contexts: "적용 맥락",
    confidence: "확신 수준", suggested_domain: "제안 지식 도메인", suggested_topics: "제안 지식 주제",
    approval_note: "승인 메모", promotion_target: "승격 대상", promoted_knowledge: "승격된 지식",
    source_session_id: "출처 세션 ID",
    source_session: "출처 세션", source_book: "출처 책",
    reading_strategy: "독서 전략", book_type: "책 유형", reading_type: "독서 유형",
    cover: "표지", cover_image: "표지 이미지", book_cover: "책 표지", image: "이미지",
    relationship: "관계", company: "소속", role: "역할", birthday: "생일",
    first_met: "처음 만난 날", last_contact: "최근 연락", phone: "전화", email: "이메일",
    area: "영역", area_category: "영역 분류", summary: "요약", reference: "참고 자료",
    scheduled_date: "예정일", start_time: "시작 시각", end_time: "종료 시각",
    meeting_status: "회의 상태",
    target: "목표 부위", cue: "운동 큐", primary_muscles: "주요 근육",
    secondary_muscles: "보조 근육", equipment: "장비",
    todoist_last_error: "Todoist 오류", knowledge_domain: "지식 도메인", knowledge_topics: "지식 주제"
    , auction_outcome: "경매 결과", auction_result_date: "결과 확정일",
    invalidation_conditions: "무효화 조건",
    reading_format: "독서 형식", identifier: "식별 번호"
  });

  const STATUS_INFO = Object.freeze({
    watching: Object.freeze({ label: "관심", icon: "👀", color: C.muted }),
    idea: Object.freeze({ label: "아이디어", icon: "💡", color: C.accent }),
    planning: Object.freeze({ label: "계획", icon: "📋", color: C.info }),
    doing: Object.freeze({ label: "진행", icon: "▶", color: C.success }),
    active: Object.freeze({ label: "활성", icon: "▶", color: C.success }),
    bidding: Object.freeze({ label: "입찰 예정", icon: "⚖️", color: C.info }),
    reviewing: Object.freeze({ label: "복기 중", icon: "🔄", color: C.warning }),
    proposed: Object.freeze({ label: "제안", icon: "✦", color: C.accentAlt }),
    saved: Object.freeze({ label: "보관", icon: "☆", color: C.success }),
    needs_more_evidence: Object.freeze({ label: "증거 보강", icon: "⚠", color: C.caution }),
    approved: Object.freeze({ label: "승인", icon: "✓", color: C.success }),
    rejected: Object.freeze({ label: "반려", icon: "✕", color: C.neutral600 }),
    won: Object.freeze({ label: "낙찰", icon: "🏆", color: C.success }),
    lost: Object.freeze({ label: "패찰", icon: "✕", color: C.error }),
    skipped: Object.freeze({ label: "입찰 포기", icon: "✕", color: C.neutral600 }),
    archived: Object.freeze({ label: "보관", icon: "▣", color: C.neutral800 }),
    blocked: Object.freeze({ label: "지연", icon: "!", color: C.error }),
    completed: Object.freeze({ label: "완료", icon: "✓", color: C.cyan }),
    queue: Object.freeze({ label: "독서 대기", icon: "📚", color: C.neutral500 }),
    to_read: Object.freeze({ label: "읽을 예정", icon: "📚", color: C.neutral500 }),
    reading: Object.freeze({ label: "독서 중", icon: "📖", color: C.success }),
    finished: Object.freeze({ label: "완독", icon: "✓", color: C.cyan }),
    paused: Object.freeze({ label: "일시 정지", icon: "Ⅱ", color: C.caution }),
    dropped: Object.freeze({ label: "중단", icon: "✕", color: C.error }),
    capture: Object.freeze({ label: "등록", icon: "+", color: C.teal }),
    learning: Object.freeze({ label: "학습 중", icon: "▶", color: C.success }),
    planned: Object.freeze({ label: "계획", icon: "📋", color: C.info }),
    scheduled: Object.freeze({ label: "예정", icon: "📅", color: C.neutral700 }),
    in_meeting: Object.freeze({ label: "진행 중", icon: "▶", color: C.success }),
    identified: Object.freeze({ label: "등록", icon: "+", color: C.stone }),
    engaging: Object.freeze({ label: "접촉 중", icon: "▶", color: C.stone }),
    connected: Object.freeze({ label: "연결 완료", icon: "✓", color: C.cyan })
  });

  const PRIORITY_LABELS = Object.freeze({
    1: "매우 높음", 2: "높음", 3: "보통", 4: "낮음", 5: "매우 낮음",
    low: "낮음", medium: "보통", high: "높음", critical: "매우 높음",
    "매우 낮음": "매우 낮음", "낮음": "낮음", "보통": "보통", "높음": "높음", "매우 높음": "매우 높음"
  });
  const TYPE_INFO = Object.freeze({
    auction_case: Object.freeze({ label: "경매", icon: "🏢", color: C.info }),
    auction_region: Object.freeze({ label: "부동산 지역", icon: "🗺", color: C.infoLight }),
    reading: Object.freeze({ label: "독서", icon: "📖", color: C.caution }),
    reading_session: Object.freeze({ label: "독서 세션", icon: "✎", color: C.caution }),
    knowledge_candidate: Object.freeze({ label: "지식 후보", icon: "✦", color: C.accentAlt }),
    journal: Object.freeze({ label: "저널", icon: "📅", color: C.pink }),
    project: Object.freeze({ label: "프로젝트", icon: "📁", color: C.warning }),
    project_family: Object.freeze({ label: "프로젝트", icon: "📁", color: C.warning }),
    project_note: Object.freeze({ label: "프로젝트", icon: "📁", color: C.warning }),
    knowledge: Object.freeze({ label: "지식", icon: "🧠", color: C.accentAlt }),
    venue: Object.freeze({ label: "장소", icon: "", color: C.accent }),
    people: Object.freeze({ label: "사람", icon: "👤", color: C.stone }),
    contact: Object.freeze({ label: "사람", icon: "👤", color: C.stone }),
    workout: Object.freeze({ label: "운동", icon: "💪", color: C.error }),
    workout_program: Object.freeze({ label: "운동 프로그램", icon: "▤", color: C.error }),
    exercise: Object.freeze({ label: "운동 종목", icon: "+", color: C.teal }),
    wedding: Object.freeze({ label: "웨딩", icon: "📸", color: C.accent }),
    study: Object.freeze({ label: "공부", icon: "📚", color: C.success }),
    area_family: Object.freeze({ label: "영역", icon: "🌐", color: C.teal }),
    area_note: Object.freeze({ label: "영역 노트", icon: "📝", color: C.teal }),
    area_note_sub: Object.freeze({ label: "영역 세부", icon: "📝", color: C.teal }),
    fleeting_note: Object.freeze({ label: "메모", icon: "💡", color: C.teal }),
    permanent_note: Object.freeze({ label: "영구 노트", icon: "🧠", color: C.teal }),
    literature_note: Object.freeze({ label: "문헌", icon: "📖", color: C.teal }),
    meeting: Object.freeze({ label: "회의", icon: "📅", color: C.neutral700 }),
    workstation_note: Object.freeze({ label: "워크스테이션", icon: "💻", color: C.neutral700 }),
    documentation_note: Object.freeze({ label: "문서", icon: "📄", color: C.neutral700 }),
    new_note: Object.freeze({ label: "노트", icon: "📌", color: C.neutral600 })
  });

  const LIFECYCLE_INFO = Object.freeze({
    healthy: Object.freeze({ label: "정상", icon: "●", color: C.success }),
    needs_action: Object.freeze({ label: "다음 행동 필요", icon: "!", color: C.warning }),
    needs_review: Object.freeze({ label: "복기 필요", icon: "↻", color: C.caution }),
    stale: Object.freeze({ label: "오래 방치됨", icon: "◌", color: C.neutral500 }),
    completed: Object.freeze({ label: "완료", icon: "✓", color: C.cyan })
  });

  const KNOWLEDGE_DOMAIN_INFO = Object.freeze({
    real_estate: Object.freeze({ label: "부동산" }),
    wedding: Object.freeze({ label: "웨딩" }),
    coding: Object.freeze({ label: "코딩" }),
    workout: Object.freeze({ label: "운동" }),
    reading: Object.freeze({ label: "독서" }),
    business: Object.freeze({ label: "비즈니스" }),
    personal_growth: Object.freeze({ label: "개인 성장" })
  });

  const KNOWLEDGE_TOPIC_INFO = Object.freeze({
    shooting: Object.freeze({ label: "촬영" }),
    lighting: Object.freeze({ label: "조명" }),
    editing: Object.freeze({ label: "편집" }),
    equipment: Object.freeze({ label: "장비" }),
    rights_analysis: Object.freeze({ label: "권리 분석" }),
    site_visit: Object.freeze({ label: "현장 방문" }),
    bidding: Object.freeze({ label: "입찰" }),
    public_auction: Object.freeze({ label: "공매" }),
    tax: Object.freeze({ label: "세금" }),
    precedent: Object.freeze({ label: "판례" }),
    electron: Object.freeze({ label: "일렉트론" }),
    react: Object.freeze({ label: "리액트" }),
    typescript: Object.freeze({ label: "타입스크립트" }),
    python: Object.freeze({ label: "파이썬" }),
    ai: Object.freeze({ label: "인공지능" }),
    prompt_engineering: Object.freeze({ label: "프롬프트 엔지니어링" }),
    obsidian_plugin: Object.freeze({ label: "옵시디언 플러그인" }),
    claude_code: Object.freeze({ label: "클로드 코드" }),
    codex: Object.freeze({ label: "코덱스" }),
    gemini: Object.freeze({ label: "제미나이" })
  });

  const KNOWLEDGE_SOURCE_TYPE_INFO = Object.freeze({
    daily_evidence: Object.freeze({ label: "일일 근거" }),
    reading_session: Object.freeze({ label: "독서 세션" }),
    manual_study: Object.freeze({ label: "직접 학습" }),
    study_material: Object.freeze({ label: "학습 자료" })
  });

  const KNOWLEDGE_SOURCE_KIND_INFO = Object.freeze({
    article: Object.freeze({ label: "기사" }),
    column: Object.freeze({ label: "칼럼" }),
    youtube: Object.freeze({ label: "유튜브" }),
    course: Object.freeze({ label: "강의" }),
    paper: Object.freeze({ label: "논문" }),
    official_document: Object.freeze({ label: "공식 문서" })
  });

  const SUMMARY_ORIGIN_INFO = Object.freeze({
    manual: Object.freeze({ label: "직접 작성" }),
    ai: Object.freeze({ label: "AI 요약" })
  });

  const AUCTION_OUTCOME_INFO = Object.freeze({
    won: Object.freeze({ label: "낙찰", icon: "🏆", color: C.success }),
    lost: Object.freeze({ label: "패찰", icon: "✕", color: C.error }),
    skipped: Object.freeze({ label: "입찰 포기", icon: "✕", color: C.neutral600 })
  });

  const READING_FORMAT_INFO = Object.freeze({
    book: Object.freeze({ label: "종이책", icon: "📖", color: C.success }),
    ebook: Object.freeze({ label: "전자책", icon: "💻", color: C.info }),
    paper: Object.freeze({ label: "논문", icon: "📄", color: C.warning }),
    document: Object.freeze({ label: "문서", icon: "📃", color: C.neutral700 }),
    audiobook: Object.freeze({ label: "오디오북", icon: "🎧", color: C.accent }),
    "미분류": Object.freeze({ label: "미분류", icon: "?", color: C.neutral500 })
  });

  const fallbackInfo = (label) => Object.freeze({ label, icon: "", color: C.neutral600 });
  const statusInfo = (value) => STATUS_INFO[value] || fallbackInfo(value ? "미등록 상태" : "미지정");
  const typeInfo = (value) => TYPE_INFO[value] || fallbackInfo(value ? "미등록 유형" : "미지정");
  const lifecycleInfo = (value) => LIFECYCLE_INFO[value] || fallbackInfo(value ? "미등록 라이프사이클" : "미지정");
  const knowledgeDomainInfo = (value) => KNOWLEDGE_DOMAIN_INFO[value] || fallbackInfo("미분류");
  const knowledgeTopicInfo = (value) => KNOWLEDGE_TOPIC_INFO[value] || fallbackInfo("미분류");
  const knowledgeSourceTypeInfo = (value) => KNOWLEDGE_SOURCE_TYPE_INFO[value] || fallbackInfo("미등록 출처 유형");
  const knowledgeSourceKindInfo = (value) => KNOWLEDGE_SOURCE_KIND_INFO[value] || fallbackInfo("미등록 자료 유형");
  const summaryOriginInfo = (value) => SUMMARY_ORIGIN_INFO[value] || fallbackInfo("미등록 요약 출처");
  const auctionOutcomeInfo = (value) => AUCTION_OUTCOME_INFO[value] || fallbackInfo(value ? "미등록 경매 결과" : "미지정");
  const readingFormatInfo = (value) => READING_FORMAT_INFO[value] || fallbackInfo(value ? "미등록 독서 형식" : "미지정");

  const parsePrice = (val) => {
    if (val === undefined || val === null) return NaN;
    if (typeof val === "number") return val;
    
    let str = String(val).replace(/,/g, "").trim();
    if (!str) return NaN;
    
    if (/^\d+(\.\d+)?$/.test(str)) {
      return Number(str);
    }
    
    let total = 0;
    let hasEok = false;
    let hasMan = false;
    
    const eokMatch = str.match(/^([\d.]+)\s*억/);
    if (eokMatch) {
      total += parseFloat(eokMatch[1]) * 100000000;
      hasEok = true;
      str = str.substring(eokMatch[0].length).trim();
    } else {
      const eokIdx = str.indexOf("억");
      if (eokIdx !== -1) {
        const eokPart = str.substring(0, eokIdx).trim();
        if (eokPart) total += parseFloat(eokPart) * 100000000;
        hasEok = true;
        str = str.substring(eokIdx + 1).trim();
      }
    }
    
    if (str) {
      const manMatch = str.match(/^([\d.]+)\s*만?/);
      if (manMatch) {
        total += parseFloat(manMatch[1]) * 10000;
        hasMan = true;
      } else if (/^\d+(\.\d+)?$/.test(str)) {
        total += parseFloat(str) * 10000;
        hasMan = true;
      }
    }
    
    if (hasEok || hasMan) return total;
    
    const parsed = Number(str);
    return isNaN(parsed) ? NaN : parsed;
  };

  window.parsePrice = parsePrice;

  window.prodigyDisplay = Object.freeze({
    property: (key) => PROPERTY_LABELS[key] || "미등록 항목",
    status: (value) => statusInfo(value).label,
    statusInfo,
    priority: (value) => PRIORITY_LABELS[value] || (value ? "미등록 우선순위" : "미지정"),
    type: (value) => typeInfo(value).label,
    typeInfo,
    lifecycle: (value) => lifecycleInfo(value).label,
    lifecycleInfo,
    knowledgeDomain: (value) => knowledgeDomainInfo(value).label,
    knowledgeDomainInfo,
    knowledgeTopic: (value) => knowledgeTopicInfo(value).label,
    knowledgeTopicInfo,
    knowledgeSourceType: (value) => knowledgeSourceTypeInfo(value).label,
    knowledgeSourceTypeInfo,
    knowledgeSourceKind: (value) => knowledgeSourceKindInfo(value).label,
    knowledgeSourceKindInfo,
    summaryOrigin: (value) => summaryOriginInfo(value).label,
    summaryOriginInfo,
    auctionOutcome: (value) => auctionOutcomeInfo(value).label,
    auctionOutcomeInfo,
    readingFormat: (value) => readingFormatInfo(value).label,
    readingFormatInfo
  });
})();
