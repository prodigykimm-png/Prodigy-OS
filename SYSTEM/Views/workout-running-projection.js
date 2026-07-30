(function (root) {
  "use strict";

  const running = root.WorkoutRunningCore || (typeof require === "function" ? require("./workout-running-core.js") : null);
  const workout = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);
  const ACTIVITY_SCHEMA = "prodigy-run-activity-v1";
  const SOURCE_PRIORITY = { fit: 60, tcx: 50, gpx: 40, manual: 30, apple_health: 20, workout_session: 10, legacy_quick_session: 10 };
  const FILLABLE_FIELDS = [
    "timezone_offset", "moving_s", "elevation_gain_m", "avg_hr", "max_hr", "cadence",
    "calories_kcal", "rpe", "notes", "import_id", "splits",
  ];

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function finitePositive(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
  function parseDistance(value) {
    const match = clean(value).match(/([\d.]+)\s*km/i);
    return match && Number.isFinite(Number(match[1])) ? Math.round(Number(match[1]) * 1000) : null;
  }
  function parseDuration(value) {
    const parts = clean(value).split(":").map(Number);
    if (!parts.every(Number.isFinite)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }
  function pace(distanceM, elapsedS) {
    return distanceM && elapsedS ? Math.round((elapsedS / (distanceM / 1000)) * 10) / 10 : null;
  }

  function canonicalRunKey(activity) {
    const epochMs = new Date(clean(activity && activity.start_time)).getTime();
    if (!Number.isFinite(epochMs)) return "";
    const start = Math.round(epochMs / 1000).toString(36);
    const elapsed = finitePositive(activity && activity.elapsed_s);
    const distance = finitePositive(activity && activity.distance_m);
    return `run_${start}_e${elapsed === null ? "x" : Math.round(elapsed)}_d${distance === null ? "x" : Math.round(distance)}`;
  }

  function projectSessionActivities(sessions) {
    if (!workout || typeof workout.normalizeSessionKind !== "function") throw new Error("WorkoutCore.normalizeSessionKind is unavailable.");
    const rows = [];
    for (const session of sessions || []) {
      if (!session || clean(session.status) !== "completed") continue;
      const kind = workout.normalizeSessionKind(session);
      const payload = session.running_activity && typeof session.running_activity === "object" ? session.running_activity : null;
      if (kind !== "quick" && !payload) continue;
      const distanceM = payload ? finitePositive(payload.distance_m) : parseDistance(session.distance);
      const elapsedS = payload ? finitePositive(payload.elapsed_s) : parseDuration(session.duration);
      if (distanceM === null && elapsedS === null) continue;
      const sessionId = clean(session.session_id);
      const startTime = clean((payload && payload.start_time) || session.completed_at || session.started_at || `${clean(session.date)}T00:00:00`);
      if (!sessionId || !canonicalRunKey({ start_time: startTime, distance_m: distanceM, elapsed_s: elapsedS })) continue;
      const source = kind === "quick" ? "legacy_quick_session" : "workout_session";
      const stableTime = clean(session.completed_at || session.started_at || startTime);
      const activity = {
        schema_version: ACTIVITY_SCHEMA,
        activity_id: `legacy_${sessionId}`,
        start_time: startTime,
        timezone_offset: clean(payload && payload.timezone_offset),
        distance_m: distanceM,
        elapsed_s: elapsedS,
        moving_s: finitePositive(payload && payload.moving_s),
        pace_s_per_km: pace(distanceM, finitePositive(payload && payload.moving_s) || elapsedS),
        elevation_gain_m: finitePositive(payload && payload.elevation_gain_m),
        avg_hr: finitePositive(payload && payload.avg_hr),
        max_hr: finitePositive(payload && payload.max_hr),
        cadence: finitePositive(payload && payload.cadence),
        calories_kcal: finitePositive(payload && payload.calories_kcal),
        rpe: finitePositive((payload && payload.rpe) || session.rpe),
        notes: clean((payload && payload.notes) || session.notes),
        source,
        source_key: sessionId,
        import_id: null,
        data_quality: clean(payload && payload.data_quality) || "summary_only",
        splits: Array.isArray(payload && payload.splits)
          ? payload.splits.map((split, index) => running.normalizeSplit(split, `legacy_${sessionId}`, index)).filter(Boolean)
          : [],
        created_at: stableTime,
        updated_at: stableTime,
        _read_only: true,
        _legacy_title: clean(session.title) || "빠른 운동",
      };
      activity.canonical_key = canonicalRunKey(activity);
      rows.push(running.stripCoordinates(activity));
    }
    return rows;
  }

  function isMissing(value) { return value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length); }
  function sourceRef(activity, key) {
    const source = clean(activity.source) || "manual";
    const sourceKey = source === "apple_health" ? key : (clean(activity.source_key) || key);
    return { source, source_key: sourceKey };
  }
  function candidateOrder(left, right) {
    const priority = (SOURCE_PRIORITY[right.source] || 0) - (SOURCE_PRIORITY[left.source] || 0);
    if (priority) return priority;
    const quality = Number(right.data_quality === "full") - Number(left.data_quality === "full");
    if (quality) return quality;
    return `${clean(left.source)}:${clean(left.source_key)}:${clean(left.activity_id)}`
      .localeCompare(`${clean(right.source)}:${clean(right.source_key)}:${clean(right.activity_id)}`);
  }

  function mergeCanonicalGroup(group) {
    const ordered = [...group].sort(candidateOrder);
    const key = canonicalRunKey(ordered[0]);
    const merged = { ...ordered[0], canonical_key: key };
    for (const field of FILLABLE_FIELDS) {
      if (!isMissing(merged[field])) continue;
      const donor = ordered.find((candidate) => !isMissing(candidate[field]));
      if (donor) merged[field] = Array.isArray(donor[field]) ? donor[field].map((item) => ({ ...item })) : donor[field];
    }
    merged._read_only = ordered.every((candidate) => candidate._read_only === true);
    if (!merged._read_only) delete merged._read_only;
    const refs = new Map();
    for (const candidate of ordered) {
      for (const ref of candidate._source_refs || [sourceRef(candidate, key)]) refs.set(`${ref.source}\u0000${ref.source_key}`, ref);
    }
    merged._source_refs = [...refs.values()].sort((left, right) => `${left.source}:${left.source_key}`.localeCompare(`${right.source}:${right.source_key}`));
    return running.stripCoordinates(merged);
  }

  function buildRunningModel(activities, sessions) {
    const persisted = (activities || []).filter(Boolean).map((activity) => ({ ...activity, canonical_key: canonicalRunKey(activity) }));
    const derived = projectSessionActivities(sessions);
    const groups = new Map();
    for (const activity of [...persisted, ...derived]) {
      if (!activity.canonical_key) continue;
      if (!groups.has(activity.canonical_key)) groups.set(activity.canonical_key, []);
      groups.get(activity.canonical_key).push(activity);
    }
    const all = [...groups.values()].map(mergeCanonicalGroup)
      .sort((left, right) => clean(right.start_time).localeCompare(clean(left.start_time)) || clean(left.activity_id).localeCompare(clean(right.activity_id)));
    return { activities: persisted, legacy: derived, all };
  }

  function comparable(activity) {
    const copy = { ...activity };
    delete copy.created_at;
    delete copy.updated_at;
    return JSON.stringify(copy);
  }

  async function saveActivities(store, activities) {
    const existing = await store.list("runActivities");
    const byKey = new Map(existing.map((activity) => [canonicalRunKey(activity), activity]));
    const results = [];
    for (const input of activities || []) {
      const key = canonicalRunKey(input);
      if (!key) { results.push({ created: false, duplicate: false, skipped: true, id: "" }); continue; }
      const prior = byKey.get(key);
      const incoming = { ...input, activity_id: key, canonical_key: key, source_key: sourceRef(input, key).source_key };
      const merged = mergeCanonicalGroup(prior ? [prior, incoming] : [incoming]);
      merged.activity_id = key;
      merged.canonical_key = key;
      if (prior) {
        merged.created_at = clean(prior.created_at) || clean(merged.created_at);
        if (comparable(prior) === comparable(merged)) {
          results.push({ created: false, updated: false, duplicate: true, id: key });
          continue;
        }
      }
      await store.save("runActivities", key, merged);
      if (prior && clean(prior.activity_id) !== key) await store.remove("runActivities", prior.activity_id);
      byKey.set(key, merged);
      results.push({ created: !prior, updated: Boolean(prior), duplicate: Boolean(prior), id: key });
    }
    return results;
  }

  const api = { canonicalRunKey, projectSessionActivities, buildRunningModel, saveActivities };
  root.WorkoutRunningProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
