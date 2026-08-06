/**
 * region-source-registry-core.js
 *
 * CommonJS module that loads and validates the frozen Region Intelligence
 * provider registry. Enforces the five-value fixture_policy enum, transport
 * contracts, 83-region identity digest, and all hard constraints from the
 * consolidation plan.
 *
 * Uses only Node.js built-in modules.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VAULT_ROOT = path.resolve(__dirname, "..", "..");
const REGISTRY_PATH = path.join(__dirname, "region-source-registry.json");

const EXPECTED_PROVIDER_COUNT = 32;
const EXPECTED_DIGEST_SHA256 =
  "663998ddf2f7b1b4d4242d52e5ea0fc99884c55230b3ceb3f555f07a101dab1b";

const FIXTURE_POLICY_ENUM = [
  "required",
  "parser_seed",
  "grandfathered_set",
  "absent_blocked",
  "manual_no_fetch",
];

const STATUS_ENUM = [
  "planned_enabled",
  "blocked_coverage",
  "blocked_fixture",
  "disabled",
  "accepted_legacy",
  "candidate",
  "manual",
];

const CADENCE_ENUM = [
  "monthly",
  "half-year",
  "annual",
  "provider revision",
  "official file revision",
  "seven-day revision poll",
  "revision polling",
  "manual/weekly",
  "manual",
  "none",
];

const AUTH_PLACEMENT_ENUM = [
  "none",
  "none for public tables",
  "intended ServiceKey query, exact operation path unapproved",
  "intended ServiceKey query, exact operation/response field unapproved",
  "intended ServiceKey query, exact operation unapproved",
  "exact API/file route and auth placement unapproved",
  "optional prodigy-kosis-api-key",
  "data.go.kr LINK 15123971 to VWorld; exact linked operation unapproved",
  "data.go.kr LINK 15124014 to VWorld; exact linked operation unapproved",
  "VWorld WFS 1.1.0 lt_c_adsigg_info; intended KEY + exact DOMAIN",
  "Seoul OpenAPI StationAdresTelno; exact key placement/response fixture not frozen",
  "none; no generic operator inference",
  "data.go.kr LINK 15041676; no ServiceKey claim",
  "none; plus KRIC cross-check",
  "X-Naver-Client-Id + X-Naver-Client-Secret headers",
  "API key query",
  "user-entered HTTP(S) URL; no fetch",
];

const SECRET_IDS = [
  "prodigy-reb-openapi-key",
  "prodigy-data-go-kr-service-key",
  "prodigy-vworld-api-key",
  "prodigy-kosis-api-key",
  "prodigy-seoul-openapi-key",
  "prodigy-naver-client-id",
  "prodigy-naver-client-secret",
  "prodigy-youtube-api-key",
];

const MOIS_TRANSPORT_LITERAL = {
  method: "POST",
  url: "https://jumin.mois.go.kr/downloadCsv.do",
  query: { searchYearMonth: "month", xlsStats: "3" },
  headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
  body: {
    sltOrgType: "1",
    sltOrgLvl1: "A",
    sltOrgLvl2: "",
    gender: "gender",
    genderPer: "genderPer",
    generation: "generation",
    sltUndefType: "",
    searchYearStart: "{{YYYY}}",
    searchMonthStart: "{{MM}}",
    searchYearEnd: "{{YYYY}}",
    searchMonthEnd: "{{MM}}",
    sltOrderType: "1",
    sltOrderValue: "ASC",
    category: "month",
    state: "3",
  },
  pagination: { kind: "none", max_requests: 1 },
  response_encoding: "euc-kr",
  response_columns: [
    "행정구역",
    "{{YYYY}}년{{MM}}월_총인구수",
    "{{YYYY}}년{{MM}}월_세대수",
    "{{YYYY}}년{{MM}}월_세대당 인구",
    "{{YYYY}}년{{MM}}월_남자 인구수",
    "{{YYYY}}년{{MM}}월_여자 인구수",
    "{{YYYY}}년{{MM}}월_남여 비율",
  ],
};

// The canonical 83 region triples in manifest-index order
const REGION_TRIPLES = [
  ["부산광역시-중구", "26110000", "2611000000"],
  ["부산광역시-서구", "26140000", "2614000000"],
  ["부산광역시-동구", "26170000", "2617000000"],
  ["부산광역시-영도구", "26200000", "2620000000"],
  ["부산광역시-부산진구", "26230000", "2623000000"],
  ["부산광역시-동래구", "26260000", "2626000000"],
  ["부산광역시-남구", "26290000", "2629000000"],
  ["부산광역시-북구", "26320000", "2632000000"],
  ["부산광역시-해운대구", "26350000", "2635000000"],
  ["부산광역시-사하구", "26380000", "2638000000"],
  ["부산광역시-금정구", "26410000", "2641000000"],
  ["부산광역시-강서구", "26440000", "2644000000"],
  ["부산광역시-연제구", "26470000", "2647000000"],
  ["부산광역시-수영구", "26500000", "2650000000"],
  ["부산광역시-사상구", "26530000", "2653000000"],
  ["부산광역시-기장군", "26710000", "2671000000"],
  ["서울특별시-종로구", "11110000", "1111000000"],
  ["서울특별시-중구", "11140000", "1114000000"],
  ["서울특별시-용산구", "11170000", "1117000000"],
  ["서울특별시-성동구", "11200000", "1120000000"],
  ["서울특별시-광진구", "11215000", "1121500000"],
  ["서울특별시-동대문구", "11230000", "1123000000"],
  ["서울특별시-중랑구", "11260000", "1126000000"],
  ["서울특별시-성북구", "11290000", "1129000000"],
  ["서울특별시-강북구", "11305000", "1130500000"],
  ["서울특별시-도봉구", "11320000", "1132000000"],
  ["서울특별시-노원구", "11350000", "1135000000"],
  ["서울특별시-은평구", "11380000", "1138000000"],
  ["서울특별시-서대문구", "11410000", "1141000000"],
  ["서울특별시-마포구", "11440000", "1144000000"],
  ["서울특별시-양천구", "11470000", "1147000000"],
  ["서울특별시-강서구", "11500000", "1150000000"],
  ["서울특별시-구로구", "11530000", "1153000000"],
  ["서울특별시-금천구", "11545000", "1154500000"],
  ["서울특별시-영등포구", "11560000", "1156000000"],
  ["서울특별시-동작구", "11590000", "1159000000"],
  ["서울특별시-관악구", "11620000", "1162000000"],
  ["서울특별시-서초구", "11650000", "1165000000"],
  ["서울특별시-강남구", "11680000", "1168000000"],
  ["서울특별시-송파구", "11710000", "1171000000"],
  ["서울특별시-강동구", "11740000", "1174000000"],
  ["경기도-수원시", "41110000", "4111000000"],
  ["경기도-성남시", "41130000", "4113000000"],
  ["경기도-의정부시", "41150000", "4115000000"],
  ["경기도-안양시", "41170000", "4117000000"],
  ["경기도-부천시", "41190000", "4119000000"],
  ["경기도-광명시", "41210000", "4121000000"],
  ["경기도-평택시", "41220000", "4122000000"],
  ["경기도-동두천시", "41250000", "4125000000"],
  ["경기도-안산시", "41270000", "4127000000"],
  ["경기도-고양시", "41280000", "4128000000"],
  ["경기도-과천시", "41290000", "4129000000"],
  ["경기도-구리시", "41310000", "4131000000"],
  ["경기도-남양주시", "41360000", "4136000000"],
  ["경기도-오산시", "41370000", "4137000000"],
  ["경기도-시흥시", "41390000", "4139000000"],
  ["경기도-군포시", "41410000", "4141000000"],
  ["경기도-의왕시", "41430000", "4143000000"],
  ["경기도-하남시", "41450000", "4145000000"],
  ["경기도-용인시", "41460000", "4146000000"],
  ["경기도-파주시", "41480000", "4148000000"],
  ["경기도-이천시", "41500000", "4150000000"],
  ["경기도-안성시", "41550000", "4155000000"],
  ["경기도-김포시", "41570000", "4157000000"],
  ["경기도-화성시", "41590000", "4159000000"],
  ["경기도-광주시", "41610000", "4161000000"],
  ["경기도-양주시", "41630000", "4163000000"],
  ["경기도-포천시", "41650000", "4165000000"],
  ["경기도-여주시", "41670000", "4167000000"],
  ["경기도-연천군", "41800000", "4180000000"],
  ["경기도-가평군", "41820000", "4182000000"],
  ["경기도-양평군", "41830000", "4183000000"],
  ["인천광역시-제물포구", "28125000", "2812500000"],
  ["인천광역시-영종구", "28155000", "2815500000"],
  ["인천광역시-미추홀구", "28177000", "2817700000"],
  ["인천광역시-연수구", "28185000", "2818500000"],
  ["인천광역시-남동구", "28200000", "2820000000"],
  ["인천광역시-부평구", "28237000", "2823700000"],
  ["인천광역시-계양구", "28245000", "2824500000"],
  ["인천광역시-서해구", "28275000", "2827500000"],
  ["인천광역시-검단구", "28290000", "2829000000"],
  ["인천광역시-강화군", "28710000", "2871000000"],
  ["인천광역시-옹진군", "28720000", "2872000000"],
];

const REQUIRED_PROVIDER_IDS = [
  "mois_jumin_statmonth_csv",
  "reb_rone_public_table",
  "reb_stock",
  "molit_apt_sale",
  "molit_apt_rent",
  "reb_supply",
  "building_hub_housing_permit",
  "kapt_basic",
  "national_establishments",
  "kosis_disabled",
  "official_land_price_region",
  "official_land_price_case",
  "admin_code",
  "admin_boundary_vworld",
  "incheon-metro",
  "busan-metro",
  "seoul-metro",
  "metro9-stage1",
  "metro9-stage23",
  "korail-station-candidate",
  "kric-station-candidate",
  "arex",
  "shinbundang",
  "gimpo-goldline",
  "ui-sinseol",
  "sillim",
  "everline",
  "uijeongbu-lrt",
  "seohae-rail",
  "naver_candidate",
  "youtube_candidate",
  "instagram_manual",
];

const REQUIRED_ROW_FIELDS = [
  "provider_id",
  "status",
  "canonical_source_url",
  "auth_placement",
  "scope",
  "cadence",
  "parser_version",
  "units",
  "correction_semantics",
  "retention",
  "license_url",
  "network_allowed",
  "fixture_policy",
  "fixtures",
  "fixture_missing_reason",
  "transport",
  "transport_missing_reason",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function isLowercaseHex64(s) {
  return typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
}

function isNonemptyString(s) {
  return typeof s === "string" && s.length > 0;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 83-region digest
// ---------------------------------------------------------------------------

function computeRegionDigest(triples) {
  const arr = triples.map(([region_key, lawd_code, household_code]) => ({
    household_code,
    lawd_code,
    region_key,
  }));
  // JSON.stringify produces keys in insertion order which is already
  // RFC 8785 lexicographic: household_code < lawd_code < region_key
  const json = JSON.stringify(arr);
  return sha256hex(Buffer.from(json, "utf8"));
}

function verifyRegionDigest() {
  const digest = computeRegionDigest(REGION_TRIPLES);
  if (digest !== EXPECTED_DIGEST_SHA256) {
    throw new Error(
      `83-region digest mismatch: got ${digest}, expected ${EXPECTED_DIGEST_SHA256}`
    );
  }
  return digest;
}

// ---------------------------------------------------------------------------
// Registry loading and validation
// ---------------------------------------------------------------------------

function loadRegistry(registryPath) {
  const p = registryPath || REGISTRY_PATH;
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function validateRegistry(registry) {
  const errors = [];

  // Top-level shape
  if (!registry || typeof registry !== "object") {
    throw new Error("Registry must be a JSON object");
  }
  if (!Array.isArray(registry.providers)) {
    throw new Error("Registry must have a providers array");
  }
  if (registry.providers.length !== EXPECTED_PROVIDER_COUNT) {
    errors.push(
      `Expected ${EXPECTED_PROVIDER_COUNT} providers, got ${registry.providers.length}`
    );
  }

  const seenIds = new Set();

  for (const row of registry.providers) {
    const pid = row.provider_id || "<unknown>";

    // Duplicate check
    if (seenIds.has(pid)) {
      errors.push(`Duplicate provider_id: ${pid}`);
      continue;
    }
    seenIds.add(pid);

    // Required fields
    for (const field of REQUIRED_ROW_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(row, field)) {
        errors.push(`${pid}: missing required field "${field}"`);
      }
    }

    // Unknown fields
    for (const key of Object.keys(row)) {
      if (!REQUIRED_ROW_FIELDS.includes(key)) {
        errors.push(`${pid}: unknown field "${key}"`);
      }
    }

    // Status enum
    if (!STATUS_ENUM.includes(row.status)) {
      errors.push(`${pid}: invalid status "${row.status}"`);
    }

    // Cadence enum
    if (!CADENCE_ENUM.includes(row.cadence)) {
      errors.push(`${pid}: invalid cadence "${row.cadence}"`);
    }

    // Auth placement enum
    if (!AUTH_PLACEMENT_ENUM.includes(row.auth_placement)) {
      errors.push(`${pid}: unsupported auth_placement "${row.auth_placement}"`);
    }

    // Fixture policy enum
    if (!FIXTURE_POLICY_ENUM.includes(row.fixture_policy)) {
      errors.push(`${pid}: invalid fixture_policy "${row.fixture_policy}"`);
    }

    // network_allowed must be boolean
    if (typeof row.network_allowed !== "boolean") {
      errors.push(`${pid}: network_allowed must be boolean`);
    }

    // Fixture validation
    validateFixtures(row, errors);

    // Transport validation
    validateTransport(row, errors);

    // Secret scan
    scanForSecrets(row, errors);
  }

  // Check all required IDs present
  for (const id of REQUIRED_PROVIDER_IDS) {
    if (!seenIds.has(id)) {
      errors.push(`Missing required provider_id: ${id}`);
    }
  }

  return errors;
}

function validateFixtures(row, errors) {
  const pid = row.provider_id;
  const policy = row.fixture_policy;
  const fixtures = row.fixtures;

  if (!Array.isArray(fixtures)) {
    errors.push(`${pid}: fixtures must be an array`);
    return;
  }

  // Policy-specific rules
  if (policy === "required" || policy === "parser_seed") {
    if (fixtures.length === 0) {
      errors.push(`${pid}: fixture_policy "${policy}" requires nonempty fixtures`);
    }
  }
  if (policy === "parser_seed" && row.network_allowed !== false) {
    errors.push(`${pid}: parser_seed requires network_allowed:false`);
  }
  if (policy === "absent_blocked" || policy === "manual_no_fetch") {
    if (fixtures.length !== 0) {
      errors.push(
        `${pid}: fixture_policy "${policy}" requires empty fixtures array`
      );
    }
    if (!isNonemptyString(row.fixture_missing_reason)) {
      errors.push(
        `${pid}: fixture_policy "${policy}" requires nonempty fixture_missing_reason`
      );
    }
    if (row.network_allowed !== false) {
      errors.push(
        `${pid}: fixture_policy "${policy}" requires network_allowed:false`
      );
    }
  }

  // Validate each fixture object
  const seenRoles = new Set();
  const seenPaths = new Set();

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const label = `${pid}.fixtures[${i}]`;

    // Exact fields
    const fKeys = Object.keys(f);
    if (fKeys.length !== 3 || !fKeys.includes("role") || !fKeys.includes("path") || !fKeys.includes("sha256")) {
      errors.push(`${label}: must have exactly {role, path, sha256}`);
      continue;
    }

    // Role: nonempty unique ASCII snake_case
    if (!isNonemptyString(f.role)) {
      errors.push(`${label}: role must be nonempty string`);
    } else if (!/^[a-z0-9_]+$/.test(f.role)) {
      errors.push(`${label}: role must be ASCII snake_case`);
    } else if (seenRoles.has(f.role)) {
      errors.push(`${label}: duplicate role "${f.role}"`);
    } else {
      seenRoles.add(f.role);
    }

    // Path: nonempty canonical repo-relative
    if (!isNonemptyString(f.path)) {
      errors.push(`${label}: path must be nonempty string`);
    } else if (f.path.startsWith("/") || f.path.includes("..")) {
      errors.push(`${label}: path must be canonical repo-relative`);
    } else if (seenPaths.has(f.path)) {
      errors.push(`${label}: duplicate path "${f.path}"`);
    } else {
      seenPaths.add(f.path);
    }

    // SHA-256: 64 lowercase hex, not TBD
    if (!isNonemptyString(f.sha256)) {
      errors.push(`${label}: sha256 must be nonempty string`);
    } else if (f.sha256 === "TBD" || f.sha256.toUpperCase() === "TBD") {
      errors.push(`${label}: TBD hash is forbidden`);
    } else if (!isLowercaseHex64(f.sha256)) {
      errors.push(`${label}: sha256 must be 64 lowercase hex chars`);
    }
  }

  // Sorted by role then path
  for (let i = 1; i < fixtures.length; i++) {
    const prev = fixtures[i - 1];
    const curr = fixtures[i];
    const cmp =
      prev.role < curr.role ? -1 : prev.role > curr.role ? 1 :
      prev.path < curr.path ? -1 : prev.path > curr.path ? 1 : 0;
    if (cmp > 0) {
      errors.push(
        `${pid}: fixtures not sorted by role then path at index ${i}`
      );
      break;
    }
  }
}

function validateTransport(row, errors) {
  const pid = row.provider_id;

  if (row.network_allowed === true) {
    // Must have non-null closed transport object
    if (row.transport === null || typeof row.transport !== "object") {
      errors.push(`${pid}: network_allowed:true requires non-null transport object`);
      return;
    }
    if (row.transport_missing_reason !== null) {
      errors.push(`${pid}: network_allowed:true requires transport_missing_reason:null`);
    }
    // Validate closed transport fields
    const requiredTransportKeys = [
      "method", "url", "query", "headers", "body",
      "pagination", "response_encoding", "response_columns",
    ];
    for (const k of requiredTransportKeys) {
      if (!Object.prototype.hasOwnProperty.call(row.transport, k)) {
        errors.push(`${pid}: transport missing required key "${k}"`);
      }
    }
    // No extra keys
    for (const k of Object.keys(row.transport)) {
      if (!requiredTransportKeys.includes(k)) {
        errors.push(`${pid}: transport has unknown key "${k}"`);
      }
    }
    // MOIS literal match
    if (pid === "mois_jumin_statmonth_csv") {
      if (!deepEqual(row.transport, MOIS_TRANSPORT_LITERAL)) {
        errors.push(`${pid}: transport does not match frozen MOIS literal shape`);
      }
    }
  } else {
    // network_allowed:false => transport must be null
    if (row.transport !== null) {
      errors.push(
        `${pid}: network_allowed:false requires transport:null, got non-null`
      );
    }
    if (!isNonemptyString(row.transport_missing_reason)) {
      errors.push(
        `${pid}: network_allowed:false requires nonempty transport_missing_reason`
      );
    }
  }
}

function scanForSecrets(row, errors) {
  const pid = row.provider_id;
  const json = JSON.stringify(row);

  // Check for secret-like patterns
  const secretPatterns = [
    /(?:api[_-]?key|secret|token|password|credential)\s*[:=]\s*["'][^"']{8,}/i,
    /Bearer\s+[A-Za-z0-9\-._~+/]+=*/,
  ];

  for (const pat of secretPatterns) {
    if (pat.test(json)) {
      errors.push(`${pid}: secret-like value detected in registry row`);
    }
  }

  // Check that no secret ID values appear (the IDs themselves are OK as references)
  // We check for actual secret values that would be long random strings in value positions
  for (const key of Object.keys(row)) {
    const val = row[key];
    if (typeof val === "string" && val.length > 32 && /^[A-Za-z0-9+/=_-]+$/.test(val)) {
      // Could be a secret value; but exclude known URLs and hashes
      if (!val.startsWith("http") && !isLowercaseHex64(val)) {
        errors.push(`${pid}: potential secret value in field "${key}"`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Status enforcement
// ---------------------------------------------------------------------------

const EXPECTED_STATUS_MAP = {
  mois_jumin_statmonth_csv: "planned_enabled",
  reb_rone_public_table: "blocked_coverage",
  reb_stock: "blocked_fixture",
  molit_apt_sale: "blocked_fixture",
  molit_apt_rent: "blocked_fixture",
  reb_supply: "blocked_fixture",
  building_hub_housing_permit: "blocked_fixture",
  kapt_basic: "blocked_fixture",
  national_establishments: "blocked_fixture",
  kosis_disabled: "disabled",
  official_land_price_region: "blocked_fixture",
  official_land_price_case: "blocked_fixture",
  admin_code: "blocked_fixture",
  admin_boundary_vworld: "blocked_fixture",
  "incheon-metro": "accepted_legacy",
  "busan-metro": "accepted_legacy",
  "seoul-metro": "candidate",
  "metro9-stage1": "candidate",
  "metro9-stage23": "candidate",
  "korail-station-candidate": "candidate",
  "kric-station-candidate": "candidate",
  arex: "candidate",
  shinbundang: "candidate",
  "gimpo-goldline": "candidate",
  "ui-sinseol": "candidate",
  sillim: "candidate",
  everline: "candidate",
  "uijeongbu-lrt": "candidate",
  "seohae-rail": "candidate",
  naver_candidate: "disabled",
  youtube_candidate: "disabled",
  instagram_manual: "manual",
};

function validateStatuses(registry) {
  const errors = [];
  for (const row of registry.providers) {
    const expected = EXPECTED_STATUS_MAP[row.provider_id];
    if (expected && row.status !== expected) {
      errors.push(
        `${row.provider_id}: status must be "${expected}", got "${row.status}"`
      );
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Fixture hash verification (reads actual files)
// ---------------------------------------------------------------------------

function verifyFixtureHashes(registry, vaultRoot) {
  const root = vaultRoot || VAULT_ROOT;
  const results = [];
  const errors = [];

  for (const row of registry.providers) {
    for (const fixture of row.fixtures) {
      const absPath = path.join(root, fixture.path);
      let actual;
      try {
        const buf = fs.readFileSync(absPath);
        actual = sha256hex(buf);
      } catch (e) {
        errors.push(`${row.provider_id}: cannot read fixture ${fixture.path}: ${e.message}`);
        continue;
      }
      const match = actual === fixture.sha256;
      results.push({
        provider_id: row.provider_id,
        role: fixture.role,
        path: fixture.path,
        expected: fixture.sha256,
        actual,
        match,
      });
      if (!match) {
        errors.push(
          `${row.provider_id}: fixture hash mismatch for ${fixture.path}: expected ${fixture.sha256}, got ${actual}`
        );
      }
    }
  }

  return { results, errors };
}

// ---------------------------------------------------------------------------
// Full validation entry point
// ---------------------------------------------------------------------------

function validateAll(options) {
  const opts = options || {};
  const registryPath = opts.registryPath || REGISTRY_PATH;
  const vaultRoot = opts.vaultRoot || VAULT_ROOT;
  const skipFileHashes = opts.skipFileHashes || false;

  const registry = loadRegistry(registryPath);
  const allErrors = [];

  // Structure validation
  allErrors.push(...validateRegistry(registry));

  // Status enforcement
  allErrors.push(...validateStatuses(registry));

  // 83-region digest
  let digest;
  try {
    digest = verifyRegionDigest();
  } catch (e) {
    allErrors.push(e.message);
    digest = null;
  }

  // Fixture file hash verification
  let fixtureResults = [];
  if (!skipFileHashes) {
    const { results, errors } = verifyFixtureHashes(registry, vaultRoot);
    fixtureResults = results;
    allErrors.push(...errors);
  }

  return {
    ok: allErrors.length === 0,
    errors: allErrors,
    provider_count: registry.providers ? registry.providers.length : 0,
    digest_sha256: digest,
    fixture_hashes_verified: fixtureResults.filter((r) => r.match).length,
    fixture_total: fixtureResults.length,
    secret_scan_hits: allErrors.filter((e) => e.includes("secret")).length,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  EXPECTED_PROVIDER_COUNT,
  EXPECTED_DIGEST_SHA256,
  FIXTURE_POLICY_ENUM,
  STATUS_ENUM,
  CADENCE_ENUM,
  AUTH_PLACEMENT_ENUM,
  SECRET_IDS,
  MOIS_TRANSPORT_LITERAL,
  REGION_TRIPLES,
  REQUIRED_PROVIDER_IDS,
  EXPECTED_STATUS_MAP,
  computeRegionDigest,
  verifyRegionDigest,
  loadRegistry,
  validateRegistry,
  validateStatuses,
  validateFixtures,
  validateTransport,
  scanForSecrets,
  verifyFixtureHashes,
  validateAll,
  deepEqual,
  sha256hex,
  isLowercaseHex64,
  VAULT_ROOT,
  REGISTRY_PATH,
};
