(function (root) {
  "use strict";

  const PROFILE_PATH = "PARA/RESOURCES/Auction Regions/auction-dong-profiles.json";

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim().replace(/제(?=\d+동$)/u, "");
  }

  function validateIndex(value) {
    if (!value || value.schema_version !== 1 || !Array.isArray(value.profiles)) throw new Error("행정동 프로파일 형식이 올바르지 않습니다.");
    if (value.profile_count !== value.profiles.length) throw new Error("행정동 프로파일 개수가 일치하지 않습니다.");
    return value;
  }

  function compactDistrict(value) { return clean(value).replace(/\s+/gu, ""); }
  function districtMatches(profileDistrict, cardDistrict) {
    const profile = compactDistrict(profileDistrict), card = compactDistrict(cardDistrict);
    return profile === card || profile.startsWith(card) || card.startsWith(profile.replace(/(시|군|구).*$/u, "$1"));
  }
  function cardDong(value) { return clean(value).split(/\s+/u).at(-1) || ""; }

  function districtAliases(sido, cardDistrict) {
    const card = compactDistrict(cardDistrict);
    if (clean(sido) !== "인천광역시") return [card];
    if (card === "서구") return ["검단구", "서해구"];
    if (card === "중구") return ["영종구", "제물포구"];
    if (card === "동구") return ["제물포구"];
    return [card];
  }

  function profileCandidates(index, auction) {
    const data = validateIndex(index);
    const sido = clean(auction && auction.region_sido);
    const sigungu = compactDistrict(auction && auction.region_sigungu);
    const adminDong = cardDong(auction && auction.region_admin_dong);
    const legalDong = cardDong(auction && auction.region_dong);
    const districts = districtAliases(sido, sigungu);
    const district = data.profiles.filter((profile) => (!sido || clean(profile.region_sido) === sido) && districts.some((candidate) => districtMatches(profile.region_sigungu, candidate)));
    if (adminDong) {
      const exact = district.find((profile) => clean(profile.admin_dong) === adminDong);
      return Object.freeze({ status: exact ? "exact" : "missing", selected: exact || null, candidates: Object.freeze(exact ? [exact] : []) });
    }
    const candidates = district.filter((profile) => {
      if (Array.isArray(profile.legal_dong_aliases) && profile.legal_dong_aliases.map(clean).includes(legalDong)) return true;
      const admin = clean(profile.admin_dong);
      const legalStem = legalDong.replace(/동$/u, "");
      const adminStem = admin.replace(/(?:본)?(?:\d+)?동$/u, "");
      return Boolean(legalStem) && adminStem === legalStem;
    });
    return Object.freeze({
      status: candidates.length === 1 ? "exact" : candidates.length > 1 ? "ambiguous" : "missing",
      selected: candidates.length === 1 ? candidates[0] : null,
      candidates: Object.freeze(candidates)
    });
  }

  function sentence(value) {
    return clean(value).replace(/\s+/gu, " ");
  }

  function itemText(value) {
    return sentence(value && typeof value === "object" ? value.text : value);
  }

  function legalDongSummary(result, legalDong) {
    if (!result || result.status !== "ambiguous" || !Array.isArray(result.candidates) || !result.candidates.length) return null;
    const candidates = result.candidates;
    const candidateSummaries = candidates.map((profile) => {
      const stable = profile.stable_profile || {};
      return Object.freeze({
        admin_dong: clean(profile.admin_dong),
        role: itemText(stable.evergreen_summary && stable.evergreen_summary.identity) || itemText(stable.district_role),
        housing: itemText(stable.housing_structure),
        micro_zones: Object.freeze((stable.micro_zones || []).map((zone) => sentence(zone && zone.name)).filter(Boolean))
      });
    });
    const commonFieldChecks = candidates
      .map((profile) => new Set((profile.stable_profile && profile.stable_profile.field_checks || []).map(sentence).filter(Boolean)))
      .reduce((shared, checks) => shared.filter((value) => checks.has(value)), [...(candidates[0].stable_profile && candidates[0].stable_profile.field_checks || []).map(sentence).filter(Boolean)]);
    return Object.freeze({
      legal_dong: clean(legalDong),
      admin_dongs: Object.freeze(candidateSummaries.map((item) => item.admin_dong)),
      candidate_summaries: Object.freeze(candidateSummaries),
      common_field_checks: Object.freeze(commonFieldChecks),
      limitation: "정확한 행정동이 없으므로 후보별 차이를 해당 물건의 사실로 단정하지 않는다."
    });
  }

  function decisionLens(profile) {
    const deep = profile && profile.deep_profile;
    if (!deep) return null;
    if (deep.auction_decision_lens) return deep.auction_decision_lens;
    const dong = clean(profile.admin_dong) || "해당 동";
    const zone = clean(profile.zone) || `${clean(profile.region_sigungu)} 생활권`;
    const role = itemText(deep.district_role);
    const demand = itemText(deep.demand_generators);
    const change = itemText(deep.change_drivers);
    const implications = Array.isArray(deep.auction_implications) ? deep.auction_implications.map(sentence).filter(Boolean) : [];
    const unknowns = Array.isArray(deep.unknowns) ? deep.unknowns.map(sentence).filter(Boolean) : [];
    const demandBase = demand && !/추가 공식 자료|확인이 필요/u.test(demand)
      ? demand
      : role && !/추가 공식 자료|확인이 필요/u.test(role)
        ? role
        : `${zone}의 기존 거주·생활 수요. 실제 임차·매수 수요는 물건 유형과 주소별 확인이 필요하다.`;
    const changeKnown = change && !/^주거 환경.*확인 필요/u.test(change);
    return Object.freeze({
      position_summary: `${dong}은(는) ${zone}에 속한다. ${role || "구·군 안의 상대적 역할과 미시 입지는 주소별 확인이 필요하다."}`,
      demand_base: demandBase,
      works_for: Object.freeze([
        `${demandBase}와 맞고 역·상권까지 실제 보행 접근이 확인되는 물건`,
        "차량 진입·주차·도로 폭이 동급 매물보다 불리하지 않고 매수·임차 대상이 명확한 물건"
      ]),
      be_conservative_when: Object.freeze([
        "역·상권이 같은 권역에 있다는 이유만 있고 실제 거리·고저차·보행 단절을 확인하지 못한 경우",
        changeKnown ? `${change} — 개별 주소의 구역 포함 여부와 현재 단계를 확인하지 못한 경우` : "정비·개발 기대를 가격에 반영했지만 구역 경계와 진행 단계를 확인하지 못한 경우",
        "동별 주택 재고·공실·실거래 표본이 부족한 상태에서 권역 평균만으로 환금성을 추정하는 경우"
      ]),
      reject_signals: Object.freeze([
        "현장 확인 결과 차량 진입·주차·소방 접근이 곤란하고 이를 상쇄할 가격 할인도 없는 경우",
        "소음·냄새·침수 흔적·급경사·보행 단절 중 중대한 문제가 확인됐으나 대체 수요가 불명확한 경우",
        "법정동·행정동 또는 정비사업 구역을 잘못 연결해 기대수익의 전제가 무너지는 경우"
      ]),
      field_questions: Object.freeze([
        `${dong} 안에서 이 주소는 역·상권·학교·간선도로와 실제로 어떻게 연결되는가?`,
        "출근·점심·저녁·주말의 유동과 소음은 각각 누구에게서 발생하는가?",
        "차량·소방차·이삿짐 차량이 현관 가까이 접근하고 합법적으로 주차할 수 있는가?",
        "인근 신축·정비 완료 물건과 비교해 가격·주차·엘리베이터·관리상태 경쟁력이 있는가?",
        ...(unknowns.slice(0, 2).map((value) => `${value}은(는) 현장에서 어떻게 확인되는가?`))
      ]),
      liquidity_note: `${zone}의 기존 실거주·생활 수요가 1차 출구다. 물건 유형별 매수·임차 후보와 최근 거래가 확인되지 않으면 환금성을 낮게 잡는다.`,
      confidence: "low",
      basis: Object.freeze(["deep_profile", "official_sources", "generated_conservative_lens"]),
      generated: true,
      limitations: Object.freeze([...implications, ...unknowns])
    });
  }

  function coverageSummary(index) {
    const profiles = validateIndex(index).profiles;
    const manual = profiles.filter((profile) => {
      const lens = profile.deep_profile && profile.deep_profile.auction_decision_lens;
      return Boolean(lens && !lens.generated);
    }).length;
    return Object.freeze({ total: profiles.length, manual, generated: profiles.length - manual });
  }

  const STABLE_AXES = Object.freeze([
    "city_role", "district_role", "urban_form", "transport_structure",
    "daily_life_structure", "housing_structure", "demand_anchors", "structural_risks"
  ]);
  const VOLATILE_PATTERN = /(?:20\d{2}년|착공|준공 예정|조합설립|사업시행|관리처분|입주 예정|시장강도|거래량|매매가|전세가|월세|공실률)/u;

  function validateStableProfile(profile) {
    if (!profile || typeof profile !== "object") throw new Error("고정정보 프로파일이 없습니다.");
    if (!['complete', 'partial', 'unresearched', 'needs_review'].includes(profile.status)) throw new Error("고정정보 상태가 올바르지 않습니다.");
    if (profile.status === "complete") {
      for (const axis of STABLE_AXES) {
        const item = profile[axis];
        if (!item || !sentence(item.text) || !Array.isArray(item.sources) || !item.sources.length) throw new Error(`고정정보 필수축 누락: ${axis}`);
        if (VOLATILE_PATTERN.test(sentence(item.text))) throw new Error(`고정정보에 시점정보가 포함됨: ${axis}`);
      }
      if (!Array.isArray(profile.micro_zones) || profile.micro_zones.length < 2) throw new Error("고정정보 완료에는 미시권역 2개 이상이 필요합니다.");
      if (!profile.property_type_notes || !Object.values(profile.property_type_notes).filter(Boolean).length) throw new Error("고정정보 완료에는 물건유형별 메모가 필요합니다.");
      const sources = Array.isArray(profile.sources) ? profile.sources : [];
      const reliable = sources.filter((source) => ["A", "B"].includes(source.grade) && /^https?:\/\//u.test(source.url || ""));
      if (new Set(reliable.map((source) => source.url)).size < 2) throw new Error("고정정보 완료에는 독립적인 A/B 출처 2개 이상이 필요합니다.");
      if (!profile.researched_at || !profile.review_due) throw new Error("고정정보 조사일과 검토기한이 필요합니다.");
    }
    return profile;
  }

  function stableCoverageSummary(index) {
    const profiles = validateIndex(index).profiles;
    const counts = { total: profiles.length, complete: 0, partial: 0, unresearched: 0, needsReview: 0 };
    for (const profile of profiles) {
      const stable = profile.stable_profile;
      const status = stable && stable.status;
      if (status === "complete") counts.complete += 1;
      else if (status === "partial") counts.partial += 1;
      else if (status === "needs_review") counts.needsReview += 1;
      else counts.unresearched += 1;
    }
    return Object.freeze(counts);
  }

  async function readIndex(app) {
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const file = app.vault.getAbstractFileByPath(PROFILE_PATH);
    if (!file) throw new Error("행정동 프로파일을 찾을 수 없습니다.");
    return validateIndex(JSON.parse(await app.vault.read(file)));
  }

  const api = Object.freeze({ PROFILE_PATH, STABLE_AXES, validateIndex, validateStableProfile, stableCoverageSummary, profileCandidates, legalDongSummary, decisionLens, coverageSummary, readIndex });
  root.AuctionDongProfileCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
