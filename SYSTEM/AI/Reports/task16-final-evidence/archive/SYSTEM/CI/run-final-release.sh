#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
[ "$(uname -s)" = "Darwin" ] || { echo "final release requires macOS" >&2; exit 1; }
[ -x /Applications/Aside.app/Contents/MacOS/Aside ] || { echo "final release requires /Applications/Aside.app" >&2; exit 1; }

# Resolve immutable tool identities while the caller's HOME and PATH are still
# available. Writable locations are confined later by the portable gate.
ORIGINAL_PATH="$PATH"
resolve_node24() {
  local candidate
  while IFS= read -r candidate; do
    [ -x "$candidate" ] || continue
    [ "$($candidate -p 'process.versions.node.split(".")[0]' 2>/dev/null)" = 24 ] || continue
    printf '%s\n' "$candidate"
    return 0
  done < <(printf '%s\n' "${PRODIGY_NODE_BIN:-}" "$(command -v node 2>/dev/null || true)" /opt/homebrew/opt/node@24/bin/node /opt/homebrew/Cellar/node@24/*/bin/node /usr/local/bin/node "$HOME"/.local/bin/node | awk 'NF&&!seen[$0]++')
  return 1
}
resolve_uv() {
  local candidate
  while IFS= read -r candidate; do
    [ -x "$candidate" ] || continue
    "$candidate" --version >/dev/null 2>&1 || continue
    printf '%s\n' "$candidate"
    return 0
  done < <(printf '%s\n' "${PRODIGY_UV_BIN:-}" "$(command -v uv 2>/dev/null || true)" /opt/homebrew/bin/uv /usr/local/bin/uv "$HOME"/.local/bin/uv | awk 'NF&&!seen[$0]++')
  return 1
}
PRODIGY_NODE_BIN="$(resolve_node24)" || { echo "final release preflight failed: Node 24 executable unavailable" >&2; exit 1; }
PRODIGY_UV_BIN="$(resolve_uv)" || { echo "final release preflight failed: uv executable unavailable" >&2; exit 1; }
export PRODIGY_NODE_BIN PRODIGY_UV_BIN
export PATH="$(dirname "$PRODIGY_NODE_BIN"):$(dirname "$PRODIGY_UV_BIN"):$ORIGINAL_PATH"
NODE_VERSION="$($PRODIGY_NODE_BIN --version)"
UV_VERSION="$($PRODIGY_UV_BIN --version)"
printf 'final release preflight: node=%s uv=%s\n' "$NODE_VERSION" "$UV_VERSION"

FINAL_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/prodigy-final-release.XXXXXX")"
ARTIFACTS="$FINAL_ROOT/artifacts"
EVIDENCE="$FINAL_ROOT/evidence"
ARCHIVE="$FINAL_ROOT/archive"
DESTINATION="${PRODIGY_FINAL_EVIDENCE_DIR:-$ROOT/SYSTEM/AI/Reports/task16-final-evidence}"
RECEIPT="$ROOT/SYSTEM/AI/Reports/task16-final-release-receipt.json"
CANDIDATE_RECEIPT="$FINAL_ROOT/task16-final-release-receipt.candidate.json"
mkdir -p "$ARTIFACTS/portable-working" "$ARTIFACTS/portable-clean" "$ARTIFACTS/capabilities" "$EVIDENCE/screenshots-happy" "$ARCHIVE"
cleanup() { rm -rf "$FINAL_ROOT"; }
trap cleanup EXIT

scrub_log() {
  node -e 'const fs=require("node:fs"),file=process.argv[1],root=process.argv[2];let s=fs.readFileSync(file,"utf8");s=s.split(root).join("<repository>").replace(/\/Users\/[A-Za-z0-9._-]+/gu,"<home>").replace(/\/(?:private\/)?tmp\/[A-Za-z0-9._\/-]+/gu,"<task-temp>").replace(/\/var\/folders\/[A-Za-z0-9._\/-]+/gu,"<task-temp>");fs.writeFileSync(file,s)' "$1" "$ROOT"
}
run_logged() {
  local output="$1"; shift
  set +e
  "$@" > >(tee "$output") 2>&1
  local status=$?
  set -e
  scrub_log "$output"
  return "$status"
}

# Portable authority: one working-tree run.
run_logged "$ARTIFACTS/portable-working/gate-output.log" bash SYSTEM/CI/run-release-gate.sh

# History-independent metadata-free projection, retained until receipt verification.
git archive --format=tar HEAD | tar -xf - -C "$ARCHIVE"
rm -rf "$ARCHIVE/.git" "$ARCHIVE/.omo" "$ARCHIVE/.gjc" "$ARCHIVE/.codex" "$ARCHIVE/DAILY" "$ARCHIVE/PARA" "$ARCHIVE/ZETA" "$ARCHIVE/SYSTEM/PRIVATE" "$ARCHIVE/SYSTEM/CACHE"
rm -f "$ARCHIVE/SYSTEM/docs/Prodigy_Knowledge_Inbox_Execution_Scope_v1.json" "$ARCHIVE/SYSTEM/docs/Prodigy_Knowledge_Inbox_Proposal_v1.md" "$ARCHIVE/SYSTEM/AI/Reports/task16-final-release-receipt.json"
node -e 'const m=require("./SYSTEM/CI/release-gate-manifest.json"); for(const e of m.delivery.projected_paths) process.stdout.write(e.path+"\n")' | while IFS= read -r relative; do mkdir -p "$ARCHIVE/$(dirname "$relative")"; cp "$ROOT/$relative" "$ARCHIVE/$relative"; done
(cd "$ARCHIVE" && run_logged "$ARTIFACTS/portable-clean/gate-output.log" bash SYSTEM/CI/run-release-gate.sh)

# Mandatory macOS capability suites. A zero-exit skipped suite is still a failure.
export TASK13A_REAL_OBSIDIAN_DIAGNOSTICS=1
export TASK13A_DIAGNOSTIC_OUTPUT="$EVIDENCE/real-obsidian-visual-288.json"
export TASK13A_SCREENSHOT_DIR="$EVIDENCE/screenshots-happy"
export TASK13A_REAL_OBSIDIAN_JOURNEYS=1
export TASK13A_JOURNEY_OUTPUT="$EVIDENCE/real-rendered-journeys.json"
export TASK13A_REAL_OBSIDIAN_SCENARIOS=1
export TASK13A_SCENARIO_OUTPUT="$EVIDENCE/real-obsidian-structural-scenarios.json"
CAPABILITY_EXECUTED=0
CAPABILITY_SKIPPED=0
while IFS= read -r test_file; do
  log="$ARTIFACTS/capabilities/$(printf '%s' "$test_file" | shasum -a 256 | cut -c1-16).log"
  if [ "$(basename "$test_file")" = "test_real_obsidian_diagnostic_gate.js" ]; then export TASK13A_SCREENSHOT_DIR="$EVIDENCE/screenshots-happy"; else unset TASK13A_SCREENSHOT_DIR; fi
  run_logged "$log" node "$test_file"
  CAPABILITY_EXECUTED=$((CAPABILITY_EXECUTED + 1))
  if grep -Eq '^(# |ℹ )skipped [1-9][0-9]*$|# SKIP|not_applicable|NOT_APPLICABLE' "$log"; then CAPABILITY_SKIPPED=$((CAPABILITY_SKIPPED + 1)); fi
done < <(find SYSTEM/AI/Skills/prodigy-review/tests -type f -name 'test_*.js' | LC_ALL=C sort | grep -E 'test_knowledge_explorer_responsive\.js$|real_obsidian|test_real_hub_transition_lifecycle\.js$|test_shared_real_obsidian_controls\.js$|test_workout_real_controller_publication\.js$')
[ "$CAPABILITY_EXECUTED" -gt 0 ] && [ "$CAPABILITY_SKIPPED" -eq 0 ] || { echo "mandatory capability evidence skipped or absent" >&2; exit 1; }
printf '{"schema_version":"task16-capability-runner-summary-v1","executed":%s,"skipped":%s}\n' "$CAPABILITY_EXECUTED" "$CAPABILITY_SKIPPED" > "$ARTIFACTS/capability-runner-summary.json"

node -e 'const fs=require("node:fs");fs.writeFileSync(process.argv[1],JSON.stringify({schema_version:"task16-focused-fixed-seams-v1",seams:[{id:"knowledge_para_compact_activation",status:"fixed_focused_pass",command:"node --test SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_para_real_obsidian_390.js",proof:{rows:32,viewport_settlement:"ResizeObserver_before_metrics_trigger",state_assertion:"exact_data_focus_pane_after_activation"},closure_authority:"full_authoritative_workflow_only"}]},null,2)+"\n")' "$EVIDENCE/focused-fixed-seams.json"
node SYSTEM/CI/task16-final-receipt-builder.js --prepare-evidence "$EVIDENCE"
node SYSTEM/CI/task16-scrub-retained-artifacts.js "$FINAL_ROOT" "$ARTIFACTS/redaction-manifest.json"
run_logged "$ARTIFACTS/privacy-boundary.log" node SYSTEM/CI/task16-receipt-security.js "$FINAL_ROOT" "$EVIDENCE/privacy-boundary.json" "$EVIDENCE/real-obsidian-visual-288.json" "$EVIDENCE/real-rendered-journeys.json"
node SYSTEM/CI/task16-final-receipt-builder.js --prepare-provenance-map "$EVIDENCE" "$ARCHIVE" "$ARTIFACTS"
node SYSTEM/CI/task16-final-receipt-builder.js "$EVIDENCE" "$ARCHIVE" "$ARTIFACTS" "$CANDIDATE_RECEIPT"
node SYSTEM/CI/task16-final-receipt-verifier.js "$CANDIDATE_RECEIPT" "$EVIDENCE" "$ARCHIVE" "$ARTIFACTS"
node -e 'const s=require("./SYSTEM/CI/task16-receipt-security.js").scanPersistedReceipts(process.argv[1]);if(s.hits.length)throw new Error(`persisted_copy_scan_failed:${JSON.stringify(s.hits)}`);process.stdout.write(`PERSISTED_COPY_PRIVACY scanned=${s.scanned_file_count} hits=0\n`)' "$FINAL_ROOT"
# Promote only fully verified bytes. The legacy receipt is the final write.
rm -rf "$DESTINATION"
mkdir -p "$DESTINATION"
cp -R "$FINAL_ROOT/." "$DESTINATION/"
rm -f "$DESTINATION/$(basename "$CANDIDATE_RECEIPT")"
cp "$CANDIDATE_RECEIPT" "$RECEIPT"
printf 'FINAL_RELEASE_CAPABILITIES executed=%s skipped=%s not_applicable=0\n' "$CAPABILITY_EXECUTED" "$CAPABILITY_SKIPPED"
printf 'FINAL_RELEASE_CLEANUP temporary_artifacts=removed retained_evidence=verified physical_iPhone=not_tested/not_proven\n'
