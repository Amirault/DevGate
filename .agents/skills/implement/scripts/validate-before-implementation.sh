#!/bin/bash
# validate-before-implementation.sh — Validates a spec is ready for implementation
# Usage: ./validate-before-implementation.sh <path-to-spec-file>
# Exit 0 = ready, Exit 1 = not ready (with details on stderr)
# Stricter than spec-gate's validate-spec.sh: also checks open questions, status, and [TEST] markers

SPEC_FILE="$1"
ERRORS=()
WARNINGS=()

if [ -z "$SPEC_FILE" ] || [ ! -f "$SPEC_FILE" ]; then
    echo "Error: Spec file not found: $SPEC_FILE" >&2
    exit 1
fi

CONTENT=$(cat "$SPEC_FILE")

# --- STATUS CHECK ---
STATUS=$(echo "$CONTENT" | grep -m1 "^status:" | sed 's/^status:[[:space:]]*//')
if [ "$STATUS" != "implementation-in-progress" ]; then
    ERRORS+=("Status is '$STATUS', expected 'implementation-in-progress'")
fi

# --- REQUIRED SECTIONS ---
check_section() {
    local section="$1"
    local pattern="$2"
    if ! echo "$CONTENT" | grep -q "$pattern"; then
        ERRORS+=("Missing section: $section")
        return 1
    fi
    local after
    after=$(echo "$CONTENT" | sed -n "/$pattern/,/^## /p" | tail -n +2 | sed '$d' | tr -d '[:space:]')
    if [ -z "$after" ] || echo "$after" | grep -q '{{'; then
        ERRORS+=("Section '$section' is empty or has unfilled placeholders")
        return 1
    fi
    return 0
}

check_section "Why" "^## Why"
check_section "What" "^## What$"
check_section "Acceptance Criteria" "^## Acceptance Criteria"
check_section "Examples" "^## Examples"
check_section "What NOT" "^## What NOT"
check_section "Breakdown" "^## Breakdown"
check_section "Technical Notes" "^## Technical Notes"
check_section "Implementation Rules" "^## Implementation Rules"

# --- ACCEPTANCE CRITERIA MARKERS ---
TEST_COUNT=$(echo "$CONTENT" | grep -c "\[TEST\]")
MANUAL_COUNT=$(echo "$CONTENT" | grep -c "\[MANUAL\]")
TOTAL_CRITERIA=$((TEST_COUNT + MANUAL_COUNT))

if [ "$TOTAL_CRITERIA" -eq 0 ]; then
    ERRORS+=("Acceptance criteria have no [TEST] or [MANUAL] markers")
fi

# --- EXAMPLES vs CRITERIA ---
CRITERIA_COUNT=$(echo "$CONTENT" | sed -n '/^## Acceptance Criteria/,/^## /p' | grep -c "^- \[")
EXAMPLE_COUNT=$(echo "$CONTENT" | grep -c "^### Example")
if [ "$EXAMPLE_COUNT" -lt "$CRITERIA_COUNT" ]; then
    WARNINGS+=("Fewer examples ($EXAMPLE_COUNT) than acceptance criteria ($CRITERIA_COUNT) — spec recommends at least 1 per criterion + edge cases")
fi

# --- OPEN QUESTIONS ---
UNCHECKED_QUESTIONS=$(echo "$CONTENT" | sed -n '/^## Open Questions/,/^## /p' | grep -c "^- \[ \]")
if [ "$UNCHECKED_QUESTIONS" -gt 0 ]; then
    ERRORS+=("$UNCHECKED_QUESTIONS open question(s) still unresolved")
fi

# --- HEALTH CHECK ---
if echo "$CONTENT" | grep -q "🔴"; then
    ERRORS+=("Health check has 🔴 dimensions — blocked")
fi
if echo "$CONTENT" | grep -q "🟡"; then
    WARNINGS+=("Health check has 🟡 dimensions — proceed with caution")
fi

# --- BREAKDOWN ---
BREAKDOWN_ITEMS=$(echo "$CONTENT" | sed -n '/^## Breakdown/,/^## /p' | grep -c "^- \[")
if [ "$BREAKDOWN_ITEMS" -eq 0 ]; then
    PLAIN_BULLETS=$(echo "$CONTENT" | sed -n '/^## Breakdown/,/^## /p' | grep -c "^- [^\[]") || true
    if [ "$PLAIN_BULLETS" -gt 0 ]; then
        ERRORS+=("Breakdown items must use '- [ ] ...' checkbox format ($PLAIN_BULLETS plain bullet(s) detected — add '[ ]' after each '-')")
    else
        ERRORS+=("Breakdown section has no items")
    fi
fi

# --- REPORT ---
echo "=== Spec Implementation Readiness ==="
echo "File: $SPEC_FILE"
echo "Status: $STATUS"
echo "Criteria: $TEST_COUNT [TEST] + $MANUAL_COUNT [MANUAL] = $TOTAL_CRITERIA total"
echo "Examples: $EXAMPLE_COUNT"
echo "Breakdown items: $BREAKDOWN_ITEMS"

if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  Warnings (${#WARNINGS[@]}):"
    for warn in "${WARNINGS[@]}"; do
        echo "  - $warn"
    done
fi

if [ ${#ERRORS[@]} -eq 0 ]; then
    echo ""
    echo "✅ Spec is ready for implementation"
    exit 0
else
    echo ""
    echo "❌ NOT ready for implementation (${#ERRORS[@]} blocker(s)):" >&2
    for err in "${ERRORS[@]}"; do
        echo "  - $err" >&2
    done
    exit 1
fi
