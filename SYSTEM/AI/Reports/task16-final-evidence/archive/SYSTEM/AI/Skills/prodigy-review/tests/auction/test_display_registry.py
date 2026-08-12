from pathlib import Path
import json
import re
import subprocess


ROOT = Path(__file__).resolve().parents[6]
REGISTRY = ROOT / "SYSTEM/Views/display-registry.js"
AUCTION_CARD = ROOT / "SYSTEM/Views/auction-card.js"
PRICE_PROJECTION = ROOT / "SYSTEM/Views/auction-card-price-projection.js"
SITE_VISIT = ROOT / "SYSTEM/Views/site-visit-workflow.js"
DASHBOARD = ROOT / "HUB/10 Auction.md"


# Minimal Obsidian DOM double, shared by the card rendering assertions below.
# Mirrors the element surface auction-card.js actually uses (createEl/createSpan,
# setText, innerHTML, listeners) so the real renderer can run under plain node.
_DOM_DOUBLE = "\n".join([
    "function fakeElement(tag, options) {",
    "  const opts = options || {};",
    "  const element = {",
    "    tag: tag, attr: opts.attr || {}, children: [], listeners: Object.create(null),",
    "    parentNode: null, style: {}, text: opts.text || '', textContent: opts.text || '',",
    "    innerHTML: '', value: '', checked: false, disabled: false,",
    "    createEl(childTag, childOptions) {",
    "      const child = fakeElement(childTag, childOptions);",
    "      child.parentNode = this; this.children.push(child); return child;",
    "    },",
    "    createSpan(o) { return this.createEl('span', o); },",
    "    createDiv(o) { return this.createEl('div', o); },",
    "    addEventListener(type, listener) { this.listeners[type] = listener; },",
    "    setText(v) { this.text = String(v); this.textContent = String(v); },",
    "    empty() { this.children = []; this.text = ''; this.textContent = ''; this.innerHTML = ''; },",
    "    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },",
    "    removeChild(c) { this.children = this.children.filter((x) => x !== c); },",
    "    setAttribute() {}, remove() {},",
    "    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },",
    "    querySelector: () => null, querySelectorAll: () => []",
    "  };",
    "  return element;",
    "}",
    "function textOf(element) {",
    "  return [element.text || '', element.innerHTML || '']",
    "    .concat(element.children.map(textOf)).filter(Boolean).join(' ');",
    "}",
    "function findAll(element, predicate, acc) {",
    "  const found = acc || [];",
    "  if (predicate(element)) found.push(element);",
    "  element.children.forEach((child) => findAll(child, predicate, found));",
    "  return found;",
    "}",
])


