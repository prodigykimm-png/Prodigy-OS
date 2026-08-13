import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
HUB = ROOT / "HUB" / "10 Auction.md"
AUCTION_CARD = ROOT / "SYSTEM" / "Views" / "auction-card.js"
SHARED_DASHBOARD = ROOT / "SYSTEM" / "Views" / "shared-dashboard.js"


def test_mobile_dataview_collections_are_normalized_before_for_each():
    hub = HUB.read_text(encoding="utf-8")
    assert "toPlainArray(cases).forEach" in hub, (
        "Auction Today must normalize Dataview collections before iteration on mobile"
    )


def test_shared_dashboard_materializes_mobile_dataview_collections_before_rendering_watching_and_bidding_cards():
    dashboard = SHARED_DASHBOARD.read_text(encoding="utf-8")
    script = r'''
const assert = require("node:assert/strict");
const vm = require("node:vm");
const source = require("node:fs").readFileSync(process.argv[1], "utf8");

function element() {
  return {
    children: [], value: "", options: [],
    createEl() { const child = element(); this.children.push(child); return child; },
    addEventListener() {},
    empty() { this.children = []; }
  };
}

class MobileDataviewCollection {
  constructor(rows) { this.rows = rows; }
  where(predicate) { return new MobileDataviewCollection(this.rows.filter(predicate)); }
  sort() { return new MobileDataviewCollection(this.rows); }
  array() { return this.rows.slice(); }
}

function render(sourceUnderTest) {
  const window = { innerWidth: 390, app: { isMobile: true } };
  const context = {
    window,
    document: { body: { classList: { contains: () => true } } },
    console,
    setTimeout,
    Notice: function Notice() {}
  };
  vm.runInNewContext(sourceUnderTest, context, { filename: "shared-dashboard.js" });
  const rendered = [];
  const fixture = new MobileDataviewCollection([
    { type: "auction_case", status: "watching", file: { ctime: 1, mtime: 1 } },
    { type: "auction_case", status: "bidding", file: { ctime: 2, mtime: 2 } }
  ]);
  for (const status of ["watching", "bidding"]) window.renderDashboardSection({
    status,
    type: "auction_case",
    container: element(),
    dv: { current: () => ({}), pages: () => fixture },
    renderer: (page, target) => {
      rendered.push({ status: page.status, mobile: window.innerWidth === 390 && window.app.isMobile, target });
    }
  });
  return rendered;
}

const rendered = render(source);
assert.deepEqual(rendered.map((card) => card.status), ["watching", "bidding"]);
assert.ok(rendered.every((card) => card.mobile && card.target), "both fixture cards render at 390px mobile");

const historical = source.replace(
  'const pageList = typeof pages.array === "function" ? pages.array() : Array.from(pages || []);',
  'const pageList = pages;'
);
assert.notEqual(historical, source, "historical mutation must target the materialization seam");
assert.throws(() => render(historical), /forEach is not a function/, "historical DataArray iteration must fail before card rendering");
'''
    result = subprocess.run(
        ["node", "-e", script, str(SHARED_DASHBOARD)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr


def test_loader_error_exposes_failing_stage_and_message_on_ios():
    hub = HUB.read_text(encoding="utf-8")

    assert "activeLoadPath" in hub
    assert "err.message" in hub
    assert "failedStage" in hub
    assert "renderLoaderError" in hub


def test_compact_action_menu_preserves_inline_editing_and_wide_actions():
    hub = HUB.read_text(encoding="utf-8")
    card = AUCTION_CARD.read_text(encoding="utf-8")
    inline_editing = card.split("// Transition status buttons", maxsplit=1)[0]

    for field in ("expected_bid", "bid_deposit", "exit_price", "my_opinion"):
        assert field in inline_editing
        assert f"fm.{field}" in inline_editing
    assert "processFrontMatter" in inline_editing
    assert "calcMonthlyProfit" in inline_editing
    assert "fm.expected_monthly_rent" in inline_editing
    for click_path in (
        "minEl.addEventListener('click'",
        "expEl.addEventListener('click'",
        "depositEl.addEventListener('click'",
        "exitEl.addEventListener('click'",
        "profitEl.addEventListener('click'",
        "opinionEl.addEventListener('click'",
    ):
        assert click_path in inline_editing
    assert "const buttonContainer = actionLayout.actionHost;" in card
    for action_path in ("regionBtn", "AuctionRegionPacket.openForAuction", "headerBidSheet", "buttons.forEach", "siteVisitButton"):
        assert action_path in card
    assert "packetBtn" not in card, "the retired duplicate Decision Packet action must not return beside 판단 보드"
    assert "btn.onclick = async" in card
    assert "logicalWidth" in hub
    assert "window.innerWidth" not in card

    script = r'''
const assert = require("node:assert/strict");
globalThis.ProdigyTokens = require("./SYSTEM/Views/design-tokens.js");
const ui = require("./SYSTEM/Views/prodigy-ui.js");

class Element {
  constructor(tag = "root", options = {}) {
    this.tag = tag;
    this.options = options;
    this.children = [];
    this.attributes = {};
    this.classList = { add: (...names) => { this.classNames = names; } };
  }
  createEl(tag, options = {}) {
    const child = new Element(tag, options);
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

const actionIds = ["decision_packet", "bid_sheet", "status", "site_visit"];
const compact = ui.auctionActionRow(new Element(), 390);
assert.equal(compact.mode, "inline");
assert.equal(compact.actionHost, compact.row);
assert.equal(compact.row.children.filter((child) => child.tag === "details").length, 0);
for (const id of actionIds) compact.actionHost.createEl("button", { attr: { "data-action": id } });
assert.deepEqual(
  compact.actionHost.children.map((child) => child.options.attr["data-action"]),
  actionIds
);

const wide = ui.auctionActionRow(new Element(), 1024);
assert.equal(wide.mode, "inline");
assert.equal(wide.actionHost, wide.row);
assert.equal(wide.row.children.filter((child) => child.tag === "details").length, 0);
'''
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr


if __name__ == "__main__":
    test_compact_action_menu_preserves_inline_editing_and_wide_actions()
    print("auction mobile compatibility tests passed")
