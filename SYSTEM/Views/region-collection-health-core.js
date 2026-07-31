(function (root) {
  "use strict";

  const FRESH_DAYS = 90;
  const STALE_DAYS = 180;

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function uniqueSorted(values) {
    return Array.from(new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
  }

  function timestamp(value) {
    const parsed = Date.parse(clean(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function ageDays(metricsAsOf, now) {
    const start = timestamp(metricsAsOf);
    const end = now instanceof Date ? now.getTime() : timestamp(now);
    if (start === null || end === null) return null;
    return Math.max(0, Math.floor((end - start) / 86400000));
  }

  function freshnessFor(age) {
    if (age === null) return "unavailable";
    if (age <= FRESH_DAYS) return "fresh";
    if (age <= STALE_DAYS) return "aging";
    return "stale";
  }

  function compareSnapshots(left, right) {
    const metricOrder = clean(left.metrics_as_of).localeCompare(clean(right.metrics_as_of));
    if (metricOrder !== 0) return metricOrder;
    return clean(left.fetched_at).localeCompare(clean(right.fetched_at));
  }

  function analyzeCollectionHealth(input) {
    const options = input || {};
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const expected = uniqueSorted(options.expectedRegionKeys);
    const expectedSet = new Set(expected);
    const snapshots = (Array.isArray(options.snapshots) ? options.snapshots : []).flatMap((item) => {
      const regionKey = clean(item && item.region_key);
      const metricsAsOf = clean(item && item.metrics_as_of);
      if (!regionKey || !metricsAsOf) return [];
      return [{ region_key: regionKey, metrics_as_of: metricsAsOf, fetched_at: clean(item.fetched_at) }];
    });

    const byRegion = new Map();
    const monthRuns = new Map();
    snapshots.forEach((snapshot) => {
      if (!byRegion.has(snapshot.region_key)) byRegion.set(snapshot.region_key, []);
      byRegion.get(snapshot.region_key).push(snapshot);
      const month = snapshot.metrics_as_of.slice(0, 7);
      const groupKey = `${snapshot.region_key}\u0000${month}`;
      monthRuns.set(groupKey, (monthRuns.get(groupKey) || 0) + 1);
    });

    const covered = expected.filter((regionKey) => byRegion.has(regionKey));
    const missing = expected.filter((regionKey) => !byRegion.has(regionKey));
    const latest = covered.map((regionKey) => {
      const regionSnapshots = byRegion.get(regionKey).slice().sort(compareSnapshots);
      const item = regionSnapshots[regionSnapshots.length - 1];
      const age = ageDays(item.metrics_as_of, now);
      return {
        region_key: regionKey,
        latest_metrics_as_of: item.metrics_as_of,
        latest_fetched_at: item.fetched_at || null,
        freshness: freshnessFor(age),
        age_days: age,
        snapshot_count: regionSnapshots.length
      };
    });

    const duplicateMonths = Array.from(monthRuns.entries()).flatMap(([groupKey, runCount]) => {
      if (runCount < 2) return [];
      const [regionKey, metricsMonth] = groupKey.split("\u0000");
      return [{ region_key: regionKey, metrics_month: metricsMonth, run_count: runCount }];
    }).sort((a, b) => a.region_key.localeCompare(b.region_key, "ko") || a.metrics_month.localeCompare(b.metrics_month));

    const countFreshness = (level) => latest.filter((item) => item.freshness === level).length;
    const staleRegionKeys = latest.filter((item) => item.freshness === "stale").map((item) => item.region_key);
    const unknownRegionKeys = uniqueSorted(Array.from(byRegion.keys()).filter((regionKey) => !expectedSet.has(regionKey) && !regionKey.startsWith("_")));
    const selectedKey = clean(options.selectedRegionKey);
    const selected = latest.find((item) => item.region_key === selectedKey);
    const selectedRegion = selectedKey ? (selected ? {
      region_key: selected.region_key,
      covered: true,
      latest_metrics_as_of: selected.latest_metrics_as_of,
      latest_fetched_at: selected.latest_fetched_at,
      freshness: selected.freshness,
      age_days: selected.age_days,
      snapshot_count: selected.snapshot_count
    } : {
      region_key: selectedKey,
      covered: false,
      latest_metrics_as_of: null,
      latest_fetched_at: null,
      freshness: "unavailable",
      age_days: null,
      snapshot_count: 0
    }) : null;

    const expectedCount = expected.length;
    const coveragePercent = expectedCount > 0 ? Math.round((covered.length / expectedCount) * 1000) / 10 : 0;
    const needsAttention = missing.length > 0 || staleRegionKeys.length > 0 || duplicateMonths.length > 0 || unknownRegionKeys.length > 0;

    return Object.freeze({
      status: expectedCount === 0 ? "unavailable" : (needsAttention ? "attention" : "healthy"),
      expected_count: expectedCount,
      covered_count: covered.length,
      coverage_percent: coveragePercent,
      snapshot_count: snapshots.length,
      fresh_count: countFreshness("fresh"),
      aging_count: countFreshness("aging"),
      stale_count: countFreshness("stale"),
      unavailable_count: countFreshness("unavailable"),
      missing_region_keys: Object.freeze(missing),
      stale_region_keys: Object.freeze(staleRegionKeys),
      unknown_region_keys: Object.freeze(unknownRegionKeys),
      duplicate_months: Object.freeze(duplicateMonths),
      selected_region: selectedRegion ? Object.freeze(selectedRegion) : null
    });
  }

  const api = Object.freeze({ FRESH_DAYS, STALE_DAYS, analyzeCollectionHealth });
  root.RegionCollectionHealthCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

