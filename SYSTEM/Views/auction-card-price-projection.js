(function (root) {
  "use strict";

  function hasValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== "" && value !== "정보 없음";
  }

  function price(key, label, value) {
    return Object.freeze({ key: key, label: label, value: hasValue(value) ? value : null });
  }

  function project(page, options) {
    var record = page || {};
    var opts = options || {};
    var status = String(record.status || "watching").trim();
    if (status === "won" || status === "lost") {
      return Object.freeze({ left: price("my_bid_price", "내 입찰가", record.my_bid_price), right: price("winning_bid_price", "낙찰가", record.winning_bid_price) });
    }
    if (status === "skipped" || status === "archived") {
      return Object.freeze({ left: price("expected_bid", "입찰 예정가", record.expected_bid), right: price("winning_bid_price", "낙찰가", record.winning_bid_price) });
    }
    if (status === "reviewing") {
      var left = hasValue(record.my_bid_price)
        ? price("my_bid_price", "내 입찰가", record.my_bid_price)
        : price("expected_bid", "입찰 예정가", record.expected_bid);
      return Object.freeze({ left: left, right: price("winning_bid_price", "낙찰가", record.winning_bid_price) });
    }
    if (Boolean(opts.isEnded) || hasValue(record.winning_bid_price)) {
      // 종료된 관심/입찰 카드: 예상(입찰 예정가)과 실측(낙찰가)을 나란히 보여준다.
      // 예상가가 없었던 카드는 최저가를 유지해 정보 손실을 막는다 (reviewing 분기와 같은 폴백).
      var endedLeft = hasValue(record.expected_bid)
        ? price("expected_bid", "입찰 예정가", record.expected_bid)
        : price("minimum_bid", "최저가", record.minimum_bid);
      return Object.freeze({ left: endedLeft, right: price("winning_bid_price", "낙찰가", record.winning_bid_price) });
    }
    return Object.freeze({ left: price("minimum_bid", "최저가", record.minimum_bid), right: price("expected_bid", "입찰 예정가", record.expected_bid) });
  }

  var api = Object.freeze({ hasValue: hasValue, project: project });
  root.AuctionCardPriceProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