def run_registry() -> dict[str, str]:
    source = "\n".join([
        "global.window = {};",
        f"eval(require('fs').readFileSync({json.dumps(str(REGISTRY))}, 'utf8'));",
        "const display = window.prodigyDisplay;",
        "console.log(JSON.stringify({",
        "  expectedBid: display.property('expected_bid'),",
        "  exitPrice: display.property('exit_price'),",
        "  status: display.property('status'),",
        "  bidding: display.status('bidding'),",
        "  planning: display.status('planning'),",
        "  active: display.status('active'),",
        "  critical: display.priority('critical'),",
        "  numericPriority: display.priority(1),",
        "  legacyPriority: display.priority('보통'),",
        "  auction: display.type('auction_case'),",
        "  project: display.type('project'),",
        "  landPrice: display.property('official_land_price_per_sqm'),",
        "  supply60: display.property('move_in_60m'),",
        "  unknownStatus: display.status('future_status'),",
        "  unknownPriority: display.priority('future_priority')",
        "}));",
    ])
    result = subprocess.run(["node", "-e", source], capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def test_display_registry_maps_internal_values_to_korean_labels():
    assert run_registry() == {
        "expectedBid": "예상 입찰가",
        "exitPrice": "출구가",
        "status": "상태",
        "bidding": "입찰 예정",
        "planning": "계획",
        "active": "활성",
        "critical": "매우 높음",
        "numericPriority": "매우 높음",
        "legacyPriority": "보통",
        "auction": "경매",
        "project": "프로젝트",
        "landPrice": "개별공시지가(㎡당)",
        "supply60": "입주 예정 60개월",
        "unknownStatus": "미등록 상태",
        "unknownPriority": "미등록 우선순위",
    }


def test_auction_surfaces_use_the_central_registry():
    fixture_path = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review" / "tests" / "shared" / "fixtures" / "workspace-manifest-v1.json"
    required = json.loads(fixture_path.read_text(encoding="utf-8"))["entries"]["auction"]["required"]
    card = AUCTION_CARD.read_text(encoding="utf-8")
    site_visit = SITE_VISIT.read_text(encoding="utf-8")
    assert required.index("SYSTEM/Views/display-registry.js") < required.index("SYSTEM/Views/shared-dashboard.js")
    assert "window.prodigyDisplay" in card
    assert 'display().property("property_type")' in site_visit


def test_pipeline_block_recovers_when_registry_was_not_initialized():
    dashboard = DASHBOARD.read_text(encoding="utf-8")
    recovery_match = re.search(
        r'if \(!window\.prodigyDisplay\) await mountContext\.reloadRequired\("SYSTEM/Views/display-registry\.js"\);\s*'
        r'if \(!window\.prodigyDisplay\) throw new Error\("display-registry 초기화에 실패했습니다\."\);',
        dashboard,
    )
    assert recovery_match
    source = "\n".join([
        "global.window = {};",
        "const mountContext = { reloadRequired: async (path) => {",
        "  if (path !== 'SYSTEM/Views/display-registry.js') throw new Error('wrong path');",
        "  window.prodigyDisplay = { status: (value) => value === 'bidding' ? '입찰 예정' : value };",
        "} };",
        "(async () => {",
        recovery_match.group(0),
        "  console.log(window.prodigyDisplay.status('bidding'));",
        "})().catch((error) => { console.error(error); process.exit(1); });",
    ])
    result = subprocess.run(["node", "-e", source], capture_output=True, text=True, check=True)
    assert result.stdout.strip() == "입찰 예정"


def test_project_surfaces_reuse_the_central_registry():
    project_dashboard = (ROOT / "HUB/40 Project.md").read_text(encoding="utf-8")
    fixture_path = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review" / "tests" / "shared" / "fixtures" / "workspace-manifest-v1.json"
    required = json.loads(fixture_path.read_text(encoding="utf-8"))["entries"]["project"]["required"]
    project_card = (ROOT / "SYSTEM/Views/project-card.js").read_text(encoding="utf-8")
    project_wizard = (ROOT / "SYSTEM/Views/project-wizard.js").read_text(encoding="utf-8")
    assert required.index("SYSTEM/Views/display-registry.js") < required.index("SYSTEM/Views/shared-dashboard.js")
    assert "const display = root.prodigyDisplay;" in project_card
    assert 'display.property("start_date")' in project_wizard
    assert 'display.status("planning")' in project_wizard
    assert "statusStep('planning')" in project_dashboard


def test_reading_card_reuses_registry_labels_without_status_color_accents():
    reading_card = (ROOT / "SYSTEM/Views/reading-card.js").read_text(encoding="utf-8")
    assert "window.prodigyDisplay" in reading_card
    assert "display.statusInfo(p.status)" in reading_card
    assert "statusInfo.label" in reading_card
    assert "statusInfo(p.status).color" not in reading_card
    assert "const statusColors" not in reading_card


def test_home_recent_objects_use_korean_type_labels():
    home = (ROOT / "HUB/00 Home.md").read_text(encoding="utf-8")
    fixture_path = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review" / "tests" / "shared" / "fixtures" / "workspace-manifest-v1.json"
    required = json.loads(fixture_path.read_text(encoding="utf-8"))["entries"]["home"]["required"]
    home_view = (ROOT / "SYSTEM/Views/home-view.js").read_text(encoding="utf-8")
    assert required.index("SYSTEM/Views/display-registry.js") < required.index("SYSTEM/Views/home-view.js")
    assert "root.prodigyDisplay.type(registryType)" in home_view
    assert "String(p.type).toUpperCase()" not in home_view
    for english_label in ["Welcome to Prodigy OS", "# 🎯 Today", "Quick Navigation", "→ Open"]:
        assert english_label not in home


def test_user_facing_auction_copy_does_not_expose_property_keys():
    card = AUCTION_CARD.read_text(encoding="utf-8")
    site_visit = SITE_VISIT.read_text(encoding="utf-8")
    dashboard = DASHBOARD.read_text(encoding="utf-8")
    for raw_label in ["(exit_price)", "(expected_bid)", "(my_opinion)"]:
        assert raw_label not in card
    assert "나의의견" not in card
    assert "decisionEl.innerHTML" not in card
    assert "opinionEl.innerHTML" not in card
    assert "memoEl.innerHTML" not in card
    assert "Site Visit 진행" not in site_visit
    assert "🔥 오늘 입찰 (Today Bidding)" not in dashboard
    assert "이번 달 진행 현황 (Monthly Progress)" not in dashboard
    assert "D-day 가까운순" not in (ROOT / "SYSTEM/Views/shared-dashboard.js").read_text(encoding="utf-8")
    assert 'ddayStr = "D-Day"' not in card


def test_watching_card_with_winning_bid_is_rendered_as_closed():
    """A watching case that already has a winning bid must render as closed.

    This renders the real card through a DOM double instead of grepping the
    product source, so harmless refactors (extracted variables, the price
    projection helper) do not break the test while the guarded behavior —
    "종료" D-Day badge plus 낙찰가 replacing 입찰 예정가 — stays enforced.
    """
    source = "\n".join([
        "const fs = require('fs');",
        _DOM_DOUBLE,
        "const renderErrors = [];",
        "global.document = {",
        "  body: { classList: { contains: () => false } }, head: fakeElement('head'),",
        "  getElementById: () => null, createElement: (tag) => fakeElement(tag),",
        "  querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}",
        "};",
        "global.Notice = function Notice(message) { renderErrors.push(String(message)); };",
        "global.window = global;",
        "global.window.innerWidth = 1280;",
        "global.window.addEventListener = () => {};",
        "global.window.ProdigyUI = null;",
        f"eval(fs.readFileSync({json.dumps(str(REGISTRY))}, 'utf8'));",
        f"require({json.dumps(str(PRICE_PROJECTION))});",
        f"require({json.dumps(str(AUCTION_CARD))});",
        "const app = {",
        "  isMobile: false,",
        "  workspace: { getLeavesOfType: () => [], openLinkText: () => {}, getMostRecentLeaf: () => null },",
        "  vault: { getAbstractFileByPath: (target) => target ? { path: target } : null },",
        "  fileManager: { processFrontMatter: async () => {} }",
        "};",
        "global.window.app = app;",
        "global.app = app;",
        # A future auction date guarantees the "종료" badge can only come from the
        # closed-watching branch, never from the ordinary expired-date branch.
        "const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);",
        "const fixture = (extra) => Object.assign({",
        "  type: 'auction_case', status: 'watching', case_number: '2026타경9001',",
        "  file: { path: 'PARA/PROJECTS/Auction/fixture.md', name: 'fixture.md' },",
        "  address: '부산광역시 금정구, 테스트물건', court: '부산지방법원',",
        "  auction_datetime: futureDate + ' 10:00',",
        "  appraisal_price: 200000000, minimum_bid: 100000000,",
        "  expected_bid: 120000000, exit_price: 150000000",
        "}, extra || {});",
        "const render = (page) => {",
        "  const root = fakeElement('div');",
        "  window.renderAuctionCard(page, root, {});",
        "  return {",
        "    text: textOf(root),",
        "    closedBadge: findAll(root, (n) => n.tag === 'span' && String(n.text).trim() === '종료(경매일 기준)').length > 0",
        "  };",
        "};",
        "const closed = render(fixture({ winning_bid_price: 137000000 }));",
        "const open = render(fixture({}));",
        "console.log(JSON.stringify({",
        "  renderErrors: renderErrors,",
        "  closedBadge: closed.closedBadge,",
        "  closedShowsWinningBidLabel: closed.text.includes('낙찰가'),",
        "  closedShowsWinningBidValue: closed.text.includes('1.37억'),",
        "  closedHidesExpectedBid: !closed.text.includes('입찰 예정가'),",
        "  openBadge: open.closedBadge,",
        "  openShowsExpectedBid: open.text.includes('입찰 예정가'),",
        "  openHidesWinningBid: !open.text.includes('낙찰가')",
        "}));",
    ])
    result = subprocess.run(["node", "-e", source], capture_output=True, text=True, check=True)
    rendered = json.loads(result.stdout)

    assert rendered["renderErrors"] == [], f"card render raised: {rendered['renderErrors']}"
    # Closed watching case: shows 종료 and the winning bid, not the minimum-bid projection.
    assert rendered["closedBadge"], "watching + winning_bid_price must render the exact 종료(경매일 기준) D-Day badge"
    assert rendered["closedShowsWinningBidLabel"], "closed watching card must show the 낙찰가 label"
    assert rendered["closedShowsWinningBidValue"], "closed watching card must show the winning bid value"
    assert rendered["closedHidesExpectedBid"], "closed watching card must not show 입찰 예정가"
    # Still-open watching case: the closed treatment must NOT leak.
    assert not rendered["openBadge"], "open watching card must not render the 종료 badge"
    assert rendered["openShowsExpectedBid"], "open watching card must still show 입찰 예정가"
    assert rendered["openHidesWinningBid"], "open watching card must not show 낙찰가"


def test_display_scripts_have_valid_javascript_syntax():
    for path in [
        REGISTRY,
        AUCTION_CARD,
        SITE_VISIT,
        ROOT / "SYSTEM/Views/project-card.js",
        ROOT / "SYSTEM/Views/project-wizard.js",
    ]:
        subprocess.run(["node", "--check", str(path)], check=True)


def test_consolidation_properties_have_korean_labels():
    """All new consolidation properties must have one canonical Korean label."""
    source = "\n".join([
        "global.window = {};",
        f"eval(require('fs').readFileSync({json.dumps(str(REGISTRY))}, 'utf8'));",
        "const display = window.prodigyDisplay;",
        "console.log(JSON.stringify({",
        "  auction_outcome: display.property('auction_outcome'),",
        "  auction_result_date: display.property('auction_result_date'),",
        "  winning_bid_price: display.property('winning_bid_price'),",
        "  invalidation_conditions: display.property('invalidation_conditions'),",
        "  reading_format: display.property('reading_format'),",
        "  identifier: display.property('identifier'),",
        "  publisher: display.property('publisher'),",
        "  source_url: display.property('source_url'),",
        "  connections: display.property('connections')",
        "}));",
    ])
    result = subprocess.run(["node", "-e", source], capture_output=True, text=True, check=True)
    labels = json.loads(result.stdout)
    expected = {
        "auction_outcome": "경매 결과",
        "auction_result_date": "결과 확정일",
        "winning_bid_price": "낙찰가",
        "invalidation_conditions": "무효화 조건",
        "reading_format": "독서 형식",
        "identifier": "식별 번호",
        "publisher": "발행처",
        "source_url": "자료 URL",
        "connections": "연결",
    }
    assert labels == expected, f"Label mismatch: {labels}"


def test_consolidation_enum_infos_render_korean():
    """auction_outcome and reading_format enum infos must render Korean labels."""
    source = "\n".join([
        "global.window = {};",
        f"eval(require('fs').readFileSync({json.dumps(str(REGISTRY))}, 'utf8'));",
        "const display = window.prodigyDisplay;",
        "console.log(JSON.stringify({",
        "  won: display.auctionOutcome('won'),",
        "  lost: display.auctionOutcome('lost'),",
        "  skipped: display.auctionOutcome('skipped'),",
        "  unknownOutcome: display.auctionOutcome('future'),",
        "  book: display.readingFormat('book'),",
        "  ebook: display.readingFormat('ebook'),",
        "  paper: display.readingFormat('paper'),",
        "  document: display.readingFormat('document'),",
        "  audiobook: display.readingFormat('audiobook'),",
        "  unclassified: display.readingFormat('미분류'),",
        "  unknownFormat: display.readingFormat('scroll')",
        "}));",
    ])
    result = subprocess.run(["node", "-e", source], capture_output=True, text=True, check=True)
    labels = json.loads(result.stdout)
    expected = {
        "won": "낙찰",
        "lost": "패찰",
        "skipped": "입찰 포기",
        "unknownOutcome": "미등록 경매 결과",
        "book": "종이책",
        "ebook": "전자책",
        "paper": "논문",
        "document": "문서",
        "audiobook": "오디오북",
        "unclassified": "미분류",
        "unknownFormat": "미등록 독서 형식",
    }
    assert labels == expected, f"Enum label mismatch: {labels}"


def test_schema_has_no_duplicate_property_definitions():
    """Each consolidation property must appear exactly once as a ### heading in Core_Property_Schema.md."""
    import re
    schema_path = ROOT / "SYSTEM/Prodigy/Schema/Core_Property_Schema.md"
    text = schema_path.read_text(encoding="utf-8")
    consolidation_keys = [
        "auction_outcome", "auction_result_date", "winning_bid_price",
        "invalidation_conditions", "reading_format", "identifier",
        "publisher", "source_url",
    ]
    for key in consolidation_keys:
        count = len(re.findall(rf"^###\s+`{key}`", text, re.MULTILINE))
        assert count == 1, f"Property `{key}` has {count} ### definitions (expected 1)"


def test_raw_key_not_exposed_in_registry_labels():
    """No property label value may be identical to its snake_case key (raw exposure)."""
    source = "\n".join([
        "global.window = {};",
        f"eval(require('fs').readFileSync({json.dumps(str(REGISTRY))}, 'utf8'));",
        "const display = window.prodigyDisplay;",
        "const keys = ['auction_outcome','auction_result_date','winning_bid_price',",
        "  'invalidation_conditions','reading_format','identifier','publisher','source_url'];",
        "const exposed = keys.filter(k => display.property(k) === k);",
        "console.log(JSON.stringify(exposed));",
    ])
    result = subprocess.run(["node", "-e", source], capture_output=True, text=True, check=True)
    exposed = json.loads(result.stdout)
    assert exposed == [], f"Raw keys exposed as labels: {exposed}"


def test_list_property_defaults_remain_lists():
    """connections and invalidation_conditions must be documented as YAML list in schema."""
    schema_path = ROOT / "SYSTEM/Prodigy/Schema/Core_Property_Schema.md"
    text = schema_path.read_text(encoding="utf-8")
    for key in ["connections", "invalidation_conditions"]:
        section = text.split(f"### `{key}`", 1)[1].split("### `", 1)[0]
        assert "YAML list" in section or "list" in section.lower(), (
            f"Property `{key}` must document list format"
        )


if __name__ == "__main__":
    test_display_registry_maps_internal_values_to_korean_labels()
    test_auction_surfaces_use_the_central_registry()
    test_pipeline_block_recovers_when_registry_was_not_initialized()
    test_project_surfaces_reuse_the_central_registry()
    test_reading_card_reuses_registry_labels_without_status_color_accents()
    test_home_recent_objects_use_korean_type_labels()
    test_user_facing_auction_copy_does_not_expose_property_keys()
    test_watching_card_with_winning_bid_is_rendered_as_closed()
    test_display_scripts_have_valid_javascript_syntax()
    test_consolidation_properties_have_korean_labels()
    test_consolidation_enum_infos_render_korean()
    test_schema_has_no_duplicate_property_definitions()
    test_raw_key_not_exposed_in_registry_labels()
    test_list_property_defaults_remain_lists()
    print("Display Registry tests passed")
