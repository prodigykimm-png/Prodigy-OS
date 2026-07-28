(function (root) {
  "use strict";

  /**
   * Minimal FIT (Flexible and Interoperable Data Transfer) binary parser.
   * Handles running activity files: File ID, Session, Lap, Record, Activity messages.
   * Coordinates are parsed for distance calculation but stripped from output.
   * Based on FIT Protocol v2.0, compatible with fit-file-parser@3.1.3 output shape.
   * MIT-style implementation for Prodigy OS local use.
   */

  // Global message numbers
  const MSG_FILE_ID = 0;
  const MSG_SESSION = 18;
  const MSG_LAP = 19;
  const MSG_RECORD = 20;
  const MSG_EVENT = 21;
  const MSG_ACTIVITY = 34;

  // Base types
  const BASE_TYPES = {
    0x00: { name: "enum", size: 1, invalid: 0xFF },
    0x01: { name: "sint8", size: 1, invalid: 0x7F },
    0x02: { name: "uint8", size: 1, invalid: 0xFF },
    0x83: { name: "sint16", size: 2, invalid: 0x7FFF },
    0x84: { name: "uint16", size: 2, invalid: 0xFFFF },
    0x85: { name: "sint32", size: 4, invalid: 0x7FFFFFFF },
    0x86: { name: "uint32", size: 4, invalid: 0xFFFFFFFF },
    0x07: { name: "string", size: 1, invalid: 0x00 },
    0x88: { name: "float32", size: 4, invalid: null },
    0x89: { name: "float64", size: 8, invalid: null },
    0x0A: { name: "uint8z", size: 1, invalid: 0x00 },
    0x8B: { name: "uint16z", size: 2, invalid: 0x0000 },
    0x8C: { name: "uint32z", size: 4, invalid: 0x00000000 },
    0x0D: { name: "byte", size: 1, invalid: 0xFF },
    0x8E: { name: "sint64", size: 8, invalid: null },
    0x8F: { name: "uint64", size: 8, invalid: null },
    0x90: { name: "uint64z", size: 8, invalid: 0 },
  };

  // FIT epoch: 1989-12-31T00:00:00Z in Unix ms
  const FIT_EPOCH_MS = 631065600000;

  function fitTimeToIso(fitSeconds) {
    if (fitSeconds == null || fitSeconds === 0xFFFFFFFF) return null;
    return new Date(FIT_EPOCH_MS + fitSeconds * 1000).toISOString();
  }

  function semicirclesToDegrees(semi) {
    return semi * (180 / Math.pow(2, 31));
  }

  /**
   * Parse a FIT file ArrayBuffer.
   * @returns { sessions, laps, records, activities, errors, warnings }
   */
  function parseFit(buffer) {
    const errors = [];
    const warnings = [];
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    if (bytes.length < 14) {
      errors.push("파일이 너무 작습니다 (FIT 최소 14바이트).");
      return { sessions: [], laps: [], records: [], activities: [], errors, warnings };
    }

    // Header
    const headerSize = view.getUint8(0);
    const protocolVersion = view.getUint8(1);
    const profileVersion = view.getUint16(2, true);
    const dataSize = view.getUint32(4, true);
    const dataType = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);

    if (dataType !== ".FIT") {
      errors.push("FIT 형식이 아닙니다.");
      return { sessions: [], laps: [], records: [], activities: [], errors, warnings };
    }

    const dataStart = headerSize;
    const dataEnd = Math.min(dataStart + dataSize, bytes.length);

    // Message definitions and data
    const definitions = {}; // localMsgType -> { globalMsgNum, fields: [{fieldDefNum, size, baseType}] }
    const sessions = [];
    const laps = [];
    const records = [];
    const activities = [];

    let offset = dataStart;
    let recordCount = 0;
    const MAX_RECORDS = 50000; // safety cap

    while (offset < dataEnd) {
      const header = bytes[offset];
      offset++;

      const isDefinition = (header & 0x40) !== 0;
      const hasDevFields = (header & 0x20) !== 0;
      const localMsgType = header & 0x0F;

      if (isDefinition) {
        // Definition message
        offset++; // reserved
        const arch = bytes[offset]; offset++; // 0=little, 1=big
        const littleEndian = arch === 0;
        const globalMsgNum = littleEndian ? view.getUint16(offset, true) : view.getUint16(offset, false);
        offset += 2;
        const numFields = bytes[offset]; offset++;
        const fields = [];
        for (let i = 0; i < numFields; i++) {
          const fieldDefNum = bytes[offset]; offset++;
          const size = bytes[offset]; offset++;
          const baseType = bytes[offset]; offset++;
          fields.push({ fieldDefNum, size, baseType });
        }
        // Developer fields
        if (hasDevFields) {
          const numDevFields = bytes[offset]; offset++;
          for (let i = 0; i < numDevFields; i++) {
            offset += 3; // skip dev field definitions
          }
        }
        definitions[localMsgType] = { globalMsgNum, fields, littleEndian };
      } else {
        // Data message
        const def = definitions[localMsgType];
        if (!def) {
          warnings.push(`정의 없는 메시지 타입 ${localMsgType}, 건너뜀`);
          break; // can't continue without definition
        }

        const msg = {};
        const le = def.littleEndian;

        for (const field of def.fields) {
          const bt = BASE_TYPES[field.baseType];
          if (!bt) { offset += field.size; continue; }

          let value = null;
          if (bt.name === "string") {
            let str = "";
            for (let i = 0; i < field.size; i++) {
              const c = bytes[offset + i];
              if (c === 0) break;
              str += String.fromCharCode(c);
            }
            value = str;
          } else if (bt.name === "uint32" || bt.name === "uint32z") {
            value = field.size === 4 ? (le ? view.getUint32(offset, true) : view.getUint32(offset, false)) : null;
            if (value === bt.invalid) value = null;
          } else if (bt.name === "sint32") {
            value = field.size === 4 ? (le ? view.getInt32(offset, true) : view.getInt32(offset, false)) : null;
            if (value === bt.invalid) value = null;
          } else if (bt.name === "uint16" || bt.name === "uint16z") {
            value = field.size === 2 ? (le ? view.getUint16(offset, true) : view.getUint16(offset, false)) : null;
            if (value === bt.invalid) value = null;
          } else if (bt.name === "sint16") {
            value = field.size === 2 ? (le ? view.getInt16(offset, true) : view.getInt16(offset, false)) : null;
            if (value === bt.invalid) value = null;
          } else if (bt.name === "uint8" || bt.name === "uint8z" || bt.name === "enum" || bt.name === "byte") {
            value = bytes[offset];
            if (value === bt.invalid) value = null;
          } else if (bt.name === "sint8") {
            value = view.getInt8(offset);
            if (value === bt.invalid) value = null;
          } else if (bt.name === "float32") {
            value = field.size === 4 ? (le ? view.getFloat32(offset, true) : view.getFloat32(offset, false)) : null;
          } else if (bt.name === "float64") {
            value = field.size === 8 ? (le ? view.getFloat64(offset, true) : view.getFloat64(offset, false)) : null;
          } else if (bt.name === "sint64" || bt.name === "uint64" || bt.name === "uint64z") {
            // Read as two 32-bit values (approximate for large values)
            if (field.size === 8) {
              const low = le ? view.getUint32(offset, true) : view.getUint32(offset + 4, false);
              value = low; // sufficient for timestamps
            }
          }

          msg[field.fieldDefNum] = value;
          offset += field.size;
        }

        // Route by global message number
        switch (def.globalMsgNum) {
          case MSG_FILE_ID: {
            const type = msg[0]; // type field
            if (type !== 4 && type !== null) { // 4 = activity
              errors.push(`활동 파일이 아닙니다 (type: ${type}).`);
              return { sessions, laps, records, activities, errors, warnings };
            }
            break;
          }
          case MSG_SESSION: {
            sessions.push({
              sport: msg[5], // sport enum: 0=generic, 1=running
              sub_sport: msg[6],
              start_time: fitTimeToIso(msg[2]),
              total_elapsed_time: msg[7] != null ? msg[7] / 1000 : null, // ms → s
              total_timer_time: msg[8] != null ? msg[8] / 1000 : null,
              total_distance_m: msg[9] != null ? msg[9] / 100 : null, // cm → m
              total_calories: msg[11],
              avg_hr: msg[16],
              max_hr: msg[15],
              avg_cadence: msg[18],
              total_ascent: msg[22],
              total_descent: msg[23],
              num_laps: msg[25],
            });
            break;
          }
          case MSG_LAP: {
            laps.push({
              start_time: fitTimeToIso(msg[2]),
              total_elapsed_time: msg[7] != null ? msg[7] / 1000 : null,
              total_timer_time: msg[8] != null ? msg[8] / 1000 : null,
              total_distance_m: msg[9] != null ? msg[9] / 100 : null,
              total_calories: msg[11],
              avg_hr: msg[13],
              max_hr: msg[14],
              avg_cadence: msg[17],
              total_ascent: msg[21],
            });
            break;
          }
          case MSG_RECORD: {
            if (recordCount < MAX_RECORDS) {
              records.push({
                timestamp: fitTimeToIso(msg[253]),
                // position_lat/lon in semicircles (field 0, 1) — used for distance only
                lat: msg[0] != null ? semicirclesToDegrees(msg[0]) : null,
                lon: msg[1] != null ? semicirclesToDegrees(msg[1]) : null,
                altitude: msg[2] != null ? msg[2] + 500 : null, // offset 500m
                hr: msg[3],
                cadence: msg[4],
                distance_m: msg[5] != null ? msg[5] / 100 : null, // cm → m
                speed: msg[6] != null ? msg[6] / 1000 : null, // mm/s → m/s
              });
              recordCount++;
            }
            break;
          }
          case MSG_ACTIVITY: {
            activities.push({
              timestamp: fitTimeToIso(msg[253]),
              total_timer_time: msg[0] != null ? msg[0] / 1000 : null,
              num_sessions: msg[1],
            });
            break;
          }
        }
      }
    }

    return { sessions, laps, records, activities, errors, warnings };
  }

  /**
   * Convert parsed FIT data into a normalized RunActivity.
   * Only accepts running sessions (sport === 1).
   */
  function fitToRunActivity(parsed, options) {
    const runningCore = root.WorkoutRunningCore || (typeof require === "function" ? require("./workout-running-core.js") : null);
    if (!runningCore) throw new Error("WorkoutRunningCore is unavailable.");

    const warnings = [...(parsed.warnings || [])];
    const errors = [...(parsed.errors || [])];

    if (errors.length) return { activity: null, errors, warnings };

    // Find running session
    const session = (parsed.sessions || []).find((s) => s.sport === 1);
    if (!session) {
      // Check if any session exists
      if (parsed.sessions && parsed.sessions.length) {
        const sportNames = { 0: "generic", 1: "running", 2: "cycling", 3: "transition", 4: "fitness_equipment", 5: "swimming", 6: "basketball", 7: "soccer" };
        const sport = parsed.sessions[0].sport;
        errors.push(`러닝 활동이 아닙니다 (sport: ${sportNames[sport] || sport}).`);
      } else {
        errors.push("세션 데이터를 찾을 수 없습니다.");
      }
      return { activity: null, errors, warnings };
    }

    if (!session.total_distance_m || !session.total_elapsed_time) {
      errors.push("거리 또는 시간 정보가 없습니다.");
      return { activity: null, errors, warnings };
    }

    // Build splits from laps
    const splits = (parsed.laps || [])
      .filter((l) => l.total_distance_m && l.total_timer_time)
      .map((l, i) => ({
        split_index: i,
        distance_m: Math.round(l.total_distance_m * 10) / 10,
        duration_s: Math.round(l.total_timer_time),
        avg_hr: l.avg_hr || null,
        elevation_gain_m: l.total_ascent || null,
      }));

    const activityId = `fit_${(session.start_time || Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)}`;

    const activity = runningCore.normalizeActivity({
      activity_id: activityId,
      start_time: session.start_time || new Date().toISOString(),
      distance_m: Math.round(session.total_distance_m * 10) / 10,
      elapsed_s: Math.round(session.total_elapsed_time),
      moving_s: session.total_timer_time ? Math.round(session.total_timer_time) : null,
      elevation_gain_m: session.total_ascent || null,
      avg_hr: session.avg_hr || null,
      max_hr: session.max_hr || null,
      cadence: session.avg_cadence || null,
      calories_kcal: session.total_calories || null,
      source: "fit",
      source_key: activityId,
      data_quality: "full",
      splits,
    });

    // Coordinates are already stripped by normalizeActivity → stripCoordinates
    return { activity, errors: [], warnings };
  }

  const api = { parseFit, fitToRunActivity, FIT_EPOCH_MS, fitTimeToIso, semicirclesToDegrees };
  root.WorkoutFitParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
