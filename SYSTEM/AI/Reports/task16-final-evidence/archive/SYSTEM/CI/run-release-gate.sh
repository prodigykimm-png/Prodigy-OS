#!/usr/bin/env bash

set -o pipefail

usage() {
  cat <<'USAGE'
Usage: bash SYSTEM/CI/run-release-gate.sh [--help | --self-test | --sandbox-self-test]

Run the portable Prodigy OS release gate. The gate requires Node.js 24 and uv,
runs every portable command even after a failure, preserves each command's
stdout and stderr, reports macOS/real-Obsidian rows as not applicable, and exits
nonzero if any executed command fails.

Options:
  --help       Show this help and exit.
  --self-test          Inject one synthetic failing command to verify output and exit handling.
  --sandbox-self-test  Prove runtime HOME/cache writes stay in a disposable task root.
USAGE
}

FAILURES=0
TOTAL=0
PASSED=0
SKIPPED=0
NOT_APPLICABLE=0

run_command() {
  local label="$1"
  shift
  TOTAL=$((TOTAL + 1))
  printf '\n=== [%s] ===\n' "$label"
  printf '+ '
  printf '%q ' "$@"
  printf '\n'
  "$@"
  local status=$?
  if [ "$status" -eq 0 ]; then
    PASSED=$((PASSED + 1))
    printf 'PASS: %s\n' "$label"
  else
    FAILURES=$((FAILURES + 1))
    printf 'FAIL: %s (exit %s)\n' "$label" "$status"
  fi
}

summary() {
  printf '\n============================================\n'
  printf 'Release gate: %s/%s executed commands passed\n' "$PASSED" "$TOTAL"
  printf 'Executed: %s\n' "$TOTAL"
  printf 'Skipped: %s\n' "$SKIPPED"
  printf 'Not applicable: %s\n' "$NOT_APPLICABLE"
  printf 'Failures: %s\n' "$FAILURES"
  printf '============================================\n'
  if [ "$FAILURES" -ne 0 ]; then
    printf 'VERDICT: RED\n'
    return 1
  fi
  printf 'VERDICT: GREEN\n'
  return 0
}

case "${1:-}" in
  --help|-h)
    usage
    exit 0
    ;;
  --self-test)
    if [ "$#" -ne 1 ]; then
      usage >&2
      exit 2
    fi
    run_command "synthetic-failure" bash -c 'printf "synthetic stdout\n"; printf "synthetic stderr\n" >&2; exit 23'
    summary
    exit $?
    ;;
  --sandbox-self-test)
    ORIGINAL_HOME="$HOME"
    SANDBOX_TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/prodigy-release-sandbox-test.XXXXXX")" || exit 1
    trap 'rm -rf "$SANDBOX_TEST_ROOT"' EXIT
    export HOME="$SANDBOX_TEST_ROOT/home" TMPDIR="$SANDBOX_TEST_ROOT/tmp" XDG_CACHE_HOME="$SANDBOX_TEST_ROOT/xdg-cache" XDG_CONFIG_HOME="$SANDBOX_TEST_ROOT/xdg-config" npm_config_cache="$SANDBOX_TEST_ROOT/npm" UV_CACHE_DIR="$SANDBOX_TEST_ROOT/uv"
    mkdir -p "$HOME" "$TMPDIR" "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME" "$npm_config_cache" "$UV_CACHE_DIR"
    node -e 'const fs=require("node:fs"),p=require("node:path"); for (const key of ["HOME","TMPDIR","XDG_CACHE_HOME","XDG_CONFIG_HOME","npm_config_cache","UV_CACHE_DIR"]) fs.writeFileSync(p.join(process.env[key], ".sandbox-probe"), key)' || exit 1
    [ ! -e "$ORIGINAL_HOME/.sandbox-probe" ] || { printf 'release sandbox escaped original HOME\n' >&2; exit 1; }
    printf 'Release sandbox self-test passed: external_writes=0 disposable_roots=6\n'
    exit 0
    ;;
  "")
    ;;
  *)
    printf 'Unknown argument: %s\n\n' "$1" >&2
    usage >&2
    exit 2
    ;;
esac

if [ "$#" -ne 0 ]; then
  usage >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
export PYTHONDONTWRITEBYTECODE=1

