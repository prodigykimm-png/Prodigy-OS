(function (root) {
  "use strict";

  const FALLBACK_TIERS = Object.freeze({ compactMax: 640, mediumMax: 1068 });
  const TRANSITIONS = Object.freeze({
    watching: Object.freeze({ primary: "bidding", secondary: Object.freeze(["skipped"]) }),
    bidding: Object.freeze({ primary: null, secondary: Object.freeze(["won", "lost", "skipped"]) }),
    won: Object.freeze({ primary: "reviewing", secondary: Object.freeze([]) }),
    lost: Object.freeze({ primary: "reviewing", secondary: Object.freeze([]) }),
    reviewing: Object.freeze({ primary: "archived", secondary: Object.freeze([]) }),
    skipped: Object.freeze({ primary: "archived", secondary: Object.freeze([]) }),
    archived: Object.freeze({ primary: null, secondary: Object.freeze([]) })
  });

  function limits() {
    const tiers = root.ProdigyTokens && root.ProdigyTokens.CONTAINER_TIERS;
    return tiers
      ? { compactMax: tiers.compact.max, mediumMax: tiers.medium.max }
      : FALLBACK_TIERS;
  }

  function tierFor(logicalWidth) {
    if (!Number.isFinite(logicalWidth) || logicalWidth <= 0) throw new TypeError("Auction card logicalWidth must be positive");
    const tierLimits = limits();
    if (logicalWidth <= tierLimits.compactMax) return "compact";
    if (logicalWidth <= tierLimits.mediumMax) return "medium";
    return "wide";
  }

  function actionPlan(status) {
    const value = TRANSITIONS[status] || TRANSITIONS.archived;
    return {
      primary: value.primary,
      secondary: [...value.secondary]
    };
  }

  function presentation(logicalWidth, status) {
    const tier = tierFor(logicalWidth);
    return {
      tier,
      compact: tier === "compact",
      touch: tier !== "wide",
      action: actionPlan(status)
    };
  }

  const api = Object.freeze({ actionPlan, presentation, tierFor });
  root.AuctionCardViewModel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
