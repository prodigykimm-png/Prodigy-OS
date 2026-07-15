from pathlib import Path
import json
import subprocess


ROOT = Path(__file__).resolve().parents[6]
DATA_SCRIPT = ROOT / "SYSTEM/Views/site-visit-data.js"
WORKFLOW_SCRIPT = ROOT / "SYSTEM/Views/site-visit-workflow.js"
CARD_SCRIPT = ROOT / "SYSTEM/Views/auction-card.js"
DASHBOARD = ROOT / "HUB/10 Auction.md"
TEMPLATE = ROOT / "SYSTEM/TEMPLATE/FORMAT/template_auction_case.md"


def run_node(source: str) -> dict:
    result = subprocess.run(["node", "-e", source], capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def test_site_visit_state_is_internal_and_report_preserves_properties():
    before = "---\ntype: auction_case\nstatus: bidding\nsite_visit_date:\n---\n# Site Visit\n\nExisting note.\n\n# Investment Decision\n"
    script = "\n".join([
        "global.window = {};",
        f"eval(require('fs').readFileSync({json.dumps(str(DATA_SCRIPT))}, 'utf8'));",
        "const api = window.prodigySiteVisit;",
        f"const before = {json.dumps(before)};",
        "const state = api.createState('아파트');",
        "state.checklist.Environment = 'checked';",
        "state.checklist['Building Condition'] = 'na';",
        "state.notes = ['마커 <!-- PRODIGY_SITE_VISIT_REPORT_END --> 와 주석 --> 확인'];",
        "const withState = api.updateStateInContent(before, state);",
        "const report = api.buildReport(state, Object.fromEntries(api.commonItems.map((x) => [x, x])), '2026-07-15');",
        "const after = api.completeVisitInContent(withState, state, report);",
        "const completedWithNa = api.createState('');",
        "Object.keys(completedWithNa.checklist).forEach((key) => { completedWithNa.checklist[key] = 'na'; });",
        "console.log(JSON.stringify({complete: api.isComplete(state), completedWithNa: api.isComplete(completedWithNa), progress: api.progress(state), propertiesUnchanged: after.includes('status: bidding') && after.includes('site_visit_date:'), existingContentPreserved: after.includes('Existing note.'), reportInserted: after.includes('## 현장 방문 요약') && after.includes('### 예상 밖 발견') && after.includes('### 사진'), stateIntact: api.readState(after).notes[0].includes('-->'), encodedState: after.includes('v1:%7B'), escapedReport: after.includes('&lt;!-- PRODIGY_SITE_VISIT_REPORT_END --&gt;'), reportEndCount: (after.match(/<!-- PRODIGY_SITE_VISIT_REPORT_END -->/g) || []).length, duplicateReport: api.updateReportInContent(after, report).match(/PRODIGY_SITE_VISIT_REPORT_START/g).length}));",
    ])
    result = run_node(script)
    assert result["complete"] is False
    assert result["completedWithNa"] is True
    assert result["progress"]["done"] == 2
    assert result["propertiesUnchanged"] is True
    assert result["existingContentPreserved"] is True
    assert result["reportInserted"] is True
    assert result["stateIntact"] is True
    assert result["encodedState"] is True
    assert result["escapedReport"] is True
    assert result["reportEndCount"] == 1
    assert result["duplicateReport"] == 1


def test_site_visit_scripts_have_valid_javascript_syntax():
    for path in [DATA_SCRIPT, WORKFLOW_SCRIPT, CARD_SCRIPT]:
        subprocess.run(["node", "--check", str(path)], check=True)


def test_legacy_site_visit_report_heading_is_supported():
    source = DATA_SCRIPT.read_text(encoding="utf-8")
    assert "현장 방문|Site Visit(?: Report)?" in source


def test_template_site_visit_accepts_internal_state_and_report():
    template = TEMPLATE.read_text(encoding="utf-8")
    script = "\n".join([
        "global.window = {};",
        f"eval(require('fs').readFileSync({json.dumps(str(DATA_SCRIPT))}, 'utf8'));",
        "const api = window.prodigySiteVisit;",
        f"const before = {json.dumps(template)};",
        "const state = api.createState('상가');",
        "const withState = api.updateStateInContent(before, state);",
        "const report = api.buildReport(state, {}, '2026-07-15');",
        "const after = api.updateReportInContent(withState, report);",
        "console.log(JSON.stringify({",
        "  stateInserted: after.includes('PRODIGY_SITE_VISIT_STATE'),",
        "  reportInserted: after.includes('## 현장 방문 요약'),",
        "  decisionLogPreserved: after.includes('# 판단 기록'),",
        "  propertyBlockPreserved: after.slice(0, after.indexOf('\\n---\\n', 4) + 5) === before.slice(0, before.indexOf('\\n---\\n', 4) + 5)",
        "}));",
    ])
    result = run_node(script)
    assert result == {
        "stateInserted": True,
        "reportInserted": True,
        "decisionLogPreserved": True,
        "propertyBlockPreserved": True,
    }


def test_property_type_selects_only_relevant_field_items():
    script = "\n".join([
        "global.window = {};",
        f"eval(require('fs').readFileSync({json.dumps(str(DATA_SCRIPT))}, 'utf8'));",
        "const api = window.prodigySiteVisit;",
        "console.log(JSON.stringify({",
        "  officetel: api.normalizeType('오피스텔'),",
        "  industrial: api.normalizeType('지식산업센터'),",
        "  neighborhood: api.normalizeType('근린상가'),",
        "  unknown: api.normalizeType(''),",
        "  unknownItems: api.specificItems[api.normalizeType('')].length",
        "}));",
    ])
    result = run_node(script)
    assert result == {
        "officetel": "apartment",
        "industrial": "factory",
        "neighborhood": "neighborhood",
        "unknown": "generic",
        "unknownItems": 0,
    }


def test_property_type_change_reconciles_checklist_without_losing_observations():
    script = "\n".join([
        "global.window = {};",
        f"eval(require('fs').readFileSync({json.dumps(str(DATA_SCRIPT))}, 'utf8'));",
        "const api = window.prodigySiteVisit;",
        "const state = api.createState('아파트');",
        "state.checklist.Environment = 'checked';",
        "state.checklist['Unit Layout'] = 'checked';",
        "state.notes = ['도로 소음'];",
        "const next = api.reconcileState(state, '토지');",
        "console.log(JSON.stringify({",
        "  commonState: next.checklist.Environment,",
        "  oldSpecificRemoved: !Object.hasOwn(next.checklist, 'Unit Layout'),",
        "  newSpecificAdded: next.checklist['Road Access'],",
        "  notes: next.notes",
        "}));",
    ])
    result = run_node(script)
    assert result["commonState"] == "checked"
    assert result["oldSpecificRemoved"] is True
    assert result["newSpecificAdded"] == "unchecked"
    assert result["notes"] == ["도로 소음"]


def test_dashboard_button_is_korean_and_bidding_only():
    source = CARD_SCRIPT.read_text(encoding="utf-8")
    assert 'p.status === "bidding" && window.openAuctionSiteVisit' in source
    assert "현장 방문 체크리스트 (완료)" in source
    assert "현장 방문 체크리스트 (${progress.done} / ${progress.total})" in source
    assert "Site Visit Complete" not in source


def test_dashboard_dataview_query_and_legacy_count_rule_are_preserved():
    source = DASHBOARD.read_text(encoding="utf-8")
    assert 'dv.pages(\'"PARA/PROJECTS/Auction"\').where(p => p.type === "auction_case")' in source
    assert 'if (!svd || svd === "정보 없음" || String(svd).trim() === "")' in source
    assert "workflowComplete" not in source


def test_field_companion_ui_uses_korean_labels_and_internal_storage():
    workflow_source = WORKFLOW_SCRIPT.read_text(encoding="utf-8")
    data_source = DATA_SCRIPT.read_text(encoding="utf-8")
    for label in ["공통 현장 체크리스트", "물건 유형별 체크리스트", "짧은 현장 메모", "예상 밖 발견", "현장 방문 완료"]:
        assert label in workflow_source
    for state_label in ["미확인", "확인", "해당 없음"]:
        assert state_label in workflow_source
    assert "PRODIGY_SITE_VISIT_STATE" in data_source
    assert "processFrontMatter" not in workflow_source


def test_photo_and_unexpected_navigation_stays_inside_popup():
    source = WORKFLOW_SCRIPT.read_text(encoding="utf-8")
    assert 'this.openObjectSection(["현장 방문", "임장", "Site Visit", "Site Visit Report"])' in source
    assert 'this.scrollToPopupSection("photos")' in source
    assert 'this.scrollToPopupSection("unexpected")' in source
    assert 'this.sectionEls.unexpected = section' in source
    assert 'this.sectionEls.photos = section' in source
    assert 'section.scrollIntoView({ behavior: "smooth", block: "start" })' in source


def test_site_visit_object_opens_in_split_pane():
    source = WORKFLOW_SCRIPT.read_text(encoding="utf-8")
    assert "this.dashboardLeaf = app.workspace.getMostRecentLeaf()" in source
    assert 'createLeafBySplit(dashboardLeaf, "vertical", false)' in source
    assert "rightLeaf.openFile(this.file, { active: true })" in source
    assert "setActiveLeaf(rightLeaf, { focus: true })" in source
    assert 'openLinkText(`${this.file.basename}#${heading}`, this.file.path, false)' in source
    assert "this.close()" in source


if __name__ == "__main__":
    test_site_visit_state_is_internal_and_report_preserves_properties()
    test_site_visit_scripts_have_valid_javascript_syntax()
    test_legacy_site_visit_report_heading_is_supported()
    test_template_site_visit_accepts_internal_state_and_report()
    test_property_type_selects_only_relevant_field_items()
    test_property_type_change_reconciles_checklist_without_losing_observations()
    test_dashboard_button_is_korean_and_bidding_only()
    test_dashboard_dataview_query_and_legacy_count_rule_are_preserved()
    test_field_companion_ui_uses_korean_labels_and_internal_storage()
    test_photo_and_unexpected_navigation_stays_inside_popup()
    test_site_visit_object_opens_in_split_pane()
    print("Site Visit workflow tests passed")
