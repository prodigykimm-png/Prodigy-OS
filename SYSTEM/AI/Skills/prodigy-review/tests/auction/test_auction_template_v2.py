from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[6]
TEMPLATE = ROOT / "SYSTEM" / "TEMPLATE" / "FORMAT" / "template_auction_case.md"


def frontmatter(text: str) -> str:
    end = text.find("\n---\n", 4)
    assert text.startswith("---\n") and end >= 0
    return text[: end + 5]


def test_auction_template_preserves_public_frontmatter():
    current = TEMPLATE.read_text(encoding="utf-8")
    baseline = subprocess.check_output(
        ["git", "show", f"HEAD:{TEMPLATE.relative_to(ROOT).as_posix()}"],
        text=True,
        encoding="utf-8",
    )
    assert frontmatter(current) == frontmatter(baseline)


def test_auction_template_uses_investment_decision_body_structure():
    body = TEMPLATE.read_text(encoding="utf-8").split("\n---\n", 1)[1]
    assert re.findall(r"^# ([^#].+)$", body, re.MULTILINE) == [
        "요약",
        "경매 정보",
        "현장 방문",
        "판단 기록",
        "복기",
        "관찰",
        "첨부 자료",
    ]
    for heading in (
        "## 물건 개요",
        "## 입지 분석",
        "## 교통",
        "## 상권",
        "## 시장 분석",
        "## 수요 분석",
        "## 위험 분석",
        "## 기회 요인",
        "## AI 근거 요약",
        "## 공용부",
        "## 예상 밖 발견",
        "## 핵심 교훈",
    ):
        assert heading in body
    assert "Auction Information -> AI -> Evidence" in body
    assert "입찰, 포기 또는 매수를 권고하지 않습니다." in body
    assert "<!-- Card compatibility anchor: # Investment Decision -->" in body
    assert body.index("# 판단 기록") < body.index("# Investment Decision") < body.index("# 복기")
    assert "# Collected Facts" not in body
    assert "# Investment Thesis" not in body
    assert "# Object Summary" not in body
    assert "## Building Analysis" not in body
    assert "## Supply Analysis" not in body
    assert "## Comparable Sales" not in body
    assert "# Status Control" not in body
    assert "meta-bind-button" not in body
    assert "BUTTON[watching" not in body


def test_existing_auction_objects_do_not_contain_status_controls():
    auction_folder = ROOT / "PARA" / "PROJECTS" / "Auction"
    for path in auction_folder.glob("*.md"):
        content = path.read_text(encoding="utf-8")
        assert "# Status Control" not in content, path
        assert "BUTTON[watching, bidding, skipped, won, lost, reviewing, archived]" not in content, path
