(function (root) {
  "use strict";

  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);
  const PROGRAM_FOLDER = "PARA/PROJECTS/Workout/Programs";
  const EXERCISE_FOLDER = "PARA/RESOURCES/Workout/Exercises";
  const START = "<!-- workout-program:start -->";
  const END = "<!-- workout-program:end -->";

  /**
   * Canonical exercise body-part targets (English id + Korean label).
   * Stored on Exercise Object frontmatter as `target: legs` etc.
   */
  const EXERCISE_TARGETS = Object.freeze([
    Object.freeze({ id: "legs", label: "하체" }),
    Object.freeze({ id: "chest", label: "가슴" }),
    Object.freeze({ id: "back", label: "등" }),
    Object.freeze({ id: "shoulders", label: "어깨" }),
    Object.freeze({ id: "arms", label: "팔" }),
    Object.freeze({ id: "core", label: "코어" }),
    Object.freeze({ id: "full_body", label: "전신" }),
    Object.freeze({ id: "cardio", label: "유산소" }),
    Object.freeze({ id: "other", label: "기타" }),
  ]);
  const TARGET_IDS = Object.freeze(EXERCISE_TARGETS.map((t) => t.id));
  const TARGET_ALIASES = Object.freeze({
    legs: "legs", leg: "legs", lower: "legs", lower_body: "legs",
    "하체": "legs", "다리": "legs", "둔근": "legs", "엉덩이": "legs", glute: "legs", glutes: "legs",
    chest: "chest", pec: "chest", pecs: "chest", "가슴": "chest", "흉부": "chest",
    back: "back", lats: "back", "등": "back", "광배": "back",
    shoulders: "shoulders", shoulder: "shoulders", delts: "shoulders", "어깨": "shoulders",
    arms: "arms", arm: "arms", biceps: "arms", triceps: "arms", "팔": "arms", "이두": "arms", "삼두": "arms",
    core: "core", abs: "core", "코어": "core", "복근": "core",
    full_body: "full_body", fullbody: "full_body", "전신": "full_body",
    cardio: "cardio", conditioning: "cardio", "유산소": "cardio", "컨디셔닝": "cardio",
    other: "other", misc: "other", "기타": "other", "미분류": "other",
  });

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function yamlValue(value) { return JSON.stringify(clean(value)); }

  /** Normalize free text / Korean / English to canonical target id, or "". */
  function normalizeTarget(value) {
    const raw = clean(value);
    if (!raw) return "";
    const key = raw.toLocaleLowerCase("ko-KR").replace(/[\s-]+/g, "_");
    if (TARGET_ALIASES[key]) return TARGET_ALIASES[key];
    if (TARGET_ALIASES[raw]) return TARGET_ALIASES[raw];
    if (TARGET_IDS.includes(key)) return key;
    return "";
  }

  function targetLabel(id) {
    const found = EXERCISE_TARGETS.find((t) => t.id === id);
    return found ? found.label : (id || "");
  }

  /** Soft name-based suggestion only (for empty notes / UI hint — never auto-write without user). */
  function suggestTargetFromName(name) {
    const text = clean(name).toLocaleLowerCase("ko-KR");
    if (!text) return "";
    const rules = [
      ["legs", ["squat", "lunge", "leg press", "hack squat", "rdl", "deadlift", "calf", "스쿼트", "런지", "레그", "하체", "데드", "카프", "힙 쓰러스트", "hip thrust"]],
      ["chest", ["bench", "chest", "fly", "푸시업", "벤치", "가슴", "플라이", "딥스"]],
      ["back", ["row", "pull", "lat", "back extension", "pull-up", "chin", "로우", "풀다운", "등", "시티드", "페이스 풀"]],
      ["shoulders", ["shoulder", "press", "lateral raise", "face pull", "어깨", "밀리터리", "사이드 레터럴", "리어 델트"]],
      ["arms", ["curl", "tricep", "bicep", "extension", "이두", "삼두", "컬", "푸시다운"]],
      ["core", ["crunch", "plank", "ab ", "core", "복근", "플랭크", "크런치", "레그 레이즈"]],
      ["cardio", ["run", "row erg", "bike", "cardio", "러닝", "유산소", "로잉", "사이클"]],
    ];
    for (const [id, words] of rules) {
      if (words.some((w) => text.includes(w))) return id;
    }
    return "";
  }
  function safeName(value) {
    const result = clean(value).replace(/[\\/:*?"<>|#[\]^]/g, " ").replace(/\s+/g, " ").replace(/^\.+|\.+$/g, "").trim();
    if (!result) throw new Error("이름을 입력해 주세요.");
    return result.slice(0, 120);
  }
  function stableExercisePath(name) { return `${EXERCISE_FOLDER}/${safeName(name)}.md`; }
  function linkForExercise(name) { return `[[${stableExercisePath(name).replace(/\.md$/, "")}|${clean(name)}]]`; }
  function encodePrescription(exercise) {
    return JSON.stringify({
      id: exercise.id,
      target: clean(exercise.target),
      notes: clean(exercise.notes),
      prescribed_sets: exercise.prescribed_sets || [],
    });
  }
  function renderProgramSection(program) {
    const lines = [START, "# 프로그램 구성", ""];
    program.days.forEach((day) => {
      lines.push(`## ${day.week}주차 ${day.day}일차 <!-- program_day_id: ${day.id} -->`, "");
      day.exercises.forEach((exercise) => lines.push(`- ${linkForExercise(exercise.name)} <!-- workout-exercise: ${encodePrescription(exercise)} -->`));
      lines.push("");
    });
    lines.push(END);
    return lines.join("\n");
  }
  function renderProgramNote(program, date = new Date().toISOString().slice(0, 10)) {
    const normalized = core.normalizeProgram(program);
    return `---\nid: ${yamlValue(normalized.id)}\ntype: workout_program\nstatus: active\ncreated: ${date}\nupdated: ${date}\ntitle: ${yamlValue(normalized.title)}\ncreator: ${yamlValue(normalized.creator)}\nsource: ${yamlValue(normalized.source)}\ngoal: ${yamlValue(normalized.goal)}\ndifficulty: ${yamlValue(normalized.difficulty)}\nduration: ${yamlValue(normalized.duration)}\n---\n# ${normalized.title}\n\n${renderProgramSection(normalized)}\n\n# 코칭 노트\n\n- \n\n# 개선 사항\n\n- \n\n# 리뷰\n\n- \n\n# 메모\n\n- \n`;
  }
  function replaceProgramSection(source, program) {
    const block = renderProgramSection(core.normalizeProgram(program));
    const start = source.indexOf(START);
    const end = source.indexOf(END);
    if (start < 0 || end < start) throw new Error("프로그램 구성 영역을 찾을 수 없습니다.");
    return `${source.slice(0, start)}${block}${source.slice(end + END.length)}`;
  }
  function parseProgramSection(source, metadata = {}) {
    const start = source.indexOf(START);
    const end = source.indexOf(END);
    if (start < 0 || end < start) throw new Error("프로그램 구성 영역을 찾을 수 없습니다.");
    const body = source.slice(start + START.length, end);
    const days = [];
    let current = null;
    for (const line of body.split(/\r?\n/)) {
      const heading = line.match(/^##\s+(\d+)주차\s+(\d+)일차\s+<!--\s*program_day_id:\s*([^\s]+)\s*-->$/);
      if (heading) {
        current = { id: heading[3], week: Number(heading[1]), day: Number(heading[2]), exercises: [] };
        days.push(current);
        continue;
      }
      const item = line.match(/^-\s+\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s+<!--\s*workout-exercise:\s*(\{.*\})\s*-->$/);
      if (!item || !current) continue;
      const data = JSON.parse(item[3]);
      const name = clean(item[2]) || clean(item[1].split("/").pop());
      current.exercises.push({
        id: data.id,
        name,
        target: data.target,
        notes: data.notes,
        prescribed_sets: data.prescribed_sets,
      });
    }
    return core.normalizeProgram({ ...metadata, days });
  }
  function cleanCue(value) {
    // One-line dashboard cue — collapse newlines, cap length
    return clean(value).replace(/\s+/g, " ").slice(0, 160);
  }

  function renderExerciseNote(name, date = new Date().toISOString().slice(0, 10), options = {}) {
    const title = safeName(name);
    const target = normalizeTarget(options.target) || "";
    const cue = cleanCue(options.cue);
    return `---\nid: ${yamlValue(`exercise_${core.stableHash(title.toLowerCase())}`)}\ntype: exercise\nstatus: active\ncreated: ${date}\nupdated: ${date}\ntitle: ${yamlValue(title)}\ntarget: ${target ? yamlValue(target) : ""}\ncue: ${cue ? yamlValue(cue) : ""}\ncategory: ""\nprimary_muscles: []\nsecondary_muscles: []\nequipment: ""\naliases: []\n---\n# ${title}\n\n# 설명\n\n# 주요 근육\n\n# 보조 근육\n\n# 장비\n\n# 테크닉\n\n# 흔한 실수\n\n# 대체 운동\n\n# 참고 영상\n\n# 팁\n\n# 메모\n\n# 개인 기록\n\n# 관련 운동\n`;
  }

  function findExerciseFile(app, name) {
    if (!app || !app.vault) return null;
    const path = stableExercisePath(name);
    const direct = typeof app.vault.getAbstractFileByPath === "function"
      ? app.vault.getAbstractFileByPath(path)
      : null;
    if (direct) return direct;
    if (typeof app.vault.getMarkdownFiles !== "function") return null;
    const target = safeName(name).toLocaleLowerCase("ko-KR");
    return app.vault.getMarkdownFiles().find((file) =>
      file.path.startsWith(`${EXERCISE_FOLDER}/`) && file.basename.toLocaleLowerCase("ko-KR") === target
    ) || null;
  }

  function exerciseObjectExists(app, name) {
    return Boolean(findExerciseFile(app, name));
  }

  function resolveExerciseFile(app, nameOrPath) {
    if (!app || !app.vault) return null;
    if (nameOrPath && String(nameOrPath).includes("/")) {
      return app.vault.getAbstractFileByPath(nameOrPath) || null;
    }
    return findExerciseFile(app, nameOrPath);
  }

  async function patchExerciseFrontmatter(app, file, patch) {
    if (!file) throw new Error("운동 노트를 찾을 수 없습니다.");
    const next = Object.assign({}, patch || {}, {
      updated: new Date().toISOString().slice(0, 10)
    });
    if (app.fileManager && app.fileManager.processFrontMatter) {
      await app.fileManager.processFrontMatter(file, (fm) => {
        Object.keys(next).forEach((key) => {
          if (next[key] === undefined) return;
          fm[key] = next[key];
        });
      });
    } else {
      const source = await app.vault.read(file);
      await app.vault.modify(file, patchFrontmatter(source, next));
    }
    return file;
  }

  async function createExerciseObject(app, name, options = {}) {
    const existing = findExerciseFile(app, name);
    if (existing) {
      // Fill empty target/cue only — never overwrite user text
      const wantTarget = normalizeTarget(options.target);
      const wantCue = cleanCue(options.cue);
      if ((wantTarget || wantCue) && app.fileManager && app.fileManager.processFrontMatter) {
        await app.fileManager.processFrontMatter(existing, (fm) => {
          if (wantTarget && !normalizeTarget(fm.target)) fm.target = wantTarget;
          if (wantCue && !cleanCue(fm.cue)) fm.cue = wantCue;
        });
      }
      return existing;
    }
    await ensureFolder(app, EXERCISE_FOLDER);
    return app.vault.create(stableExercisePath(name), renderExerciseNote(name, undefined, options));
  }

  async function setExerciseTarget(app, nameOrPath, targetValue) {
    const target = normalizeTarget(targetValue);
    if (!target) throw new Error("유효한 target이 아닙니다. (legs, chest, back, …)");
    const file = resolveExerciseFile(app, nameOrPath);
    await patchExerciseFrontmatter(app, file, { target });
    return { path: file.path, target };
  }

  async function setExerciseCue(app, nameOrPath, cueValue) {
    const cue = cleanCue(cueValue);
    const file = resolveExerciseFile(app, nameOrPath);
    await patchExerciseFrontmatter(app, file, { cue });
    return { path: file.path, cue };
  }

  function getExerciseMeta(app, name) {
    const file = findExerciseFile(app, name);
    if (!file) {
      return { name: clean(name), path: "", target: "", target_label: "", cue: "", exists: false };
    }
    const cache = app.metadataCache && app.metadataCache.getFileCache
      ? app.metadataCache.getFileCache(file)
      : null;
    const fm = (cache && cache.frontmatter) || {};
    const target = normalizeTarget(fm.target);
    return {
      name: file.basename,
      path: file.path,
      target,
      target_label: targetLabel(target),
      cue: cleanCue(fm.cue),
      category: clean(fm.category),
      exists: true
    };
  }

  function listExerciseCatalog(app) {
    if (!app.vault.getMarkdownFiles) return [];
    return app.vault.getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${EXERCISE_FOLDER}/`))
      .map((file) => {
        const cache = app.metadataCache && app.metadataCache.getFileCache ? app.metadataCache.getFileCache(file) : null;
        const fm = (cache && cache.frontmatter) || {};
        const aliases = Array.isArray(fm.aliases) ? fm.aliases.map(clean).filter(Boolean) : [];
        const target = normalizeTarget(fm.target);
        return {
          name: file.basename,
          path: file.path,
          target,
          target_label: targetLabel(target),
          cue: cleanCue(fm.cue),
          category: clean(fm.category),
          aliases,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "ko"));
  }

  /**
   * @param {object} [options]
   * @param {string} [options.target] canonical id or alias — filters catalog
   * @param {boolean} [options.include_untargeted=true] when target filter set, also show notes without target
   */
  function searchExercises(app, query, limit = 20, options = {}) {
    const opts = options || {};
    const q = clean(query).toLocaleLowerCase("ko-KR");
    const want = normalizeTarget(opts.target);
    const includeUntargeted = opts.include_untargeted !== false;
    let catalog = listExerciseCatalog(app);
    if (want) {
      catalog = catalog.filter((item) => {
        if (item.target === want) return true;
        if (!item.target && includeUntargeted) return true;
        return false;
      });
    }
    if (!q) return catalog.slice(0, Math.max(1, Math.min(Number(limit) || 20, 100)));
    return catalog.filter((item) => {
      if (item.name.toLocaleLowerCase("ko-KR").includes(q)) return true;
      if (item.target && item.target.includes(q)) return true;
      if (item.target_label && item.target_label.toLocaleLowerCase("ko-KR").includes(q)) return true;
      if (item.category && item.category.toLocaleLowerCase("ko-KR").includes(q)) return true;
      return (item.aliases || []).some((alias) => String(alias).toLocaleLowerCase("ko-KR").includes(q));
    }).slice(0, Math.max(1, Math.min(Number(limit) || 20, 100)));
  }

  function patchFrontmatter(source, patch) {
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return source;
    const lines = match[1].split(/\r?\n/);
    const keys = new Set(Object.keys(patch || {}));
    const next = lines.map((line) => {
      const pair = line.match(/^([a-z_]+):\s*(.*)$/);
      if (!pair || !keys.has(pair[1])) return line;
      keys.delete(pair[1]);
      const value = patch[pair[1]];
      if (value == null || value === "") return `${pair[1]}:`;
      return `${pair[1]}: ${JSON.stringify(String(value))}`;
    });
    keys.forEach((key) => {
      const value = patch[key];
      next.push(value == null || value === "" ? `${key}:` : `${key}: ${JSON.stringify(String(value))}`);
    });
    return `---\n${next.join("\n")}\n---${source.slice(match[0].length)}`;
  }
  function fallbackMetadata(source) {
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};
    const result = {};
    for (const line of match[1].split(/\r?\n/)) {
      const pair = line.match(/^([a-z_]+):\s*(.*)$/);
      if (!pair) continue;
      let value = pair[2].trim();
      try { value = JSON.parse(value); } catch (_) {}
      result[pair[1]] = value;
    }
    return result;
  }
  async function ensureFolder(app, folder) {
    let current = "";
    for (const part of folder.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
    }
  }
  /** User-initiated create only. Prefer createExerciseObject. Kept for compatibility. */
  async function ensureExercise(app, name) {
    return createExerciseObject(app, name);
  }
  function listExerciseNames(app) {
    return listExerciseCatalog(app).map((item) => item.name);
  }
  async function loadProgramObjects(app) {
    if (!app.vault.getMarkdownFiles) return [];
    const programs = [];
    for (const file of app.vault.getMarkdownFiles().filter((item) => item.path.startsWith(`${PROGRAM_FOLDER}/`))) {
      try {
        const source = await app.vault.read(file);
        const cache = app.metadataCache && app.metadataCache.getFileCache ? app.metadataCache.getFileCache(file) : null;
        const metadata = (cache && cache.frontmatter) || fallbackMetadata(source);
        if (metadata.type !== "workout_program") continue;
        programs.push(parseProgramSection(source, {
          id: metadata.id || file.basename, title: metadata.title || file.basename,
          creator: metadata.creator, source: metadata.source, goal: metadata.goal,
          difficulty: metadata.difficulty, duration: metadata.duration, source_path: file.path,
        }));
      } catch (error) {
        if (root.prodigyDebugMode === true) console.error(`Workout Program load failed: ${file.path}`, error);
      }
    }
    return programs.sort((left, right) => left.title.localeCompare(right.title, "ko"));
  }
  async function saveProgramObject(app, program) {
    const validation = core.validateProgram(program);
    if (!validation.ok) {
      const error = new Error(validation.errors.join("\n"));
      error.validation = validation.errors;
      throw error;
    }
    const normalized = core.normalizeProgram(program);
    // Do NOT auto-create Exercise Objects. Links remain optional.
    await ensureFolder(app, PROGRAM_FOLDER);
    const path = clean(normalized.source_path) || `${PROGRAM_FOLDER}/${safeName(normalized.title)}.md`;
    const file = app.vault.getAbstractFileByPath(path);
    const date = new Date().toISOString().slice(0, 10);
    if (!file) {
      await app.vault.create(path, renderProgramNote(normalized, date));
    } else {
      let source = await app.vault.read(file);
      source = replaceProgramSection(source, normalized);
      source = patchFrontmatter(source, {
        title: normalized.title,
        goal: normalized.goal,
        difficulty: normalized.difficulty,
        duration: normalized.duration,
        updated: date,
      });
      await app.vault.modify(file, source);
    }
    return { ...normalized, source_path: path };
  }

  async function duplicateProgramObject(app, program, options = {}) {
    const copy = core.duplicateProgram(program, options);
    return saveProgramObject(app, copy);
  }

  async function renameProgramObject(app, program, newTitle) {
    const title = safeName(newTitle);
    const next = { ...core.normalizeProgram(program), title };
    const saved = await saveProgramObject(app, next);
    const oldPath = clean(program.source_path);
    if (oldPath && oldPath !== saved.source_path) {
      const oldFile = app.vault.getAbstractFileByPath(oldPath);
      if (oldFile && typeof app.vault.rename === "function") {
        try {
          const dest = `${PROGRAM_FOLDER}/${title}.md`;
          if (!app.vault.getAbstractFileByPath(dest)) {
            await app.vault.rename(oldFile, dest);
            return { ...saved, source_path: dest };
          }
        } catch (_e) { /* keep path */ }
      }
    }
    return saved;
  }

  async function deleteProgramObject(app, program) {
    const path = clean(program && program.source_path);
    if (path) {
      const file = app.vault.getAbstractFileByPath(path);
      if (file) await app.vault.delete(file);
    }
    return true;
  }

  async function exportProgramObject(app, program) {
    const normalized = core.normalizeProgram(program);
    const payload = {
      schema_version: "prodigy-workout-program-export-v1",
      exported_at: new Date().toISOString(),
      program: normalized,
    };
    const folder = "PARA/PROJECTS/Workout/Exports";
    await ensureFolder(app, folder);
    const path = `${folder}/${safeName(normalized.title)}-${new Date().toISOString().slice(0, 10)}.json`;
    let target = path;
    let n = 2;
    while (app.vault.getAbstractFileByPath(target)) {
      target = `${folder}/${safeName(normalized.title)}-${new Date().toISOString().slice(0, 10)}-${n++}.json`;
    }
    await app.vault.create(target, `${JSON.stringify(payload, null, 2)}\n`);
    return target;
  }

  // ─── Workout v2: Superset / Replace / Order (Todo 10) ─────────────────
  // Program JSON production writer count remains 0 — these are pure
  // transformations that return new objects. Persistence only through
  // the existing saveProgramObject() single-writer boundary.

  /**
   * Mark two or more consecutive exercises in a day as a superset group.
   * Pure — returns a new program object. Does NOT write.
   * @param {object} program - normalized program
   * @param {string} dayId
   * @param {number[]} exerciseIndices - indices of exercises in the day (must be consecutive)
   * @param {string} [label] - optional superset label
   * @returns {object} new normalized program
   */
  function markSuperset(program, dayId, exerciseIndices, label) {
    const normalized = core.normalizeProgram(program);
    const next = core.clone(normalized);
    const day = next.days.find((d) => d.id === dayId);
    if (!day) throw new Error("Program Day를 찾을 수 없습니다.");
    const indices = (Array.isArray(exerciseIndices) ? exerciseIndices : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n < day.exercises.length)
      .sort((a, b) => a - b);
    if (indices.length < 2) throw new Error("슈퍼세트는 최소 2개의 운동이 필요합니다.");
    // Verify consecutive
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] !== indices[i - 1] + 1) throw new Error("슈퍼세트 운동은 연속되어야 합니다.");
    }
    const groupId = `superset_${core.stableHash(`${dayId}:${indices.join("-")}:${Date.now()}`)}`;
    const groupLabel = clean(label) || `슈퍼세트 ${groupId.slice(-4).toUpperCase()}`;
    indices.forEach((idx) => {
      day.exercises[idx].superset_group = groupId;
      day.exercises[idx].superset_label = groupLabel;
    });
    return core.normalizeProgram(next);
  }

  /**
   * Remove superset grouping from exercises in a day.
   * Pure — returns a new program object.
   */
  function removeSuperset(program, dayId, exerciseIndices) {
    const normalized = core.normalizeProgram(program);
    const next = core.clone(normalized);
    const day = next.days.find((d) => d.id === dayId);
    if (!day) throw new Error("Program Day를 찾을 수 없습니다.");
    const indices = new Set(
      (Array.isArray(exerciseIndices) ? exerciseIndices : [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n < day.exercises.length)
    );
    indices.forEach((idx) => {
      delete day.exercises[idx].superset_group;
      delete day.exercises[idx].superset_label;
    });
    return core.normalizeProgram(next);
  }

  /**
   * Replace an exercise in a specific day by index.
   * Preserves prescribed_sets, notes, and position. Pure — returns new program.
   * @param {object} program
   * @param {string} dayId
   * @param {number} exerciseIndex
   * @param {object} replacement - { name, target?, notes? }
   */
  function replaceExerciseInDay(program, dayId, exerciseIndex, replacement) {
    const normalized = core.normalizeProgram(program);
    const next = core.clone(normalized);
    const day = next.days.find((d) => d.id === dayId);
    if (!day) throw new Error("Program Day를 찾을 수 없습니다.");
    const idx = Number(exerciseIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= day.exercises.length) {
      throw new Error("운동 인덱스가 올바르지 않습니다.");
    }
    const newName = clean(replacement && replacement.name);
    if (!newName) throw new Error("대체 운동 이름이 필요합니다.");
    day.exercises[idx].name = newName;
    if (replacement.target !== undefined) day.exercises[idx].target = clean(replacement.target);
    if (replacement.notes !== undefined) day.exercises[idx].notes = clean(replacement.notes);
    // Regenerate id to reflect new identity
    day.exercises[idx].id = `exercise_${core.stableHash(`${dayId}:${idx}:${newName}:${Date.now()}`)}`;
    return core.normalizeProgram(next);
  }

  /**
   * Reorder exercises within a day. Pure — returns new program.
   * @param {object} program
   * @param {string} dayId
   * @param {number[]} newOrder - array of current indices in desired order
   */
  function reorderExercises(program, dayId, newOrder) {
    const normalized = core.normalizeProgram(program);
    const next = core.clone(normalized);
    const day = next.days.find((d) => d.id === dayId);
    if (!day) throw new Error("Program Day를 찾을 수 없습니다.");
    const order = (Array.isArray(newOrder) ? newOrder : []).map(Number);
    if (order.length !== day.exercises.length) throw new Error("순서 배열 길이가 운동 수와 다릅니다.");
    const seen = new Set();
    for (const idx of order) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= day.exercises.length || seen.has(idx)) {
        throw new Error("순서 배열이 올바르지 않습니다.");
      }
      seen.add(idx);
    }
    day.exercises = order.map((idx) => day.exercises[idx]);
    return core.normalizeProgram(next);
  }

  /**
   * Get superset groups for a day.
   * @returns {Array<{group_id, label, exercises: Array<{index, name}>}>}
   */
  function getSupersetGroups(program, dayId) {
    const normalized = core.normalizeProgram(program);
    const day = normalized.days.find((d) => d.id === dayId);
    if (!day) return [];
    const groups = new Map();
    day.exercises.forEach((ex, idx) => {
      if (!ex.superset_group) return;
      if (!groups.has(ex.superset_group)) {
        groups.set(ex.superset_group, { group_id: ex.superset_group, label: ex.superset_label || "", exercises: [] });
      }
      groups.get(ex.superset_group).exercises.push({ index: idx, name: ex.name });
    });
    return [...groups.values()];
  }

  const api = {
    END, EXERCISE_FOLDER, PROGRAM_FOLDER, START,
    EXERCISE_TARGETS, TARGET_IDS,
    normalizeTarget, targetLabel, suggestTargetFromName, cleanCue,
    setExerciseTarget, setExerciseCue, getExerciseMeta,
    ensureExercise, createExerciseObject, exerciseObjectExists, findExerciseFile,
    linkForExercise, listExerciseNames, listExerciseCatalog, searchExercises,
    loadProgramObjects, parseProgramSection, renderExerciseNote, renderProgramNote,
    renderProgramSection, replaceProgramSection, safeName, saveProgramObject,
    duplicateProgramObject, renameProgramObject, deleteProgramObject, exportProgramObject,
    stableExercisePath,
    markSuperset, removeSuperset, replaceExerciseInDay, reorderExercises, getSupersetGroups,
  };
  root.WorkoutProgramObjects = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
