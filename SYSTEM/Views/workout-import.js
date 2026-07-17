(function (root) {
  "use strict";

  const core = root.WorkoutCore || (typeof require === "function" ? require("./workout-core.js") : null);

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function titleFromFileName(fileName) {
    const plain = clean(fileName).replace(/\.xlsx$/i, "").replace(/[-_]?ycmrgq.*$/i, "").trim();
    const baseOne = plain.match(/base[\s_-]*one/i);
    return baseOne ? "Base One" : plain || "Imported Program";
  }
  function columnNumber(name) { let value = 0; for (const char of name) value = value * 26 + char.charCodeAt(0) - 64; return value; }
  function columnName(value) { let out = ""; for (let number = value; number > 0; number = Math.floor((number - 1) / 26)) out = String.fromCharCode((number - 1) % 26 + 65) + out; return out; }
  function decodeXml(value) { return clean(value).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
  function attrs(value) { const result = {}; for (const match of String(value).matchAll(/([\w:]+)="([^"]*)"/g)) result[match[1]] = decodeXml(match[2]); return result; }

  function parseSharedStrings(xml) {
    return [...String(xml).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1])).join(""));
  }

  function parseSheetRows(xml, sharedStrings) {
    const rows = [];
    for (const rowMatch of String(xml).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = {};
      const valuedCells = rowMatch[1].replace(/<c\b[^>]*\/>/g, "");
      for (const cellMatch of valuedCells.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const metadata = attrs(cellMatch[1]);
        const reference = clean(metadata.r);
        const column = (reference.match(/^[A-Z]+/) || [""])[0];
        if (!column) continue;
        const valueMatch = cellMatch[2].match(/<v>([\s\S]*?)<\/v>/);
        const inline = [...cellMatch[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1])).join("");
        let value = inline || (valueMatch ? decodeXml(valueMatch[1]) : "");
        if (metadata.t === "s" && value !== "") value = sharedStrings[Number(value)] || value;
        if (clean(value)) row[column] = clean(value);
      }
      if (Object.keys(row).length) rows.push(row);
    }
    return rows;
  }

  function prescribedSets(countValue, reps, rpe, target, seed) {
    const parsed = Number(countValue);
    const count = Number.isInteger(parsed) && parsed > 0 && parsed <= 20 ? parsed : 1;
    return Array.from({ length: count }, (_, index) => ({ id: `set_${core.stableHash(`${seed}:${index}`)}`, reps: clean(reps), rpe: clean(rpe).replace(/^@/, ""), target: clean(target) }));
  }

  function previewProgramRows(rows, options = {}) {
    if (!core) throw new Error("WorkoutCore is unavailable.");
    const markers = [];
    rows.forEach((row, rowIndex) => Object.entries(row).forEach(([column, value]) => {
      const match = clean(value).match(/^W(\d+)D(\d+)$/i);
      if (match) markers.push({ rowIndex, column, week: Number(match[1]), day: Number(match[2]), id: `w${match[1]}d${match[2]}` });
    }));
    if (!markers.length) throw new Error("No Program Day markers were found.");
    const unknownRows = [];
    const days = markers.map((marker) => {
      const next = markers.filter((item) => item.column === marker.column && item.rowIndex > marker.rowIndex).sort((a, b) => a.rowIndex - b.rowIndex)[0];
      const end = next ? next.rowIndex : rows.length;
      const exerciseColumn = columnName(columnNumber(marker.column) + 1);
      const setsColumn = columnName(columnNumber(marker.column) + 2);
      const repsColumn = columnName(columnNumber(marker.column) + 3);
      const rpeColumn = columnName(columnNumber(marker.column) + 4);
      const exercises = [];
      let current = null;
      for (let index = marker.rowIndex; index < end; index += 1) {
        const row = rows[index];
        const name = clean(row[exerciseColumn]);
        const sets = clean(row[setsColumn]);
        const reps = clean(row[repsColumn]);
        const rpe = clean(row[rpeColumn]);
        if (/^notes?$/i.test(name)) continue;
        if (name) {
          current = { id: `exercise_${core.stableHash(`${marker.id}:${name}:${exercises.length}`)}`, name, target: "", prescribed_sets: [] };
          exercises.push(current);
        }
        if (current && (sets || reps || rpe)) {
          const isNumericSets = /^\d+(?:\.0+)?$/.test(sets);
          const target = !isNumericSets && sets ? sets : "";
          current.prescribed_sets.push(...prescribedSets(isNumericSets ? Number(sets) : 1, reps, rpe, target, `${current.id}:${index}`));
        } else if (!current && (sets || reps || rpe)) {
          unknownRows.push({ row: index + 1, day: marker.id, values: [sets, reps, rpe].filter(Boolean).join(" · ") });
        }
      }
      exercises.forEach((exercise) => { if (!exercise.prescribed_sets.length) exercise.prescribed_sets = prescribedSets(1, "", "", exercise.target, exercise.id); });
      return { id: marker.id, week: marker.week, day: marker.day, label: `Week ${marker.week} Day ${marker.day}`, exercises };
    });
    const sourceName = clean(options.source_name);
    const title = clean(options.title) || titleFromFileName(sourceName);
    const program = core.normalizeProgram({ id: options.id, title, source: sourceName, creator: options.creator, goal: options.goal, difficulty: options.difficulty, days });
    return {
      title: program.title, sheet_name: clean(options.sheet_name), weeks: program.weeks, days: program.days.length,
      exercise_count: program.days.reduce((sum, day) => sum + day.exercises.length, 0), unknown_rows: unknownRows,
      outline: program.days.map((day) => ({ id: day.id, label: day.label, exercises: day.exercises.map((exercise) => exercise.name) })), program,
    };
  }

  function findEocd(bytes) {
    for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) return index;
    return -1;
  }

  async function unzip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEocd(bytes);
    if (eocd < 0) throw new Error("Invalid workbook archive.");
    const count = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder("utf-8");
    const entries = new Map();
    for (let item = 0; item < count; item += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Malformed workbook directory.");
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(start, start + compressedSize);
      let data;
      if (method === 0) data = compressed;
      else if (method === 8 && typeof DecompressionStream !== "undefined") {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else throw new Error("Workbook compression is not supported on this device.");
      entries.set(name, data);
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  async function inspectWorkbook(arrayBuffer, fileName = "program.xlsx") {
    try {
      const entries = await unzip(arrayBuffer);
      const decoder = new TextDecoder("utf-8");
      const text = (path) => entries.has(path) ? decoder.decode(entries.get(path)) : "";
      const shared = parseSharedStrings(text("xl/sharedStrings.xml"));
      const relationships = new Map([...text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map((match) => { const data = attrs(match[1]); return [data.Id, data.Target]; }));
      const sheets = [...text("xl/workbook.xml").matchAll(/<sheet\b([^>]*)\/?\s*>/g)].map((match) => attrs(match[1]));
      const candidates = [];
      for (const sheet of sheets) {
        const target = relationships.get(sheet["r:id"]);
        if (!target) continue;
        const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
        const xml = text(path);
        if (!xml) continue;
        const rows = parseSheetRows(xml, shared);
        if (!rows.some((row) => Object.values(row).some((value) => /^W\d+D\d+$/i.test(clean(value))))) continue;
        candidates.push(previewProgramRows(rows, { title: titleFromFileName(fileName), source_name: fileName, sheet_name: sheet.name }));
      }
      if (!candidates.length) throw new Error("No importable Program worksheet was found.");
      candidates.forEach((candidate, index) => {
        const title = index === 0 ? candidate.title : `${candidate.title} - ${candidate.sheet_name}`;
        candidate.title = title;
        candidate.program = core.normalizeProgram({ ...candidate.program, id: `program_${core.stableHash(`${fileName}:${candidate.sheet_name}`)}`, title });
      });
      return { file_name: fileName, candidates };
    } catch (error) {
      if (/workbook/i.test(String(error && error.message))) throw error;
      throw new Error(`Workbook import failed: ${error && error.message ? error.message : error}`);
    }
  }

  const api = { inspectWorkbook, parseSheetRows, previewProgramRows };
  root.WorkoutImport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
