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
  function project(properties, snapshot) {
    const sido = text(properties.region_sido), sigungu = text(properties.region_sigungu), dong = legalDong(properties), type = text(properties.property_type);
    const groupKey = [sido, sigungu, dong, type].join("|");
    const group = snapshot && snapshot.groups ? snapshot.groups[groupKey] : null;
    if (!group) return Object.freeze({ available: false, reason: "표본 없음", group_key: groupKey });
    const price = number(properties.expected_bid) || number(properties.my_bid_price) || number(properties.minimum_bid);
    const area = number(properties.exclusive_area);
    let comparison = null;
    if (price > 0 && area > 0 && group.key_value_won_per_pyeong > 0) {
      const unit = Math.round(price / (area / SQM_PER_PYEONG));
      const ratio = Number((unit / group.key_value_won_per_pyeong).toFixed(4));
      comparison = Object.freeze({ price_basis: number(properties.expected_bid) ? "예정 입찰가" : number(properties.my_bid_price) ? "실제 입찰가" : "최저가", won_per_pyeong: unit, ratio, position: ratio < 0.9 ? "키값 하단" : ratio <= 1.1 ? "키값 근접" : "키값 상단" });
    }
    return Object.freeze({ available: true, group_key: groupKey, legal_dong: dong, property_type: type, ...group, comparison });
  }

  const api = Object.freeze({ legalDong, project });
  root.AuctionKeyValueProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
