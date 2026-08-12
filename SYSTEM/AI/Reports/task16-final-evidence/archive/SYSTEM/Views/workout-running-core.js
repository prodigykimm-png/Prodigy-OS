(function (root) {
  "use strict";

  const ACTIVITY_SCHEMA = "prodigy-run-activity-v1";
  const SPLIT_SCHEMA = "prodigy-run-split-v1";
  const IMPORT_SCHEMA = "prodigy-run-import-v1";

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function nonNegNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }
  function positiveNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100) / 100;
  }

  /**
   * Strip any coordinate/route data from an object recursively.
   * Removes latitude, longitude, lat, lon, lng, position, coordinates, route, track keys.
   */
  function stripCoordinates(obj) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(stripCoordinates);
    if (typeof obj !== "object") return obj;
    const BANNED = new Set(["latitude", "longitude", "lat", "lon", "lng", "position", "coordinates", "route", "track", "trackpoints", "positions"]);
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (BANNED.has(key.toLowerCase())) continue;
      result[key] = stripCoordinates(value);
    }
    return result;
  }

  /**
   * Normalize a run activity.
   * Required: activity_id, start_time (ISO), distance_m, elapsed_s
   * Optional: moving_s, elevation_gain_m, avg_hr, max_hr, cadence, calories_kcal, rpe, notes, splits
   */
  function normalizeActivity(input) {
    const activityId = clean(input.activity_id);
    if (!activityId) throw new Error("activity_id is required.");
    const startTime = clean(input.start_time);
    if (!startTime || Number.isNaN(new Date(startTime).getTime())) throw new Error("start_time must be a valid ISO datetime.");
    const distanceM = positiveNumber(input.distance_m);
    if (distanceM === null) throw new Error("distance_m must be a positive number.");
    const elapsedS = positiveNumber(input.elapsed_s);
    if (elapsedS === null) throw new Error("elapsed_s must be a positive number.");
    const movingS = positiveNumber(input.moving_s);
    const source = clean(input.source) || "manual";

    // Overall pace: prefer moving time, fallback to elapsed
    const paceBaseS = movingS || elapsedS;
    const paceSecPerKm = distanceM > 0 ? Math.round((paceBaseS / (distanceM / 1000)) * 10) / 10 : null;

    const activity = {
      schema_version: ACTIVITY_SCHEMA,
      activity_id: activityId,
      start_time: startTime,
      timezone_offset: clean(input.timezone_offset) || "",
      distance_m: distanceM,
      elapsed_s: elapsedS,
      moving_s: movingS,
      pace_s_per_km: paceSecPerKm,
      elevation_gain_m: nonNegNumber(input.elevation_gain_m),
      avg_hr: nonNegNumber(input.avg_hr),
      max_hr: nonNegNumber(input.max_hr),
      cadence: nonNegNumber(input.cadence),
      calories_kcal: nonNegNumber(input.calories_kcal),
      rpe: nonNegNumber(input.rpe),
      notes: clean(input.notes) || "",
      source,
      source_key: clean(input.source_key) || null,
      import_id: clean(input.import_id) || null,
      data_quality: clean(input.data_quality) || "full",
      splits: [],
      created_at: clean(input.created_at) || new Date().toISOString(),
      updated_at: clean(input.updated_at) || new Date().toISOString(),
    };

    // Normalize splits
    if (Array.isArray(input.splits)) {
      activity.splits = input.splits.map((s, i) => normalizeSplit(s, activityId, i)).filter(Boolean);
    }

    // Privacy: strip any coordinates that may have leaked in
    return stripCoordinates(activity);
  }

  function normalizeSplit(input, activityId, index) {
    if (!input) return null;
    const distanceM = positiveNumber(input.distance_m);
    const durationS = positiveNumber(input.duration_s);
    if (distanceM === null || durationS === null) return null;
    return {
      schema_version: SPLIT_SCHEMA,
      split_index: Number.isInteger(input.split_index) ? input.split_index : index,
      distance_m: distanceM,
      duration_s: durationS,
      pace_s_per_km: distanceM > 0 ? Math.round((durationS / (distanceM / 1000)) * 10) / 10 : null,
      elevation_gain_m: nonNegNumber(input.elevation_gain_m),
      avg_hr: nonNegNumber(input.avg_hr),
      cadence: nonNegNumber(input.cadence),
    };
  }

  /**
   * Format pace as "M:SS /km"
   */
  function formatPace(secPerKm) {
    if (secPerKm === null || secPerKm === undefined || !Number.isFinite(secPerKm)) return "—";
    const totalSec = Math.round(secPerKm);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")} /km`;
  }

  /**
   * Format duration seconds as "H:MM:SS" or "MM:SS"
   */
  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "—";
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /**
   * Format distance meters as "X.XX km"
   */
  function formatDistance(meters) {
    if (!Number.isFinite(meters) || meters <= 0) return "—";
    return `${(meters / 1000).toFixed(2)} km`;
  }

  // ─── Trend calculations ──────────────────────────────────────────────

  /**
   * Get ISO week key (YYYY-Www) for local date.
   */
  function weekKey(dateStr) {
    const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    // ISO week: Monday start
    const day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  /**
   * Weekly distance/time for last N weeks ending at the week containing endDate.
   * Returns array sorted ascending by week.
   */
  function weeklyTrends(activities, endDate, weeks) {
    const numWeeks = Math.max(1, Math.min(Number(weeks) || 6, 52));
    const end = new Date(`${endDate.slice(0, 10)}T00:00:00`);
    // Find the Monday of the end week
    const day = end.getDay() || 7;
    const monday = new Date(end);
    monday.setDate(monday.getDate() - (day - 1));

    const buckets = [];
    for (let i = numWeeks - 1; i >= 0; i--) {
      const weekStart = new Date(monday);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const key = weekKey(weekStart.toISOString().slice(0, 10));
      buckets.push({
        week: key,
        start: `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`,
        end: `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, "0")}-${String(weekEnd.getDate()).padStart(2, "0")}`,
        distance_m: 0,
        duration_s: 0,
        count: 0,
      });
    }

    for (const act of activities || []) {
      const actDate = clean(act.start_time).slice(0, 10);
      for (const bucket of buckets) {
        if (actDate >= bucket.start && actDate <= bucket.end) {
          bucket.distance_m += act.distance_m || 0;
          bucket.duration_s += act.elapsed_s || 0;
          bucket.count += 1;
          break;
        }
      }
    }

    return buckets.map((b) => ({
      ...b,
      distance_m: Math.round(b.distance_m * 10) / 10,
      duration_s: Math.round(b.duration_s),
    }));
  }

  /**
   * Distance-weighted average pace over last N weeks of activities.
   * Only includes activities with valid pace and distance.
   */
  function weightedAveragePace(activities, endDate, weeks) {
    const numWeeks = Math.max(1, Number(weeks) || 4);
    const end = new Date(`${endDate.slice(0, 10)}T00:00:00`);
    const cutoff = new Date(end);
    cutoff.setDate(cutoff.getDate() - numWeeks * 7);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
    const endStr = endDate.slice(0, 10);

    let totalDistance = 0;
    let weightedPaceSum = 0;

    for (const act of activities || []) {
      const actDate = clean(act.start_time).slice(0, 10);
      if (actDate < cutoffStr || actDate > endStr) continue;
      if (!act.pace_s_per_km || !act.distance_m || act.distance_m <= 0) continue;
      totalDistance += act.distance_m;
      weightedPaceSum += act.pace_s_per_km * act.distance_m;
    }

    if (totalDistance <= 0) return null;
    return Math.round((weightedPaceSum / totalDistance) * 10) / 10;
  }

  // ─── Legacy Quick Session projection ─────────────────────────────────

  /**
   * Project completed Quick Workout sessions with distance/duration
   * into read-only running rows. Does NOT mutate the source sessions.
   */
  function projectLegacyQuickSessions(sessions) {
    const projection = root.WorkoutRunningProjection
      || (typeof require === "function" ? require("./workout-running-projection.js") : null);
    if (!projection) throw new Error("WorkoutRunningProjection is unavailable.");
    return projection.projectSessionActivities(sessions);
  }

  /**
   * Build a run import receipt.
   */
  function buildRunImportReceipt(options = {}) {
    return {
      schema_version: IMPORT_SCHEMA,
      import_id: clean(options.import_id) || `runimport_${Date.now().toString(36)}`,
      source: clean(options.source) || "file",
      file_basename: clean(options.file_basename) || "",
      file_sha256: clean(options.file_sha256) || "",
      format: clean(options.format) || "",
      imported_at: clean(options.imported_at) || new Date().toISOString(),
      activity_count: Number(options.activity_count) || 0,
      created_count: Number(options.created_count) || 0,
      updated_count: Number(options.updated_count) || 0,
      warning_count: Number(options.warning_count) || 0,
    };
  }

  // ─── TCX Parser ──────────────────────────────────────────────────────

  /**
   * Parse TCX XML text into a run activity preview.
   * Minimal DOM-free parser using regex for Obsidian compatibility.
   */
  function parseTcx(text) {
    const warnings = [];
    const errors = [];
    const src = String(text || "");

    // Check it's TCX
    if (!src.includes("<TrainingCenterDatabase") && !src.includes("<Activity")) {
      errors.push("TCX 형식이 아닙니다.");
      return { activity: null, warnings, errors };
    }

    // Must be running
    const sportMatch = src.match(/Sport="([^"]*)"/);
    const sport = sportMatch ? sportMatch[1] : "";
    if (sport && !/run|running/i.test(sport)) {
      errors.push(`러닝 활동이 아닙니다 (Sport: ${sport}).`);
      return { activity: null, warnings, errors };
    }

    // Extract activity ID/time
    const idMatch = src.match(/<Id>([^<]+)<\/Id>/);
    const startTime = idMatch ? clean(idMatch[1]) : "";

    // Total time
    const totalTimeMatch = src.match(/<TotalTimeSeconds>([\d.]+)<\/TotalTimeSeconds>/);
    const elapsedS = totalTimeMatch ? Number(totalTimeMatch[1]) : null;

    // Distance
    const distMatch = src.match(/<DistanceMeters>([\d.]+)<\/DistanceMeters>/);
    const distanceM = distMatch ? Number(distMatch[1]) : null;

    if (!distanceM || !elapsedS) {
      errors.push("거리 또는 시간 정보를 찾을 수 없습니다.");
      return { activity: null, warnings, errors };
    }

    // Calories
    const calMatch = src.match(/<Calories>(\d+)<\/Calories>/);
    const calories = calMatch ? Number(calMatch[1]) : null;

    // HR
    const hrMatches = [...src.matchAll(/<AverageHeartRateBpm>\s*<Value>(\d+)<\/Value>/g)];
    const avgHr = hrMatches.length ? Number(hrMatches[0][1]) : null;
    const maxHrMatches = [...src.matchAll(/<MaximumHeartRateBpm>\s*<Value>(\d+)<\/Value>/g)];
    const maxHr = maxHrMatches.length ? Number(maxHrMatches[0][1]) : null;

    // Cadence
    const cadMatch = src.match(/<Cadence>(\d+)<\/Cadence>/);
    const cadence = cadMatch ? Number(cadMatch[1]) : null;

    // Laps → splits
    const splits = [];
    const lapRegex = /<Lap[^>]*>([\s\S]*?)<\/Lap>/g;
    let lapMatch;
    let lapIndex = 0;
    while ((lapMatch = lapRegex.exec(src)) !== null) {
      const lapBody = lapMatch[1];
      const lapTime = lapBody.match(/<TotalTimeSeconds>([\d.]+)<\/TotalTimeSeconds>/);
      const lapDist = lapBody.match(/<DistanceMeters>([\d.]+)<\/DistanceMeters>/);
      if (lapTime && lapDist) {
        splits.push({
          split_index: lapIndex,
          distance_m: Number(lapDist[1]),
          duration_s: Number(lapTime[1]),
        });
        lapIndex++;
      }
    }

    const activityId = `tcx_${clean(startTime || Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)}`;

    const activity = normalizeActivity({
      activity_id: activityId,
      start_time: startTime || new Date().toISOString(),
      distance_m: distanceM,
      elapsed_s: elapsedS,
      calories_kcal: calories,
      avg_hr: avgHr,
      max_hr: maxHr,
      cadence: cadence,
      source: "tcx",
      source_key: activityId,
      data_quality: "full",
      splits,
    });

    return { activity, warnings, errors: [] };
  }

  // ─── GPX Parser ──────────────────────────────────────────────────────

  function parseGpx(text) {
    const warnings = [];
    const errors = [];
    const src = String(text || "");

    if (!src.includes("<gpx") && !src.includes("<trk")) {
      errors.push("GPX 형식이 아닙니다.");
      return { activity: null, warnings, errors };
    }

    // Time
    const timeMatch = src.match(/<time>([^<]+)<\/time>/);
    const startTime = timeMatch ? clean(timeMatch[1]) : "";

    // Track points for distance calculation
    const trkptRegex = /<trkpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"[^>]*(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
    let ptMatch;
    const points = [];
    while ((ptMatch = trkptRegex.exec(src)) !== null) {
      const body = ptMatch[3] || "";
      const eleMatch = body.match(/<ele>([-\d.]+)<\/ele>/);
      const timePtMatch = body.match(/<time>([^<]+)<\/time>/);
      points.push({
        lat: Number(ptMatch[1]),
        lon: Number(ptMatch[2]),
        ele: eleMatch ? Number(eleMatch[1]) : null,
        time: timePtMatch ? timePtMatch[1] : null,
      });
    }

    if (points.length < 2) {
      errors.push("트랙 포인트가 부족하여 거리를 계산할 수 없습니다.");
      return { activity: null, warnings, errors };
    }

    // Haversine distance
    function haversine(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    let totalDist = 0;
    let totalEleGain = 0;
    for (let i = 1; i < points.length; i++) {
      totalDist += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
      if (points[i].ele !== null && points[i - 1].ele !== null) {
        const diff = points[i].ele - points[i - 1].ele;
        if (diff > 0) totalEleGain += diff;
      }
    }

    // Duration from first/last time
    let elapsedS = null;
    const firstTime = points[0].time;
    const lastTime = points[points.length - 1].time;
    if (firstTime && lastTime) {
      const ms = new Date(lastTime).getTime() - new Date(firstTime).getTime();
      if (ms > 0) elapsedS = Math.round(ms / 1000);
    }

    if (!elapsedS) {
      errors.push("시간 정보를 계산할 수 없습니다.");
      return { activity: null, warnings, errors };
    }

    // 1km splits from trackpoints
    const splits = [];
    let splitDist = 0;
    let splitStart = 0;
    let splitStartTime = firstTime ? new Date(firstTime).getTime() : null;
    for (let i = 1; i < points.length; i++) {
      const seg = haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
      splitDist += seg;
      if (splitDist >= 1000) {
        const ptTime = points[i].time ? new Date(points[i].time).getTime() : null;
        const dur = splitStartTime && ptTime ? Math.round((ptTime - splitStartTime) / 1000) : null;
        if (dur && dur > 0) {
          splits.push({ split_index: splits.length, distance_m: 1000, duration_s: dur });
        }
        splitDist = 0;
        splitStartTime = ptTime;
      }
    }

    const activityId = `gpx_${clean(startTime || Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)}`;

    const activity = normalizeActivity({
      activity_id: activityId,
      start_time: startTime || new Date().toISOString(),
      distance_m: Math.round(totalDist * 10) / 10,
      elapsed_s: elapsedS,
      elevation_gain_m: Math.round(totalEleGain * 10) / 10,
      source: "gpx",
      source_key: activityId,
      data_quality: "full",
      splits,
    });

    // Coordinates are already stripped by normalizeActivity → stripCoordinates
    return { activity, warnings, errors: [] };
  }

  // ─── Apple Health XML Parser (running only, chunk-safe) ──────────────

  /**
   * Parse Apple Health export.xml for HKWorkoutActivityTypeRunning records only.
   * Returns summary-only activities (no splits fabricated).
   * @param text - full or partial XML text
   * @param options - { chunk: boolean } for partial parsing
   */
  function parseAppleHealthXml(text, options = {}) {
    const warnings = [];
    const errors = [];
    const src = String(text || "");

    // Match HKWorkout elements with activityType="HKWorkoutActivityTypeRunning"
    const workoutRegex = /<HKWorkout\s[^>]*activityType="HKWorkoutActivityTypeRunning"[^>]*\/?>/g;
    const activities = [];
    let match;
    let count = 0;

    while ((match = workoutRegex.exec(src)) !== null) {
      const tag = match[0];
      count++;

      const getAttr = (name) => {
        const m = tag.match(new RegExp(`${name}="([^"]*)"`));
        return m ? m[1] : "";
      };

      const startDate = getAttr("startDate");
      const duration = getAttr("duration");
      const totalDistance = getAttr("totalDistance");
      const totalEnergyBurned = getAttr("totalEnergyBurned");

      if (!startDate || !duration) {
        warnings.push(`기록 ${count}: 시작시간 또는 시간 누락, 건너뜀`);
        continue;
      }

      // Apple Health dates: "2024-03-15 07:30:00 +0900"
      const isoDate = startDate.replace(" ", "T").replace(" ", "");
      const durationS = Number(duration);
      const distanceM = totalDistance ? Number(totalDistance) : null;

      if (!Number.isFinite(durationS) || durationS <= 0) {
        warnings.push(`기록 ${count}: 시간 값 오류, 건너뜀`);
        continue;
      }

      const activityId = `ah_${startDate.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 60)}_${count}`;

      try {
        const activity = normalizeActivity({
          activity_id: activityId,
          start_time: isoDate,
          timezone_offset: startDate.match(/([+-]\d{4})$/) ? startDate.match(/([+-]\d{4})$/)[1] : "",
          distance_m: distanceM && distanceM > 0 ? distanceM : 0.01, // need positive for validation
          elapsed_s: durationS,
          calories_kcal: totalEnergyBurned ? Number(totalEnergyBurned) : null,
          source: "apple_health",
          source_key: activityId,
          data_quality: "summary_only",
          splits: [],
        });
        // If distance was missing, set back to null for display honesty
        if (!distanceM || distanceM <= 0) {
          activity.distance_m = null;
          activity.pace_s_per_km = null;
        }
        activities.push(activity);
      } catch (e) {
        warnings.push(`기록 ${count}: 정규화 실패 (${e.message})`);
      }
    }

    if (!count && !options.chunk) {
      // Check if it's even Apple Health XML
      if (!src.includes("HKWorkout") && !src.includes("HealthData")) {
        errors.push("Apple Health XML 형식이 아닙니다.");
      } else {
        warnings.push("러닝(HKWorkoutActivityTypeRunning) 기록을 찾지 못했습니다.");
      }
    }

    return { activities, total_found: count, warnings, errors };
  }

  const api = {
    ACTIVITY_SCHEMA, SPLIT_SCHEMA, IMPORT_SCHEMA,
    normalizeActivity, normalizeSplit, stripCoordinates,
    formatPace, formatDuration, formatDistance,
    weekKey, weeklyTrends, weightedAveragePace,
    projectLegacyQuickSessions, buildRunImportReceipt,
    parseTcx, parseGpx, parseAppleHealthXml,
  };
  root.WorkoutRunningCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
