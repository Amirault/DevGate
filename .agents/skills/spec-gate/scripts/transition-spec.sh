#!/bin/bash
# transition-spec.sh — Enforces valid spec status transitions with timestamps
# Usage: ./transition-spec.sh <spec-file> <new-status>
# Valid transitions:
#   specifying -> ready-to-implement      (human approves spec)
#   specifying -> on-hold                 (human defers spec)
#   ready-to-implement -> specifying      (spec needs rework)
#   ready-to-implement -> implementation-in-progress  (human starts implementation)
#   implementation-in-progress -> implemented          (implementation-gate passes)
#   implemented -> done                   (human says DONE)
#   on-hold -> specifying                 (resume deferred spec)

SPEC_FILE="$1"
NEW_STATUS="$2"

if [ -z "$SPEC_FILE" ] || [ -z "$NEW_STATUS" ]; then
    echo "Usage: transition-spec.sh <spec-file> <new-status>" >&2
    echo "Valid statuses: specifying, ready-to-implement, on-hold, implementation-in-progress, implemented, done" >&2
    exit 1
fi

if [ ! -f "$SPEC_FILE" ]; then
    echo "Error: Spec file not found: $SPEC_FILE" >&2
    exit 1
fi

CURRENT_STATUS=$(grep -m1 "^status:" "$SPEC_FILE" | sed 's/^status:[[:space:]]*//')

if [ -z "$CURRENT_STATUS" ]; then
    echo "Error: No status field found in $SPEC_FILE" >&2
    exit 1
fi

# Validate transition
case "${CURRENT_STATUS}->${NEW_STATUS}" in
    "specifying->ready-to-implement")             ;;
    "specifying->on-hold")                        ;;
    "ready-to-implement->specifying")             ;;
    "ready-to-implement->implementation-in-progress") ;;
    "implementation-in-progress->implemented")   ;;
    "implementation-in-progress->specifying")     ;;
    "implemented->done")                          ;;
    "on-hold->specifying")                        ;;
    *)
        echo "❌ Invalid transition: $CURRENT_STATUS -> $NEW_STATUS" >&2
        echo "Valid transitions:" >&2
        echo "  specifying -> ready-to-implement" >&2
        echo "  specifying -> on-hold" >&2
        echo "  ready-to-implement -> specifying" >&2
        echo "  ready-to-implement -> implementation-in-progress" >&2
        echo "  implementation-in-progress -> implemented" >&2
        echo "  implementation-in-progress -> specifying" >&2
        echo "  implemented -> done" >&2
        echo "  on-hold -> specifying" >&2
        exit 1
        ;;
esac

TIMESTAMP=$(date +"%Y-%m-%d %H:%M")

# Update status
sed -i '' "s/^status:.*$/status: $NEW_STATUS/" "$SPEC_FILE"

# Update corresponding timestamp
case "$NEW_STATUS" in
    "ready-to-implement")             sed -i '' "s/^approved_at:.*$/approved_at: $TIMESTAMP/" "$SPEC_FILE" ;;
    "implementation-in-progress")     sed -i '' "s/^started_at:.*$/started_at: $TIMESTAMP/" "$SPEC_FILE" ;;
    "implemented")                    sed -i '' "s/^implemented_at:.*$/implemented_at: $TIMESTAMP/" "$SPEC_FILE" ;;
    "done")                           sed -i '' "s/^done_at:.*$/done_at: $TIMESTAMP/" "$SPEC_FILE" ;;
esac

echo "✅ $SPEC_FILE: $CURRENT_STATUS -> $NEW_STATUS"
