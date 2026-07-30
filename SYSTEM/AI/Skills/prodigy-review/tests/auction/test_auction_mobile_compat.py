from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
HUB = ROOT / "HUB" / "10 Auction.md"
SHARED = ROOT / "SYSTEM" / "Views" / "shared-dashboard.js"


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
