(function (root) {
  "use strict";

  const SQM_PER_PYEONG = 3.305785;
  function text(value) { return String(value ?? "").trim(); }
  function number(value) { const match = text(value).replaceAll(",", "").match(/\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; }
  function legalDong(properties) {
    const explicit = text(properties.region_dong);
    if (explicit) return explicit;
    const match = text(properties.address).match(/\s([^\s,]+(?:동\d*가|동|읍|면))\s/);
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
    const sido = text(properties.region_sido), sigungu = text(properties.region_sigungu), dong = legalDong(properties), type = text(properties.property_type);
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

  const api = Object.freeze({ legalDong, project });
  root.AuctionKeyValueProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