preflight_fail() {
  printf 'release preflight failed: %s\n' "$1" >&2
  printf 'release preflight accounting: executed=0\n' >&2
  exit 1
}
preflight_tool() {
  local label="$1" binary="$2"
  case "$binary" in /*) ;; *) preflight_fail "$label executable must be absolute" ;; esac
  [ -x "$binary" ] || preflight_fail "$label executable unavailable"
}

NODE_TARGET="${PRODIGY_NODE_BIN:-$(command -v node || true)}"
UV_TARGET="${PRODIGY_UV_BIN:-$(command -v uv || true)}"
PRODIGY_FIND_BIN="${PRODIGY_FIND_BIN:-$(command -v find || true)}"
preflight_tool "Node 24" "$NODE_TARGET"
NODE_PREFLIGHT_MAJOR="$("$NODE_TARGET" -p 'process.versions.node.split(".")[0]' 2>&1)" || preflight_fail "Node 24 executable is not runnable"
[ "$NODE_PREFLIGHT_MAJOR" = 24 ] || preflight_fail "Node 24 executable has wrong major"
preflight_tool "uv" "$UV_TARGET"
UV_PREFLIGHT_VERSION="$("$UV_TARGET" --version 2>&1)" || preflight_fail "uv executable is not runnable"
[ -n "$UV_PREFLIGHT_VERSION" ] || preflight_fail "uv executable returned no version"
preflight_tool "find" "$PRODIGY_FIND_BIN"

RELEASE_GATE_RUN_ID="$("$NODE_TARGET" -p 'require("node:crypto").randomUUID()')" || preflight_fail "Node 24 could not allocate run identity"
RELEASE_GATE_PARENT="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
mkdir -p "$RELEASE_GATE_PARENT" || preflight_fail "release gate parent unavailable"
RELEASE_GATE_ROOT="$(mktemp -d "${RELEASE_GATE_PARENT%/}/prodigy-release-gate.XXXXXX")" || preflight_fail "release gate root unavailable"
RELEASE_GATE_TEMP="$RELEASE_GATE_ROOT/$RELEASE_GATE_RUN_ID"
RUNTIME_SANDBOX="$RELEASE_GATE_TEMP/runtime"
CONFINED_BIN="$RUNTIME_SANDBOX/bin"
mkdir -p "$CONFINED_BIN" "$RUNTIME_SANDBOX"/{home,tmp,xdg-cache,xdg-config,npm-cache,uv-cache} || preflight_fail "release sandbox unavailable"
cleanup() { rm -rf "$RELEASE_GATE_ROOT"; }
trap cleanup EXIT
ln -s "$NODE_TARGET" "$CONFINED_BIN/node" || preflight_fail "confined Node identity unavailable"
ln -s "$UV_TARGET" "$CONFINED_BIN/uv" || preflight_fail "confined uv identity unavailable"
export HOME="$RUNTIME_SANDBOX/home"
export TMPDIR="$RUNTIME_SANDBOX/tmp"
export XDG_CACHE_HOME="$RUNTIME_SANDBOX/xdg-cache"
export XDG_CONFIG_HOME="$RUNTIME_SANDBOX/xdg-config"
export npm_config_cache="$RUNTIME_SANDBOX/npm-cache"
export UV_CACHE_DIR="$RUNTIME_SANDBOX/uv-cache"
export UV_NO_PROGRESS=1
export PATH="$CONFINED_BIN:/usr/bin:/bin:/usr/sbin:/sbin"
export PRODIGY_NODE_BIN="$CONFINED_BIN/node" PRODIGY_UV_BIN="$CONFINED_BIN/uv"
[ "$(command -v node)" = "$PRODIGY_NODE_BIN" ] || preflight_fail "confined Node command identity mismatch"
[ "$(command -v uv)" = "$PRODIGY_UV_BIN" ] || preflight_fail "confined uv command identity mismatch"
CONFINED_NODE_VERSION="$(node --version 2>&1)" || preflight_fail "confined Node executable is not runnable"
CONFINED_NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>&1)" || preflight_fail "confined Node version is unreadable"
[ "$CONFINED_NODE_MAJOR" = 24 ] || preflight_fail "confined Node executable has wrong major"
CONFINED_UV_VERSION="$(uv --version 2>&1)" || preflight_fail "confined uv executable is not runnable"
printf 'release toolchain preflight: node=%s uv=%s environment=confined disposable_roots=6\n' "$CONFINED_NODE_VERSION" "$CONFINED_UV_VERSION"

for required_root in SYSTEM/Views SYSTEM/AI/Skills/prodigy-review/tests SYSTEM/AI/Skills/prodigy-property-contract/scripts SYSTEM/SCRIPTS SYSTEM/CI/fixtures/consolidation; do
  [ -d "$required_root" ] || preflight_fail "missing required root: $required_root"
done
for required_file in \
  SYSTEM/AI/Skills/prodigy-property-contract/scripts/audit_property_contract.py \
  SYSTEM/AI/Skills/prodigy-review/tests/run_stability_smoke_tests.js \
  SYSTEM/CI/validate-consolidation-fixtures.js \
  SYSTEM/CI/release-fixture-harness.js \
  SYSTEM/CI/recovery-proof-harness.js \
  SYSTEM/CI/repository-data-backup.js \
  SYSTEM/AI/Skills/prodigy-review/tests/test_task15_recovery_proof.js \
  SYSTEM/CI/fixtures/release-vault/fixture-manifest.json \
  SYSTEM/CI/fixtures/release-vault/suite-registry.json \
  SYSTEM/SCRIPTS/prodigy-consolidation-plan-audit.js \
  SYSTEM/SCRIPTS/prodigy-consolidation-security-audit.js \
  SYSTEM/SCRIPTS/prodigy-consolidation-visual-receipt.js \
  SYSTEM/SCRIPTS/prodigy-consolidation-final-audit.js; do
  [ -f "$required_file" ] || preflight_fail "missing required file: $required_file"
done

build_inventory() {
  local label="$1"
  local output="$2"
  shift 2
  local raw="$output.raw"
  local errors="$output.stderr"
  if ! "$PRODIGY_FIND_BIN" "$@" -print0 >"$raw" 2>"$errors"; then
    preflight_fail "$label discovery command failed: $(cat "$errors")"
  fi
  if ! LC_ALL=C sort -z "$raw" >"$output"; then
    preflight_fail "$label inventory sort failed"
  fi
  [ -s "$output" ] || preflight_fail "$label inventory is empty"
  if ! node -e '
    const fs = require("node:fs");
    const [file, label] = process.argv.slice(1);
    const paths = fs.readFileSync(file).toString("utf8").split("\0").filter(Boolean);
    const seen = new Set();
    for (const value of paths) {
      if (seen.has(value)) { console.error(`duplicate discovery entry: ${label}: ${value}`); process.exit(1); }
      seen.add(value);
    }
  ' "$output" "$label"; then
    preflight_fail "duplicate discovery entry in $label inventory"
  fi
}

VIEW_INVENTORY="$RELEASE_GATE_TEMP/view-files.zlist"
JS_INVENTORY="$RELEASE_GATE_TEMP/javascript-tests.zlist"
PYTHON_INVENTORY="$RELEASE_GATE_TEMP/python-tests.zlist"
# Canonical source pattern: SYSTEM/Views/*.js
build_inventory "View" "$VIEW_INVENTORY" SYSTEM/Views -maxdepth 1 -type f -name '*.js'
build_inventory "JavaScript" "$JS_INVENTORY" SYSTEM/AI/Skills/prodigy-review/tests -type f -name 'test_*.js'
build_inventory "Python" "$PYTHON_INVENTORY" SYSTEM/AI/Skills/prodigy-review/tests -type f -name 'test_*.py'

printf 'Prodigy OS canonical release gate\n'
printf 'Repository: %s\n' "$REPO_ROOT"
printf 'Run ID: %s\n' "$RELEASE_GATE_RUN_ID"
printf 'Temporary output: %s\n' "$RELEASE_GATE_TEMP"

run_command "node-version" node --version
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>&1)"
if [ "$NODE_MAJOR" != "24" ]; then
  TOTAL=$((TOTAL + 1))
  FAILURES=$((FAILURES + 1))
  printf 'FAIL: node-24-required (found %s)\n' "$NODE_MAJOR"
else
  TOTAL=$((TOTAL + 1))
  PASSED=$((PASSED + 1))
  printf 'PASS: node-24-required\n'
fi

printf '\n--- View syntax checks ---\n'
while IFS= read -r -d '' file; do
  run_command "view-syntax: $file" node --check "$file"
done < "$VIEW_INVENTORY"

is_macos_real_capability() {
  case "$1" in
    *test_knowledge_explorer_responsive.js|*test_*_real_obsidian_*.js|*test_real_obsidian_*.js|*test_real_hub_transition_lifecycle.js|*test_shared_real_obsidian_controls.js|*test_workout_real_controller_publication.js) return 0 ;;
    *) return 1 ;;
  esac
}

printf '\n--- Direct JavaScript tests ---\n'
while IFS= read -r -d '' file; do
  if is_macos_real_capability "$file"; then
    NOT_APPLICABLE=$((NOT_APPLICABLE + 1))
    printf 'NOT_APPLICABLE: javascript-test: %s (requires macOS Aside/real Obsidian final-release workflow)\n' "$file"
  else
    run_command "javascript-test: $file" node "$file"
  fi
done < "$JS_INVENTORY"

printf '\n--- Direct Python tests ---\n'
while IFS= read -r -d '' file; do
  run_command "python-test: $file" uv run "$file"
done < "$PYTHON_INVENTORY"

run_command "property-contract-audit" \
  uv run SYSTEM/AI/Skills/prodigy-property-contract/scripts/audit_property_contract.py \
  --vault . --format text

run_command "stability-smoke" \
  node SYSTEM/AI/Skills/prodigy-review/tests/run_stability_smoke_tests.js

run_command "release-fixture-journeys" \
  node SYSTEM/CI/release-fixture-harness.js --all

run_command "task15-recovery-proof" \
  node SYSTEM/CI/recovery-proof-harness.js --all

run_command "repository-data-backup-drill" \
  node SYSTEM/CI/repository-data-backup.js drill

CONSOLIDATION_FIXTURES="SYSTEM/CI/fixtures/consolidation"
CONSOLIDATION_MANIFEST="$CONSOLIDATION_FIXTURES/fixture-manifest.json"
CONSOLIDATION_PLAN="$CONSOLIDATION_FIXTURES/plan.md"
CONSOLIDATION_OWNERSHIP="$CONSOLIDATION_FIXTURES/ownership-v1.json"
CONSOLIDATION_BASELINE="$CONSOLIDATION_FIXTURES/baseline-v1.json"
CONSOLIDATION_APPROVALS="$CONSOLIDATION_FIXTURES/approval-root"

run_command "consolidation-fixture-manifest" \
  node SYSTEM/CI/validate-consolidation-fixtures.js \
  --fixture-root "$CONSOLIDATION_FIXTURES" \
  --manifest "$CONSOLIDATION_MANIFEST"

run_command "consolidation-plan-audit" \
  node SYSTEM/SCRIPTS/prodigy-consolidation-plan-audit.js \
  --fixture-root "$CONSOLIDATION_FIXTURES" \
  --manifest "$CONSOLIDATION_MANIFEST" \
  --plan "$CONSOLIDATION_PLAN" \
  --ownership "$CONSOLIDATION_OWNERSHIP" \
  --baseline "$CONSOLIDATION_BASELINE" \
  --run-id "$RELEASE_GATE_RUN_ID" \
  --output "$RELEASE_GATE_TEMP/final-F1/receipt.json"

run_command "consolidation-security-audit" \
  node SYSTEM/SCRIPTS/prodigy-consolidation-security-audit.js \
  --fixture-root "$CONSOLIDATION_FIXTURES" \
  --manifest "$CONSOLIDATION_MANIFEST" \
  --plan "$CONSOLIDATION_PLAN" \
  --ownership "$CONSOLIDATION_OWNERSHIP" \
  --baseline "$CONSOLIDATION_BASELINE" \
  --approval-root "$CONSOLIDATION_APPROVALS" \
  --run-id "$RELEASE_GATE_RUN_ID" \
  --output "$RELEASE_GATE_TEMP/final-F2/receipt.json"

run_command "consolidation-visual-receipt" \
  node SYSTEM/SCRIPTS/prodigy-consolidation-visual-receipt.js \
  --fixture-root "$CONSOLIDATION_FIXTURES" \
  --manifest "$CONSOLIDATION_MANIFEST" \
  --run-id "$RELEASE_GATE_RUN_ID" \
  --output "$RELEASE_GATE_TEMP/final-F3/receipt.json"

run_command "consolidation-final-audit" \
  node SYSTEM/SCRIPTS/prodigy-consolidation-final-audit.js \
  --evidence-root "$RELEASE_GATE_TEMP" \
  --run-id "$RELEASE_GATE_RUN_ID" \
  --output "$RELEASE_GATE_TEMP/final-F4/receipt.json"

summary
exit $?
