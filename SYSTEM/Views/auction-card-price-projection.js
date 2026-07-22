(function (root) {
  "use strict";

  function hasValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== "" && value !== "정보 없음";
  }

  function price(key, label, value) {
    return Object.freeze({ key: key, label: label, value: hasValue(value) ? value : null });
  }

  function project(page) {
    var record = page || {};
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
    return Object.freeze({ left: price("minimum_bid", "최저가", record.minimum_bid), right: price("expected_bid", "입찰 예정가", record.expected_bid) });
  }

  var api = Object.freeze({ hasValue: hasValue, project: project });
  root.AuctionCardPriceProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
