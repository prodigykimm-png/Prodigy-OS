(function (root) {
  "use strict";

  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);
  const PROGRAM_FOLDER = "PARA/PROJECTS/Workout/Programs";
  const EXERCISE_FOLDER = "PARA/RESOURCES/Workout/Exercises";
  const START = "<!-- workout-program:start -->";
  const END = "<!-- workout-program:end -->";

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function yamlValue(value) { return JSON.stringify(clean(value)); }
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
  function renderExerciseNote(name, date = new Date().toISOString().slice(0, 10)) {
    const title = safeName(name);
    return `---\nid: ${yamlValue(`exercise_${core.stableHash(title.toLowerCase())}`)}\ntype: exercise\nstatus: active\ncreated: ${date}\nupdated: ${date}\ntitle: ${yamlValue(title)}\ncategory: ""\nprimary_muscles: []\nsecondary_muscles: []\nequipment: ""\naliases: []\n---\n# ${title}\n\n# 설명\n\n# 주요 근육\n\n# 보조 근육\n\n# 장비\n\n# 테크닉\n\n# 흔한 실수\n\n# 대체 운동\n\n# 참고 영상\n\n# 팁\n\n# 메모\n\n# 개인 기록\n\n# 관련 운동\n`;
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

  async function createExerciseObject(app, name) {
    const existing = findExerciseFile(app, name);
    if (existing) return existing;
    await ensureFolder(app, EXERCISE_FOLDER);
    return app.vault.create(stableExercisePath(name), renderExerciseNote(name));
  }

  function listExerciseCatalog(app) {
    if (!app.vault.getMarkdownFiles) return [];
    return app.vault.getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${EXERCISE_FOLDER}/`))
      .map((file) => {
        const cache = app.metadataCache && app.metadataCache.getFileCache ? app.metadataCache.getFileCache(file) : null;
        const fm = (cache && cache.frontmatter) || {};
        const aliases = Array.isArray(fm.aliases) ? fm.aliases.map(clean).filter(Boolean) : [];
        return {
          name: file.basename,
          path: file.path,
          category: clean(fm.category),
          aliases,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "ko"));
  }

  function searchExercises(app, query, limit = 20) {
    const q = clean(query).toLocaleLowerCase("ko-KR");
    const catalog = listExerciseCatalog(app);
    if (!q) return catalog.slice(0, limit);
    return catalog.filter((item) => {
      if (item.name.toLocaleLowerCase("ko-KR").includes(q)) return true;
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

  const api = {
    END, EXERCISE_FOLDER, PROGRAM_FOLDER, START,
    ensureExercise, createExerciseObject, exerciseObjectExists, findExerciseFile,
    linkForExercise, listExerciseNames, listExerciseCatalog, searchExercises,
    loadProgramObjects, parseProgramSection, renderExerciseNote, renderProgramNote,
    renderProgramSection, replaceProgramSection, safeName, saveProgramObject,
    duplicateProgramObject, renameProgramObject, deleteProgramObject, exportProgramObject,
    stableExercisePath,
  };
  root.WorkoutProgramObjects = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
