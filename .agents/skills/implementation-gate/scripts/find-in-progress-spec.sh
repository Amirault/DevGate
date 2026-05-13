#!/bin/bash
# find-in-progress-spec.sh — Locates the spec file in backlog/in-progress/
# Usage: ./find-in-progress-spec.sh [--project <project-name>]
# Exit 0 = exactly one spec found (prints path), Exit 1 = zero or multiple specs found

BACKLOG_DIR="docs/backlog/in-progress"
PROJECT_FILTER=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --project)
            PROJECT_FILTER="$2"
            shift 2
            ;;
        *)
            echo "Usage: find-in-progress-spec.sh [--project <project-name>]" >&2
            exit 1
            ;;
    esac
done

if [ ! -d "$BACKLOG_DIR" ]; then
    echo "Error: Directory not found: $BACKLOG_DIR" >&2
    exit 1
fi

# Count .md files in in-progress/
SPEC_FILES=($(find "$BACKLOG_DIR" -maxdepth 1 -name "*.md" -type f))

# Filter by project if specified
if [ -n "$PROJECT_FILTER" ]; then
    FILTERED_FILES=()
    for spec in "${SPEC_FILES[@]}"; do
        if grep -q "^project: $PROJECT_FILTER" "$spec" 2>/dev/null; then
            FILTERED_FILES+=("$spec")
        fi
    done
    SPEC_FILES=("${FILTERED_FILES[@]}")
fi

COUNT=${#SPEC_FILES[@]}

case $COUNT in
    0)
        echo "⚠️  No specs found in $BACKLOG_DIR" >&2
        echo "HINT: Expected exactly one spec in 'in-progress/' for review" >&2
        exit 1
        ;;
    1)
        # Success - output the spec path
        echo "${SPEC_FILES[0]}"
        exit 0
        ;;
    *)
        echo "⚠️  Multiple specs found in $BACKLOG_DIR:" >&2
        for spec in "${SPEC_FILES[@]}"; do
            echo "  - $(basename "$spec")" >&2
        done
        echo "HINT: Move all but the current task to 'todo/' or 'done/'" >&2
        exit 1
        ;;
esac
