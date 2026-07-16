#!/bin/bash
# transition-spec.sh — Enforces valid spec status transitions with timestamps and directory moves
# Usage: ./transition-spec.sh <spec-file> <new-status>
# Valid transitions:
#   specifying -> ready-to-implement      (human approves spec)          stays in todo/    [runs validate-spec.sh --require-plan]
#   specifying -> on-hold                 (human defers spec)            stays in todo/
#   specifying -> rejected                (human rejects spec)           moves to rejected/
#   ready-to-implement -> specifying      (spec needs rework)            stays in todo/
#   ready-to-implement -> rejected        (human rejects approved spec)  moves to rejected/
#   ready-to-implement -> implementation-in-progress  (human starts)     moves to in-progress/
#   implementation-in-progress -> implemented          (gate passes)     stays in in-progress/
#   implementation-in-progress -> specifying           (needs rework)    moves back to todo/
#   implemented -> done                   (human says DONE)              moves to done/
#   on-hold -> specifying                 (resume deferred spec)         stays in todo/
#   on-hold -> rejected                   (human rejects deferred spec)  moves to rejected/
#   rejected -> specifying                (resurrect rejected spec)      moves back to todo/
#
# origin_spec handling:
#   If origin_spec is set, validate it points to an existing spec file.
#   When a split spec (origin_spec set) transitions to ready-to-implement,
#   warn if sibling specs from the same split are not also ready.

SPEC_FILE="$1"
NEW_STATUS="$2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# In-place sed that works on both BSD/macOS and GNU/Linux
sed_inplace() {
    sed -i.bak "$1" "$2" && rm -f "$2.bak"
}

if [ -z "$SPEC_FILE" ] || [ -z "$NEW_STATUS" ]; then
    echo "Usage: transition-spec.sh <spec-file> <new-status>" >&2
    echo "Valid statuses: specifying, ready-to-implement, on-hold, implementation-in-progress, implemented, done, rejected" >&2
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

# Validate transition and determine target directory (empty = no move)
TARGET_DIR=""
case "${CURRENT_STATUS}->${NEW_STATUS}" in
    "specifying->ready-to-implement")                  ;;
    "specifying->on-hold")                             ;;
    "specifying->rejected")                            TARGET_DIR="rejected" ;;
    "ready-to-implement->specifying")                  ;;
    "ready-to-implement->rejected")                    TARGET_DIR="rejected" ;;
    "ready-to-implement->implementation-in-progress")  TARGET_DIR="in-progress" ;;
    "implementation-in-progress->implemented")         ;;
    "implementation-in-progress->specifying")          TARGET_DIR="todo" ;;
    "implemented->done")                               TARGET_DIR="done" ;;
    "on-hold->specifying")                             ;;
    "on-hold->rejected")                               TARGET_DIR="rejected" ;;
    "rejected->specifying")                            TARGET_DIR="todo" ;;
    *)
        echo "❌ Invalid transition: $CURRENT_STATUS -> $NEW_STATUS" >&2
        echo "Valid transitions:" >&2
        echo "  specifying -> ready-to-implement | on-hold | rejected" >&2
        echo "  ready-to-implement -> specifying | implementation-in-progress | rejected" >&2
        echo "  implementation-in-progress -> implemented | specifying" >&2
        echo "  implemented -> done" >&2
        echo "  on-hold -> specifying | rejected" >&2
        echo "  rejected -> specifying" >&2
        exit 1
        ;;
esac

# Approval gate: a spec only becomes ready-to-implement after passing full validation,
# Implementation Plan included. The status is the validation stamp the implement skill trusts.
if [ "$NEW_STATUS" = "ready-to-implement" ]; then
    if ! "$SCRIPT_DIR/validate-spec.sh" "$SPEC_FILE" --require-plan; then
        echo "❌ Approval blocked: fix the validation issues above, then re-run the transition" >&2
        exit 1
    fi
fi

TIMESTAMP=$(date +"%Y-%m-%d %H:%M")

# Specs always live directly under docs/backlog/<todo|in-progress|done|rejected>/
BACKLOG_ROOT=$(dirname "$(dirname "$SPEC_FILE")")

# Validate origin_spec if set
ORIGIN_SPEC=$(grep -m1 "^origin_spec:" "$SPEC_FILE" | sed 's/^origin_spec:[[:space:]]*//')
if [ -n "$ORIGIN_SPEC" ]; then
    ORIGIN_PATH=""
    for subdir in todo in-progress done rejected; do
        if [ -f "$BACKLOG_ROOT/$subdir/$ORIGIN_SPEC" ]; then
            ORIGIN_PATH="$BACKLOG_ROOT/$subdir/$ORIGIN_SPEC"
            break
        fi
    done
    if [ -z "$ORIGIN_PATH" ]; then
        echo "⚠️  Warning: origin_spec '$ORIGIN_SPEC' does not point to an existing spec file" >&2
    fi
fi

# Update status
sed_inplace "s/^status:.*$/status: $NEW_STATUS/" "$SPEC_FILE"

# Update corresponding timestamp
case "$NEW_STATUS" in
    "ready-to-implement")             sed_inplace "s/^approved_at:.*$/approved_at: $TIMESTAMP/" "$SPEC_FILE" ;;
    "implementation-in-progress")     sed_inplace "s/^started_at:.*$/started_at: $TIMESTAMP/" "$SPEC_FILE" ;;
    "implemented")                    sed_inplace "s/^implemented_at:.*$/implemented_at: $TIMESTAMP/" "$SPEC_FILE" ;;
    "done")                           sed_inplace "s/^done_at:.*$/done_at: $TIMESTAMP/" "$SPEC_FILE" ;;
    "rejected")                       sed_inplace "s/^rejected_at:.*$/rejected_at: $TIMESTAMP/" "$SPEC_FILE" ;;
esac

# Move file to target directory if transition requires it
if [ -n "$TARGET_DIR" ]; then
    DEST_DIR="$BACKLOG_ROOT/$TARGET_DIR"
    FILENAME=$(basename "$SPEC_FILE")
    mkdir -p "$DEST_DIR"
    mv "$SPEC_FILE" "$DEST_DIR/$FILENAME"
    echo "✅ $FILENAME: $CURRENT_STATUS -> $NEW_STATUS (moved to $TARGET_DIR/)"
else
    echo "✅ $SPEC_FILE: $CURRENT_STATUS -> $NEW_STATUS"
fi
