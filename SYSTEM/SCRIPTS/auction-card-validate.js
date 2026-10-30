// 옥션 카드 MD 검사. 카드 MD 생성 스킬(경매 사건 Capture)이 카드를 저장한 뒤 반드시 돌린다.
// 오류 = Obsidian 저장·폰 앱·법원 결과 조회·알림이 깨지거나 빠지는 것(반드시 고침), 경고 = 정본 형식과 다른 것.
// 사용: bun SYSTEM/SCRIPTS/auction-card-validate.js <카드.md ...>   전체 점검: --all   (오류가 있으면 exit 1)
// 법원 이름 목록 출처: 앱 저장소 ops/n8n/court-codes.json (courtauction.go.kr 법원 코드표). 코드표가 바뀌면 같이 고친다.
const COURT_NAMES = ["서울중앙지방법원","서울동부지방법원","서울서부지방법원","서울남부지방법원","서울북부지방법원","의정부지방법원","고양지원","남양주지원","인천지방법원","부천지원","수원지방법원","성남지원","여주지원","평택지원","안산지원","안양지원","춘천지방법원","강릉지원","원주지원","속초지원","영월지원","청주지방법원","충주지원","제천지원","영동지원","대전지방법원","홍성지원","논산지원","천안지원","공주지원","서산지원","대구지방법원","안동지원","경주지원","김천지원","상주지원","의성지원","영덕지원","포항지원","대구서부지원","부산지방법원","동부지원","부산서부지원","울산지방법원","창원지방법원","마산지원","진주지원","통영지원","밀양지원","거창지원","광주지방법원","목포지원","장흥지원","순천지원","해남지원","전주지방법원","군산지원","정읍지원","남원지원","제주지방법원"];
const STATUS = ["watching", "bidding", "won", "lost", "skipped", "reviewing", "archived"];
const MONEY = ["appraisal_price", "minimum_bid", "bid_deposit", "expected_bid", "my_bid_price", "winning_bid_price", "market_sale_price", "market_jeonse_price", "expected_deposit", "expected_monthly_rent", "exit_price"];
const CASE_RE = /^(\d{4})타경(\d+)(?:\s*[(_](\d+)\)?)?$/;
const empty = (v) => v == null || v === "";

export function courtKnown(name) {
  const w = String(name || "").replace(/본원/g, "").replace(/지법/g, "지방법원").trim().split(/\s+/).filter(Boolean);
  const last = w[w.length - 1] || "", region = (w[0] || "").replace(/지방법원$/, "");
  const hit = (n) => COURT_NAMES.includes(n);
  return !!((/지원$/.test(last) && (hit(last) || (w.length > 1 && hit(region + last)) || hit(last.replace(/^(서울|부산|대구|인천|광주|대전|울산|수원|창원|청주|전주|춘천|제주|의정부)/, "")))) || hit(w.join("")) || hit(last));
}

