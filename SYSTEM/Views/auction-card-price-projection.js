(function (root) {
  "use strict";

  function hasValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== "" && value !== "정보 없음";
  }

  function price(key, label, value) {
    return Object.freeze({ key: key, label: label, value: hasValue(value) ? value : null });
  }

  // 카드 가격 쌍이 이미 `parsePrice`로 렌더하는 값과 동일한 규칙을 쓴다.
  // 쉼표가 들어온 실제 카드(예: "121,000,000")가 조회 문자열로 처리되어
  // 가격은 보이는데 비교 줄만 조용히 사라지는 일이 없도록 한다.
  function positiveAmount(value) {
    if (!hasValue(value)) return null;
    var amount = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  // 기록된 사실만 비교한다. status/auction_outcome/auction_result_date는 읽지 않고
  // 낙찰·패찰을 추론하지 않으며, 유효한 숫자 쌍이 없으면 아예 비교를 만들지 않는다.
  function comparison(record) {
    var winning = positiveAmount(record.winning_bid_price);
    if (winning === null) return null;
    var basis = hasValue(record.my_bid_price)
      ? { key: "my_bid_price", label: "내 입찰가" }
      : { key: "expected_bid", label: "입찰 예정가" };
    var baseline = positiveAmount(record[basis.key]);
    if (baseline === null) return null;
    var difference = winning - baseline;
    return Object.freeze({
      basis_key: basis.key,
      basis_label: basis.label,
      winning_bid_price: winning,
      difference_won: difference,
      difference_percent: (difference / baseline) * 100
    });
  }

  function project(page, options) {
    var record = page || {};
    var opts = options || {};
    var status = String(record.status || "watching").trim();
    if (status === "won" || status === "lost") {
      return Object.freeze({ left: price("my_bid_price", "내 입찰가", record.my_bid_price), right: price("winning_bid_price", "낙찰가", record.winning_bid_price), comparison: comparison(record) });
    }
    if (status === "skipped" || status === "archived") {
      return Object.freeze({ left: price("expected_bid", "입찰 예정가", record.expected_bid), right: price("winning_bid_price", "낙찰가", record.winning_bid_price), comparison: comparison(record) });
    }
    if (status === "reviewing") {
      var left = hasValue(record.my_bid_price)
        ? price("my_bid_price", "내 입찰가", record.my_bid_price)
        : price("expected_bid", "입찰 예정가", record.expected_bid);
      return Object.freeze({ left: left, right: price("winning_bid_price", "낙찰가", record.winning_bid_price), comparison: comparison(record) });
    }
    if (Boolean(opts.isEnded) || hasValue(record.winning_bid_price)) {
      // 종료된 관심/입찰 카드: 예상(입찰 예정가)과 실측(낙찰가)을 나란히 보여준다.
      // 예상가가 없었던 카드는 최저가를 유지해 정보 손실을 막는다 (reviewing 분기와 같은 폴백).
      var endedLeft = hasValue(record.expected_bid)
        ? price("expected_bid", "입찰 예정가", record.expected_bid)
        : price("minimum_bid", "최저가", record.minimum_bid);
      return Object.freeze({ left: endedLeft, right: price("winning_bid_price", "낙찰가", record.winning_bid_price), comparison: comparison(record) });
    }
    return Object.freeze({ left: price("minimum_bid", "최저가", record.minimum_bid), right: price("expected_bid", "입찰 예정가", record.expected_bid), comparison: null });
  }

  var api = Object.freeze({ hasValue: hasValue, positiveAmount: positiveAmount, project: project });
  root.AuctionCardPriceProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
