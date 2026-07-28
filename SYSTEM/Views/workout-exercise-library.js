/**
 * Workout Exercise Library — searchable catalog, muscle group classification,
 * equipment filtering. Pure functions + in-memory catalog. CommonJS.
 * Part of Workout v2 (Todo 10).
 */
(function (root) {
  "use strict";

  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);

  // ─── Canonical Muscle Groups ──────────────────────────────────────────

  const MUSCLE_GROUPS = Object.freeze([
    Object.freeze({ id: "quadriceps", label: "대퇴사두", parent: "legs" }),
    Object.freeze({ id: "hamstrings", label: "햄스트링", parent: "legs" }),
    Object.freeze({ id: "glutes", label: "둔근", parent: "legs" }),
    Object.freeze({ id: "calves", label: "종아리", parent: "legs" }),
    Object.freeze({ id: "pectorals", label: "대흉근", parent: "chest" }),
    Object.freeze({ id: "lats", label: "광배근", parent: "back" }),
    Object.freeze({ id: "traps", label: "승모근", parent: "back" }),
    Object.freeze({ id: "rhomboids", label: "능형근", parent: "back" }),
    Object.freeze({ id: "erectors", label: "기립근", parent: "back" }),
    Object.freeze({ id: "deltoids", label: "삼각근", parent: "shoulders" }),
    Object.freeze({ id: "biceps", label: "이두근", parent: "arms" }),
    Object.freeze({ id: "triceps", label: "삼두근", parent: "arms" }),
    Object.freeze({ id: "forearms", label: "전완", parent: "arms" }),
    Object.freeze({ id: "rectus_abdominis", label: "복직근", parent: "core" }),
    Object.freeze({ id: "obliques", label: "복사근", parent: "core" }),
    Object.freeze({ id: "transverse_abdominis", label: "복횡근", parent: "core" }),
    Object.freeze({ id: "hip_flexors", label: "고관절 굴곡근", parent: "legs" }),
    Object.freeze({ id: "adductors", label: "내전근", parent: "legs" }),
  ]);

  const MUSCLE_GROUP_IDS = Object.freeze(MUSCLE_GROUPS.map((g) => g.id));

  // ─── Equipment Types ──────────────────────────────────────────────────

  const EQUIPMENT_TYPES = Object.freeze([
    Object.freeze({ id: "barbell", label: "바벨" }),
    Object.freeze({ id: "dumbbell", label: "덤벨" }),
    Object.freeze({ id: "cable", label: "케이블" }),
    Object.freeze({ id: "machine", label: "머신" }),
    Object.freeze({ id: "kettlebell", label: "케틀벨" }),
    Object.freeze({ id: "bodyweight", label: "맨몸" }),
    Object.freeze({ id: "band", label: "밴드" }),
    Object.freeze({ id: "smith", label: "스미스" }),
    Object.freeze({ id: "ez_bar", label: "EZ바" }),
    Object.freeze({ id: "trap_bar", label: "트랩바" }),
    Object.freeze({ id: "other", label: "기타" }),
  ]);

  const EQUIPMENT_IDS = Object.freeze(EQUIPMENT_TYPES.map((e) => e.id));

  // ─── Seed Catalog ─────────────────────────────────────────────────────

  const SEED_EXERCISES = Object.freeze([
    Object.freeze({ name: "Back Squat", muscles: ["quadriceps", "glutes", "hamstrings"], equipment: "barbell", aliases: ["스쿼트", "백스쿼트"] }),
    Object.freeze({ name: "Front Squat", muscles: ["quadriceps", "glutes"], equipment: "barbell", aliases: ["프론트 스쿼트"] }),
    Object.freeze({ name: "Hack Squat", muscles: ["quadriceps", "glutes"], equipment: "machine", aliases: ["핵스쿼트"] }),
    Object.freeze({ name: "Leg Press", muscles: ["quadriceps", "glutes", "hamstrings"], equipment: "machine", aliases: ["레그프레스"] }),
    Object.freeze({ name: "Romanian Deadlift", muscles: ["hamstrings", "glutes", "erectors"], equipment: "barbell", aliases: ["RDL", "루마니안 데드리프트"] }),
    Object.freeze({ name: "Conventional Deadlift", muscles: ["erectors", "glutes", "hamstrings", "traps"], equipment: "barbell", aliases: ["데드리프트"] }),
    Object.freeze({ name: "Leg Curl", muscles: ["hamstrings"], equipment: "machine", aliases: ["레그컬"] }),
    Object.freeze({ name: "Leg Extension", muscles: ["quadriceps"], equipment: "machine", aliases: ["레그 익스텐션"] }),
    Object.freeze({ name: "Walking Lunge", muscles: ["quadriceps", "glutes"], equipment: "dumbbell", aliases: ["워킹 런지", "런지"] }),
    Object.freeze({ name: "Hip Thrust", muscles: ["glutes", "hamstrings"], equipment: "barbell", aliases: ["힙 쓰러스트"] }),
    Object.freeze({ name: "Calf Raise", muscles: ["calves"], equipment: "machine", aliases: ["카프 레이즈"] }),
    Object.freeze({ name: "Bench Press", muscles: ["pectorals", "triceps", "deltoids"], equipment: "barbell", aliases: ["벤치프레스", "벤치"] }),
    Object.freeze({ name: "Incline Bench Press", muscles: ["pectorals", "deltoids", "triceps"], equipment: "barbell", aliases: ["인클라인 벤치"] }),
    Object.freeze({ name: "Dumbbell Bench Press", muscles: ["pectorals", "triceps", "deltoids"], equipment: "dumbbell", aliases: ["덤벨 벤치"] }),
    Object.freeze({ name: "Cable Fly", muscles: ["pectorals"], equipment: "cable", aliases: ["케이블 플라이"] }),
    Object.freeze({ name: "Dips", muscles: ["pectorals", "triceps"], equipment: "bodyweight", aliases: ["딥스"] }),
    Object.freeze({ name: "Push-Up", muscles: ["pectorals", "triceps", "deltoids"], equipment: "bodyweight", aliases: ["푸시업", "팔굽혀펴기"] }),
    Object.freeze({ name: "Pull-Up", muscles: ["lats", "biceps", "rhomboids"], equipment: "bodyweight", aliases: ["풀업", "턱걸이"] }),
    Object.freeze({ name: "Barbell Row", muscles: ["lats", "rhomboids", "biceps", "erectors"], equipment: "barbell", aliases: ["바벨 로우"] }),
    Object.freeze({ name: "Lat Pulldown", muscles: ["lats", "biceps"], equipment: "cable", aliases: ["랫풀다운"] }),
    Object.freeze({ name: "Seated Cable Row", muscles: ["lats", "rhomboids", "biceps"], equipment: "cable", aliases: ["시티드 로우"] }),
    Object.freeze({ name: "Dumbbell Row", muscles: ["lats", "rhomboids", "biceps"], equipment: "dumbbell", aliases: ["덤벨 로우"] }),
    Object.freeze({ name: "Face Pull", muscles: ["deltoids", "traps", "rhomboids"], equipment: "cable", aliases: ["페이스 풀"] }),
    Object.freeze({ name: "Overhead Press", muscles: ["deltoids", "triceps", "traps"], equipment: "barbell", aliases: ["오버헤드 프레스", "밀리터리 프레스", "OHP"] }),
    Object.freeze({ name: "Lateral Raise", muscles: ["deltoids"], equipment: "dumbbell", aliases: ["사이드 레터럴", "래터럴 레이즈"] }),
    Object.freeze({ name: "Rear Delt Fly", muscles: ["deltoids", "rhomboids"], equipment: "dumbbell", aliases: ["리어 델트 플라이"] }),
    Object.freeze({ name: "Barbell Curl", muscles: ["biceps", "forearms"], equipment: "barbell", aliases: ["바벨 컬"] }),
    Object.freeze({ name: "Dumbbell Curl", muscles: ["biceps"], equipment: "dumbbell", aliases: ["덤벨 컬"] }),
    Object.freeze({ name: "Hammer Curl", muscles: ["biceps", "forearms"], equipment: "dumbbell", aliases: ["해머 컬"] }),
    Object.freeze({ name: "Tricep Pushdown", muscles: ["triceps"], equipment: "cable", aliases: ["푸시다운", "삼두 푸시다운"] }),
    Object.freeze({ name: "Overhead Tricep Extension", muscles: ["triceps"], equipment: "cable", aliases: ["오버헤드 익스텐션"] }),
    Object.freeze({ name: "Skull Crusher", muscles: ["triceps"], equipment: "ez_bar", aliases: ["스컬 크러셔"] }),
    Object.freeze({ name: "Plank", muscles: ["rectus_abdominis", "transverse_abdominis"], equipment: "bodyweight", aliases: ["플랭크"] }),
    Object.freeze({ name: "Hanging Leg Raise", muscles: ["rectus_abdominis", "hip_flexors"], equipment: "bodyweight", aliases: ["행잉 레그 레이즈"] }),
    Object.freeze({ name: "Cable Crunch", muscles: ["rectus_abdominis"], equipment: "cable", aliases: ["케이블 크런치"] }),
    Object.freeze({ name: "Russian Twist", muscles: ["obliques", "rectus_abdominis"], equipment: "bodyweight", aliases: ["러시안 트위스트"] }),
    Object.freeze({ name: "Farmer Walk", muscles: ["forearms", "traps", "rectus_abdominis"], equipment: "dumbbell", aliases: ["파머 워크"] }),
  ]);

  // ─── Catalog Management ───────────────────────────────────────────────

  function clean(value) { return String(value == null ? "" : value).trim(); }

  function normalizeEntry(input) {
    const name = clean(input && input.name);
    if (!name) throw new Error("Exercise name is required.");
    const muscles = (Array.isArray(input.muscles) ? input.muscles : [])
      .map((m) => clean(m).toLocaleLowerCase("en"))
      .filter((m) => MUSCLE_GROUP_IDS.includes(m));
    const equipment = clean(input.equipment).toLocaleLowerCase("en");
    const validEquipment = EQUIPMENT_IDS.includes(equipment) ? equipment : "other";
    const aliases = (Array.isArray(input.aliases) ? input.aliases : [])
      .map((a) => clean(a))
      .filter(Boolean);
    return Object.freeze({ name, muscles: Object.freeze(muscles), equipment: validEquipment, aliases: Object.freeze(aliases) });
  }

  /**
   * Create an in-memory exercise library from seed + custom entries.
   * Custom entries override seed by name (case-insensitive).
   */
  function createLibrary(customEntries) {
    const map = new Map();
    SEED_EXERCISES.forEach((entry) => {
      map.set(entry.name.toLocaleLowerCase("ko-KR"), normalizeEntry(entry));
    });
    (Array.isArray(customEntries) ? customEntries : []).forEach((entry) => {
      const normalized = normalizeEntry(entry);
      map.set(normalized.name.toLocaleLowerCase("ko-KR"), normalized);
    });
    return Object.freeze([...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ko")));
  }

  // ─── Search & Filter ──────────────────────────────────────────────────

  /**
   * Search exercises by name/alias substring (case-insensitive, locale-aware).
   * @param {Array} catalog - from createLibrary()
   * @param {string} query - search text
   * @param {object} [options]
   * @param {string} [options.muscle] - filter by muscle group id
   * @param {string} [options.equipment] - filter by equipment id
   * @param {number} [options.limit=30]
   * @returns {Array} matching entries
   */
  function searchCatalog(catalog, query, options) {
    const opts = options || {};
    const q = clean(query).toLocaleLowerCase("ko-KR");
    const muscleFilter = clean(opts.muscle).toLocaleLowerCase("en");
    const equipmentFilter = clean(opts.equipment).toLocaleLowerCase("en");
    const limit = Math.max(1, Math.min(Number(opts.limit) || 30, 200));

    let results = Array.isArray(catalog) ? catalog : [];

    if (muscleFilter) {
      results = results.filter((entry) => entry.muscles.includes(muscleFilter));
    }
    if (equipmentFilter) {
      results = results.filter((entry) => entry.equipment === equipmentFilter);
    }
    if (q) {
      results = results.filter((entry) => {
        if (entry.name.toLocaleLowerCase("ko-KR").includes(q)) return true;
        return (entry.aliases || []).some((alias) => alias.toLocaleLowerCase("ko-KR").includes(q));
      });
    }
    return results.slice(0, limit);
  }

  /**
   * Classify an exercise name into muscle groups using the catalog.
   * Returns { muscles: string[], equipment: string, found: boolean }
   */
  function classifyExercise(catalog, name) {
    const target = clean(name).toLocaleLowerCase("ko-KR");
    if (!target) return { muscles: [], equipment: "", found: false };
    const entry = (Array.isArray(catalog) ? catalog : []).find((e) =>
      e.name.toLocaleLowerCase("ko-KR") === target ||
      (e.aliases || []).some((a) => a.toLocaleLowerCase("ko-KR") === target)
    );
    if (!entry) return { muscles: [], equipment: "", found: false };
    return { muscles: [...entry.muscles], equipment: entry.equipment, found: true };
  }

  /**
   * Get all muscle groups for a list of exercise names.
   * Returns Map<muscleId, count> sorted by count desc then id asc.
   */
  function muscleDistribution(catalog, exerciseNames) {
    const counts = new Map();
    (Array.isArray(exerciseNames) ? exerciseNames : []).forEach((name) => {
      const result = classifyExercise(catalog, name);
      result.muscles.forEach((m) => {
        counts.set(m, (counts.get(m) || 0) + 1);
      });
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, count]) => {
        const group = MUSCLE_GROUPS.find((g) => g.id === id);
        return { id, label: group ? group.label : id, count };
      });
  }

  /**
   * Get equipment distribution for exercise names.
   */
  function equipmentDistribution(catalog, exerciseNames) {
    const counts = new Map();
    (Array.isArray(exerciseNames) ? exerciseNames : []).forEach((name) => {
      const result = classifyExercise(catalog, name);
      if (result.equipment) {
        counts.set(result.equipment, (counts.get(result.equipment) || 0) + 1);
      }
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, count]) => {
        const eq = EQUIPMENT_TYPES.find((e) => e.id === id);
        return { id, label: eq ? eq.label : id, count };
      });
  }

  const api = {
    MUSCLE_GROUPS, MUSCLE_GROUP_IDS,
    EQUIPMENT_TYPES, EQUIPMENT_IDS,
    SEED_EXERCISES,
    createLibrary, normalizeEntry,
    searchCatalog, classifyExercise,
    muscleDistribution, equipmentDistribution,
  };
  root.WorkoutExerciseLibrary = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