export function validateCard(text, fileName = "") {
  const errors = [], warnings = [];
  if (!text.startsWith("---\n")) return { errors: ["frontmatter 없음(첫 줄이 ---가 아님)"], warnings };
  const end = text.indexOf("\n---", 4);
  const tail = end < 0 ? "x" : text.slice(end + 4);
  if (end < 0 || !(tail === "" || tail.startsWith("\n") || tail.startsWith("\r\n"))) return { errors: ["frontmatter 닫는 ---가 단독 줄이 아님"], warnings };
  const raw = text.slice(4, end);
  const keys = raw.split("\n").map((l) => (l.match(/^([A-Za-z_][\w.]*)\s*:/) || [])[1]).filter(Boolean);
  const dup = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (dup.length) errors.push(`같은 키가 두 번: ${dup.join(", ")}`);
  let fm;
  try { fm = Bun.YAML.parse(raw) ?? {}; } catch (e) { errors.push(`YAML을 읽을 수 없음(Obsidian 저장 실패): ${String(e.message).slice(0, 80)}`); return { errors, warnings }; }
  if (fm.type !== "auction_case") errors.push(`type이 auction_case가 아님: ${fm.type ?? "(없음)"}`);
  if (!STATUS.includes(fm.status)) errors.push(`status가 ${STATUS.join("·")} 중 하나가 아님: ${fm.status ?? "(없음)"}`);
  const cn = String(fm.case_number ?? "").trim(), m = cn.match(CASE_RE);
  if (!m) errors.push(`case_number 형식 아님(예: 2025타경12345, 여러 물건 2025타경12345(2)): ${cn || "(없음)"}`);
  else if (m[3] && !new RegExp("^\\d{4}타경\\d+\\(\\d+\\)$").test(cn)) warnings.push(`case_number 물건번호는 괄호로: ${m[1]}타경${m[2]}(${m[3]})`);
  if (empty(fm.court)) errors.push("court 비어 있음(법원 결과 조회에서 빠짐)");
  else if (!courtKnown(fm.court)) errors.push(`court를 법원 코드표에서 못 찾음: ${fm.court} (예: 부산지방법원 / 부산지방법원 동부지원)`);
  const dt = fm.auction_datetime instanceof Date ? fm.auction_datetime.toISOString() : String(fm.auction_datetime ?? "");
  if (!dt) errors.push("auction_datetime 비어 있음");
  else if (/^\d{4}\.\d{2}\.\d{2}/.test(dt)) warnings.push(`auction_datetime은 YYYY-MM-DD로: ${dt}`);
  else if (!/^\d{4}-\d{2}-\d{2}/.test(dt)) errors.push(`auction_datetime 형식 아님: ${dt}`);
  for (const k of MONEY) {
    const v = fm[k];
    if (empty(v) || (typeof v === "number" && Number.isInteger(v))) continue;
    if (typeof v === "number") warnings.push(`${k}는 원 단위 정수로: ${v}`);
    else if (/^[\d,]+$/.test(String(v).trim())) warnings.push(`${k}는 쉼표 없는 숫자로: ${v}`);
    else errors.push(`${k}를 금액으로 읽을 수 없음(원 단위 정수만): ${v}`);
  }
  if (/[\[\]]/.test(String(fm.property_type ?? ""))) errors.push(`property_type에 [ ] 금지(계약평형은 supply_area로): ${fm.property_type}`);
  if (empty(fm.region_sido) || empty(fm.region_sigungu)) errors.push("region_sido·region_sigungu 비어 있음(지역 연결 안 됨)");
  if (typeof fm.recommend_sources === "string" && fm.recommend_sources.trim()) warnings.push("recommend_sources는 YAML 목록(- URL)으로");
  if (!empty(fm.recommend) && typeof fm.recommend !== "boolean") warnings.push(`recommend는 true/false로: ${fm.recommend}`);
  for (const k of ["loan_ratio", "interest_rate"]) if (!empty(fm[k]) && !(typeof fm[k] === "number" && fm[k] > 0 && fm[k] <= 1)) warnings.push(`${k}는 0~1 숫자로(예: 0.8): ${fm[k]}`);
  if (!empty(fm.exclusive_area) && !/^\d+(\.\d+)?$/.test(String(fm.exclusive_area).trim())) warnings.push(`exclusive_area는 ㎡ 숫자만: ${fm.exclusive_area}`);
  if (fileName && m) {
    const want = new RegExp(`^[^-]+-${m[1]}타경${m[2]}${m[3] ? "_" + m[3] : ""}\\.md$`);
    if (!want.test(fileName)) warnings.push(`파일 이름은 <지역>-${m[1]}타경${m[2]}${m[3] ? "_" + m[3] : ""}.md: ${fileName}`);
  }
  return { errors, warnings };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const vault = import.meta.dir.replace(/\/SYSTEM\/SCRIPTS$/, "") + "/";
  const files = args.includes("--all") ? [...new Bun.Glob("PARA/PROJECTS/Auction/*.md").scanSync({ cwd: vault })].map((f) => vault + f) : args;
  if (!files.length) { console.error("사용: bun SYSTEM/SCRIPTS/auction-card-validate.js <카드.md ...> | --all"); process.exit(2); }
  let bad = 0; const tally = {};
  for (const f of files) {
    const text = await Bun.file(f).text();
    if (args.includes("--all") && !/\ntype:\s*["']?auction_case/.test(text.slice(0, 2000))) continue;
    const r = validateCard(text, f.split("/").pop());
    if (r.errors.length) bad++;
    for (const x of [...r.errors.map((e) => "오류 " + e), ...r.warnings.map((w) => "경고 " + w)]) { const k = x.split(/[:(]/)[0].trim(); tally[k] = (tally[k] || 0) + 1; }
    if (!args.includes("--all") || r.errors.length) console.log(JSON.stringify({ file: f.split("/").pop(), ...r }));
  }
  if (args.includes("--all")) console.log(JSON.stringify({ checked: files.length, cards_with_errors: bad, by_rule: tally }));
  process.exit(bad ? 1 : 0);
}
