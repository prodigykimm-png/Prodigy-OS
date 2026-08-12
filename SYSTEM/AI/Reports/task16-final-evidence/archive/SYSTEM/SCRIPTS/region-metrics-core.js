"use strict";

const crypto = require("node:crypto");

const RONE_VALUE_RE = /^COL_(\d{6})100001OD$/;

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseJson(raw) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch (error) {
    throw new Error(`R-ONE JSON 파싱 실패: ${error.message}`);
  }
  if (!parsed || parsed.RESULT?.CODE !== 0 || !Array.isArray(parsed.DATA)) {
    throw new Error("R-ONE 응답 계약이 올바르지 않습니다.");
  }
  return parsed;
}

function parseRoneSeries(raw, expectedCategories) {
  const parsed = parseJson(raw);
  if (parsed.DATA.length !== 1) {
    throw new Error(`R-ONE 시군구 행은 정확히 1개여야 합니다: ${parsed.DATA.length}`);
  }
  const row = parsed.DATA[0];
  expectedCategories.forEach((expected, index) => {
    const actual = row[`CATE${index + 1}`];
    if (actual !== expected) {
      throw new Error(`R-ONE 지역 불일치: ${actual ?? "(없음)"} != ${expected}`);
    }
  });
  const series = Object.entries(row)
    .filter(([key]) => RONE_VALUE_RE.test(key))
    .map(([key, rawValue]) => {
      const match = key.match(RONE_VALUE_RE);
      const value = Number(String(rawValue).replaceAll(",", ""));
      if (!match || !Number.isFinite(value)) {
        throw new Error(`R-ONE 수치가 올바르지 않습니다: ${key}`);
      }
      return { month: match[1], value };
    })
    .sort((left, right) => left.month.localeCompare(right.month));
  if (series.length === 0) {
    throw new Error("R-ONE 응답에 월별 수치가 없습니다.");
  }
  return series;
}

function monthIndex(month) {
  const year = Number(month.slice(0, 4));
  const value = Number(month.slice(4, 6));
  if (!/^\d{6}$/.test(month) || value < 1 || value > 12) {
    throw new Error(`올바르지 않은 기준월: ${month}`);
  }
  return year * 12 + value - 1;
}

function summarizeVolume(series) {
  if (series.length !== 3) {
    throw new Error(`거래량은 최근 3개월이어야 합니다: ${series.length}`);
  }
  for (let index = 1; index < series.length; index += 1) {
    if (monthIndex(series[index].month) - monthIndex(series[index - 1].month) !== 1) {
      throw new Error("거래량 기준월에 공백이 있습니다.");
    }
  }
  return {
    asOf: series.at(-1).month,
    months: series.map((item) => item.month),
    value: series.reduce((total, item) => total + item.value, 0)
  };
}

function calculateYoY(current, previous) {
  if (monthIndex(current.month) - monthIndex(previous.month) !== 12 || previous.value === 0) {
    throw new Error("YoY는 정확한 전년 동월 쌍이 필요합니다.");
  }
  return round((current.value / previous.value - 1) * 100, 6);
}

function calculateTurnover(volume3m, housingStock) {
  if (volume3m < 0 || housingStock <= 0) {
    throw new Error("회전율 입력값이 올바르지 않습니다.");
  }
  return round((volume3m * 4) / housingStock, 8);
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function csvRows(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("CSV 데이터 행이 없습니다.");
  }
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function integer(value, label) {
  const parsed = Number(String(value).replaceAll(",", "").trim());
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} 정수가 올바르지 않습니다: ${value}`);
  }
  return parsed;
}

function parseStockCsv(text, regionPrefix) {
  const rows = csvRows(text);
  const matched = rows.filter((row) => row["주소"].trim().startsWith(regionPrefix) && row["단지종류"].trim() === "1");
  return {
    matchedRows: matched.length,
    totalRows: rows.length,
    unmatchedRows: rows.length - matched.length,
    value: matched.reduce((total, row) => total + integer(row["세대수"], "주택 재고"), 0)
  };
}

function parseSupplyCsv(text, regionPrefix, basisMonth) {
  const rows = csvRows(text);
  const validMonthRe = /^\d{4}-(0[1-9]|1[0-2])$/;
  const validRows = rows.filter((row) => validMonthRe.test((row["입주예정월"] || "").trim()));
  const matched = validRows.filter((row) => row["주소"].trim().startsWith(regionPrefix));
  const basisIndex = monthIndex(basisMonth.replace("-", ""));
  const datedRows = validRows.map((row) => ({
    row,
    month: row["입주예정월"].replace("-", ""),
    delta: monthIndex(row["입주예정월"].replace("-", "")) - basisIndex
  }));
  const futureDeltas = datedRows.map((item) => item.delta).filter((delta) => delta > 0);
  if (futureDeltas.length === 0) {
    throw new Error("입주예정물량 원본에 기준월 이후 월이 없습니다.");
  }
  const observedHorizonMonths = Math.max(...futureDeltas);
  const horizons = [12, 24, 36, 48, 60];
  const totals = Object.fromEntries(horizons.map((horizon) => [horizon, 0]));
  matched.forEach((row) => {
    const delta = monthIndex(row["입주예정월"].replace("-", "")) - basisIndex;
    const households = integer(row["세대수"], "입주 세대수");
    horizons.forEach((horizon) => {
      if (delta > 0 && delta <= horizon) totals[horizon] += households;
    });
  });
  const valueFor = (horizon) => observedHorizonMonths >= horizon ? totals[horizon] : null;
  return {
    matchedRows: matched.length,
    totalRows: rows.length,
    sourceMonthMin: `${datedRows.map((item) => item.month).sort()[0].slice(0, 4)}-${datedRows.map((item) => item.month).sort()[0].slice(4, 6)}`,
    sourceMonthMax: `${datedRows.map((item) => item.month).sort().at(-1).slice(0, 4)}-${datedRows.map((item) => item.month).sort().at(-1).slice(4, 6)}`,
    observedHorizonMonths,
    unavailableHorizons: horizons.filter((horizon) => observedHorizonMonths < horizon),
    moveIn12m: valueFor(12),
    moveIn24m: valueFor(24),
    moveIn36m: valueFor(36),
    moveIn48m: valueFor(48),
    moveIn60m: valueFor(60)
  };
}

function parseHouseholdsCsv(text, rowLabel, month) {
  const rows = csvRows(text);
  const matches = rows.filter((row) => row["행정구역"] === rowLabel);
  if (matches.length !== 1) {
    throw new Error(`세대수 시군구 행은 정확히 1개여야 합니다: ${matches.length}`);
  }
  const header = `${month.slice(0, 4)}년${month.slice(4, 6)}월_세대수`;
  return integer(matches[0][header], "세대수");
}

function sha256(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

module.exports = Object.freeze({
  calculateTurnover,
  calculateYoY,
  parseHouseholdsCsv,
  parseRoneSeries,
  parseStockCsv,
  parseSupplyCsv,
  sha256,
  summarizeVolume
});
