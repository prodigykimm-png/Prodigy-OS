import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
HUB = ROOT / "HUB" / "10 Auction.md"
SHARED = ROOT / "SYSTEM" / "Views" / "shared-dashboard.js"
AUCTION_CARD = ROOT / "SYSTEM" / "Views" / "auction-card.js"


def test_mobile_dataview_collections_are_normalized_before_for_each():
    hub = HUB.read_text(encoding="utf-8")
    shared = SHARED.read_text(encoding="utf-8")

    assert "toPlainArray(cases).forEach" in hub, (
        "Auction Today must normalize Dataview collections before iteration on mobile"
    )
    assert "toPlainArray(pages).forEach" in shared, (
        "Shared dashboard must normalize Dataview collections before rendering on mobile"
    )


def test_loader_error_exposes_failing_stage_and_message_on_ios():
    hub = HUB.read_text(encoding="utf-8")

    assert "activeLoadPath" in hub
    assert "err.message" in hub
    assert "실패 단계:" in hub


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
    for action_path in ("packetBtn", "dayBtn", "buttons.forEach", "siteVisitButton"):
        assert action_path in card
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
assert.equal(compact.mode, "overflow");
assert.equal(compact.row.children.filter((child) => child.tag === "details").length, 1);
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
