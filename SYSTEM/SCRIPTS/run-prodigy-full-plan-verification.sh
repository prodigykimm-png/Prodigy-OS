#!/bin/bash
set -o pipefail

PLAN_SLUG="${1:-}"
if [ -z "$PLAN_SLUG" ]; then
  echo "Usage: bash SYSTEM/SCRIPTS/run-prodigy-full-plan-verification.sh <plan-slug>"
  exit 1
fi

EVIDENCE_DIR=".omo/evidence/${PLAN_SLUG}"
mkdir -p "$EVIDENCE_DIR"

FAIL=0
TOTAL=0
PASSED=0

run_cmd() {
  local label="$1"
  shift
  TOTAL=$((TOTAL + 1))
  echo "=== [$label] ==="
  if "$@" > "${EVIDENCE_DIR}/task-25-${label// /_}.log" 2>&1; then
    PASSED=$((PASSED + 1))
    echo "PASS: $label"
  else
    local rc=$?
    FAIL=1
    echo "FAIL: $label (exit $rc)"
  fi
}

# 1. JavaScript syntax check on all Views
echo "--- JS Syntax Check (all Views) ---"
for f in SYSTEM/Views/*.js; do
  TOTAL=$((TOTAL + 1))
  if node --check "$f" 2>/dev/null; then
    PASSED=$((PASSED + 1))
  else
    FAIL=1
    echo "FAIL: node --check $f"
  fi
done

# 2. Run all JavaScript tests
echo "--- JavaScript Tests ---"
JS_TOTAL=0
JS_PASSED=0
while IFS= read -r -d '' f; do
  JS_TOTAL=$((JS_TOTAL + 1))
  TOTAL=$((TOTAL + 1))
  if node "$f" > /dev/null 2>&1; then
    JS_PASSED=$((JS_PASSED + 1))
    PASSED=$((PASSED + 1))
  else
    FAIL=1
    echo "FAIL: $f"
  fi
done < <(find SYSTEM/AI/Skills/prodigy-review/tests -name 'test_*.js' -type f -print0 | sort -z)
echo "JavaScript tests: $JS_PASSED/$JS_TOTAL passed"

# 3. Run all Python tests
echo "--- Python Tests ---"
PY_TOTAL=0
PY_PASSED=0
while IFS= read -r -d '' f; do
  PY_TOTAL=$((PY_TOTAL + 1))
  TOTAL=$((TOTAL + 1))
  if uv run "$f" > /dev/null 2>&1; then
    PY_PASSED=$((PY_PASSED + 1))
    PASSED=$((PASSED + 1))
  else
    FAIL=1
    echo "FAIL: $f"
  fi
done < <(find SYSTEM/AI/Skills/prodigy-review/tests -name 'test_*.py' -type f -print0 | sort -z)
echo "Python tests: $PY_PASSED/$PY_TOTAL passed"

# 4. Property contract audit
run_cmd "property-contract-audit" uv run SYSTEM/AI/Skills/prodigy-property-contract/scripts/audit_property_contract.py --vault . --format text

# 5. Stability smoke
run_cmd "stability-smoke" node SYSTEM/AI/Skills/prodigy-review/tests/run_stability_smoke_tests.js

# 6. Plan audit
run_cmd "plan-audit" node SYSTEM/SCRIPTS/prodigy-plan-audit.js --plan "$PLAN_SLUG" --evidence .omo/evidence --phase ui-lanes --no-physical-claim

# 7. Physical receipt validator (scaffold)
run_cmd "physical-receipt-validator-scaffold" node SYSTEM/SCRIPTS/prodigy-physical-receipt-validator.js .omo/qa-fixtures/well-formed-receipt

# 8. Node --check on all created/modified JS files
echo "--- Node --check (created files) ---"
for f in SYSTEM/SCRIPTS/prodigy-physical-receipt-validator.js SYSTEM/SCRIPTS/run-prodigy-full-plan-verification.sh; do
  if [[ "$f" == *.js ]]; then
    TOTAL=$((TOTAL + 1))
    if node --check "$f" 2>/dev/null; then
      PASSED=$((PASSED + 1))
    else
      FAIL=1
      echo "FAIL: node --check $f"
    fi
  fi
done

# Summary
echo ""
echo "============================================"
echo "TOTAL: $PASSED/$TOTAL passed"
echo "============================================"

if [ "$FAIL" -ne 0 ]; then
  echo "VERDICT: RED — some commands failed"
  exit 1
else
  echo "VERDICT: GREEN — all commands passed"
  exit 0
fi
