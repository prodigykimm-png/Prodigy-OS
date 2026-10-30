import { expect, test } from "bun:test";
import { validateCard, courtKnown } from "./auction-card-validate.js";

const card = (over = {}) => {
  const base = { type: "auction_case", status: "watching", case_number: "2025타경4991", court: "부산지방법원 동부지원", auction_datetime: "2026-11-05", region_sido: "부산광역시", region_sigungu: "해운대구", minimum_bid: 86100000, winning_bid_price: "", recommend: false, loan_ratio: 0.8, ...over };
  return "---\n" + Object.entries(base).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n---\n# 요약\n";
};

test("a canonical card has no errors or warnings", () => {
  expect(validateCard(card(), "부산-2025타경4991.md")).toEqual({ errors: [], warnings: [] });
});

test("defects that break saving, the app, court checks or alerts are errors", () => {
  const broken = "---\ntype: auction_case\nrecommend_sources: \"- https://a, b\"\n  - https://a\n---\n";
  expect(validateCard(broken).errors[0]).toContain("YAML을 읽을 수 없음");
  expect(validateCard(card({ court: "서울중부지방법원" })).errors.join()).toContain("법원 코드표에서 못 찾음");
  expect(validateCard(card({ court: "" })).errors.join()).toContain("court 비어 있음");
  expect(validateCard(card({ minimum_bid: "2억" })).errors.join()).toContain("금액으로 읽을 수 없음");
  expect(validateCard(card({ property_type: "오피스텔[계약8평형]" })).errors.join()).toContain("[ ] 금지");
  expect(validateCard(card({ status: "보류" })).errors.join()).toContain("status");
  expect(validateCard(card() .replace("\n---\n#", "\n---#")).errors.join()).toContain("단독 줄");
  expect(validateCard(card() + "").errors).toEqual([]);
  expect(validateCard("---\ntype: auction_case\nstatus: watching\nstatus: bidding\n---\n").errors.join()).toContain("같은 키가 두 번");
});

test("shape differences the app tolerates are warnings", () => {
  const w = validateCard(card({ case_number: "2025타경73510_1", auction_datetime: "2026.10.22", minimum_bid: "86,100,000" }), "경기-2025타경73510(1).md").warnings.join(" | ");
  expect(w).toContain("2025타경73510(1)");
  expect(w).toContain("YYYY-MM-DD");
  expect(w).toContain("쉼표 없는 숫자");
  expect(w).toContain("경기-2025타경73510_1.md".replace("경기-", "<지역>-"));
});

test("court names resolve the way the court check does", () => {
  for (const n of ["부산지방법원 서부지원", "의정부지법 본원", "부산동부지원", "서울중앙지방법원", "광주지방법원 목포지원"]) expect(courtKnown(n)).toBe(true);
  expect(courtKnown("서울중부지방법원")).toBe(false);
});
