(function (root) {
  "use strict";

  const SQM_PER_PYEONG = 3.305785;
  function text(value) { return String(value ?? "").trim(); }
  function knownText(value) {
    const result = text(value);
    return result && result !== "정보 없음" ? result : "";
  }
  function number(value) { const match = text(value).replaceAll(",", "").match(/\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; }
  function canonicalPropertyType(value) {
    const type = knownText(value);
    if (type === "다가구(원룸등)") return "다가구";
    if (type === "아파트형공장") return "지식산업센터";
    if (type === "오피스텔(상업)") return "오피스텔";
    if (type === "단독주택") return "주택";
    if (type === "숙박시설(생활숙박시설)") return "숙박시설";
    return type;
  }
  function canonicalSido(value) {
    const sido = knownText(value);
    return {
      서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시",
      인천: "인천광역시", 광주: "광주광역시", 대전: "대전광역시",
      울산: "울산광역시", 세종: "세종특별자치시",
      경기: "경기도", 강원: "강원특별자치도", 강원도: "강원특별자치도",
      충북: "충청북도", 충남: "충청남도",
      전북: "전북특별자치도", 전라북도: "전북특별자치도",
      전남: "전라남도", 경북: "경상북도", 경남: "경상남도",
      제주: "제주특별자치도"
    }[sido] || sido;
  }
  function addressRegion(address) {
    const parts = knownText(address).split(/\s+/);
    const nestedDistrict = /시$/.test(parts[1] || "") && /구$/.test(parts[2] || "");
    return {
      sido: canonicalSido(parts[0]),
      sigungu: nestedDistrict ? `${parts[1]} ${parts[2]}` : parts[1] || ""
    };
  }
  function legalDong(properties) {
    const explicit = knownText(properties.region_dong);
    const explicitMatch = explicit.match(/(?:^|\s)([^\s,]+(?:동\d*가|동|읍|면))(?:\s|$)/);
    if (explicitMatch) return explicitMatch[1];
    const match = knownText(properties.address).match(/\s([^\s,]+(?:동\d*가|동|읍|면))\s/);
    return match ? match[1] : null;
  }
  function projectScope(group, label, area) {
    if (!group) return null;
    const total = area > 0 && group.key_value_won_per_pyeong > 0
      ? Math.round(group.key_value_won_per_pyeong * area / SQM_PER_PYEONG)
      : null;
    return Object.freeze({ label, ...group, key_value_total_won: total });
  }
  function project(properties, snapshot, options) {
    const parsedRegion = addressRegion(properties.address);
    const sido = canonicalSido(properties.region_sido) || parsedRegion.sido;
    const explicitSigungu = knownText(properties.region_sigungu);
    const sigungu = parsedRegion.sigungu.includes(" ") && !explicitSigungu.includes(" ")
      ? parsedRegion.sigungu
      : explicitSigungu || parsedRegion.sigungu;
    const dong = legalDong(properties), type = canonicalPropertyType(properties.property_type);
    const groupKey = [sido, sigungu, dong, type].join("|");
    const group = snapshot && snapshot.groups ? snapshot.groups[groupKey] : null;
    const districtKey = [sido, sigungu, type].join("|");
    const districtGroup = snapshot && snapshot.districts ? snapshot.districts[districtKey] : null;
    if (!group && !districtGroup) return Object.freeze({ available: false, reason: "표본 없음", group_key: groupKey, district_key: districtKey });
    const parsePrice = options && typeof options.parsePrice === "function" ? options.parsePrice : number;
    const status = text(properties.status);
    const candidates = status === "won" || status === "lost"
      ? [["winning_bid_price", "낙찰가"], ["my_bid_price", "실제 입찰가"], ["expected_bid", "예정 입찰가"], ["minimum_bid", "최저가"]]
      : [["my_bid_price", "실제 입찰가"], ["expected_bid", "예정 입찰가"], ["minimum_bid", "최저가"]];
    const selected = candidates.map(([key, label]) => ({ key, label, price: parsePrice(properties[key]) })).find((candidate) => Number.isFinite(candidate.price) && candidate.price > 0) || null;
    const area = number(properties.exclusive_area);
    const areaPyeong = area > 0 ? Number((area / SQM_PER_PYEONG).toFixed(1)) : null;
    const dongProjection = projectScope(group, dong, area);
    const districtProjection = projectScope(districtGroup, sigungu, area);
    const primaryScope = group && (group.confidence === "usable" || !districtGroup) ? "dong" : "district";
    const primary = primaryScope === "dong" ? dongProjection : districtProjection;
    const difference = group && districtGroup && districtGroup.key_value_won_per_pyeong > 0
      ? Number((group.key_value_won_per_pyeong / districtGroup.key_value_won_per_pyeong - 1).toFixed(4))
      : null;
    let comparison = null;
    if (selected && area > 0 && primary && primary.key_value_won_per_pyeong > 0) {
      const unit = Math.round(selected.price / (area / SQM_PER_PYEONG));
      const ratio = Number((unit / primary.key_value_won_per_pyeong).toFixed(4));
      comparison = Object.freeze({ price_key: selected.key, price_basis: selected.label, price_won: selected.price, won_per_pyeong: unit, ratio, position: ratio < 0.9 ? "키값 하단" : ratio <= 1.1 ? "키값 근접" : "키값 상단" });
    }
    return Object.freeze({
      available: true,
      group_key: groupKey,
      district_key: districtKey,
      legal_dong: dong,
      property_type: type,
      ...primary,
      area_sqm: area > 0 ? area : null,
      area_pyeong: areaPyeong,
      primary_scope: primaryScope,
      district_difference_ratio: difference,
      dong: dongProjection,
      district: districtProjection,
      comparison
    });
  }

  const api = Object.freeze({ addressRegion, canonicalPropertyType, canonicalSido, legalDong, project });
  root.AuctionKeyValueProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
