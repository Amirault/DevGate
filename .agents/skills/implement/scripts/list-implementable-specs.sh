#!/bin/bash
# list-implementable-specs.sh — Lists specs ready for implementation
# Usage: ./list-implementable-specs.sh [--project <project-name>]
# Output: JSON array of specs with metadata
# Exit 0 = at least one spec found, Exit 1 = none found

# Resolve project root (4 levels up from this script: scripts/ -> implement/ -> skills/ -> .agents/ -> root)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

PROJECT_FILTER=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --project)
            PROJECT_FILTER="$2"
            shift 2
            ;;
        *)
            echo "Usage: list-implementable-specs.sh [--project <project-name>]" >&2
            exit 1
            ;;
    esac
done

RESULTS="[]"

scan_dir() {
    local dir="$1"
    local location="$2"

    if [ ! -d "$dir" ]; then
        return
    fi

    for spec in "$dir"/*.md; do
        [ -f "$spec" ] || continue

        local status
        status=$(grep -m1 "^status:" "$spec" | sed 's/^status:[[:space:]]*//')

        # Include implementation-in-progress (from in-progress/) and ready-to-implement (from todo/)
        if [ "$status" != "implementation-in-progress" ] && [ "$status" != "ready-to-implement" ]; then
            continue
        fi

        # Filter by project if specified
        if [ -n "$PROJECT_FILTER" ]; then
            local project
            project=$(grep -m1 "^project:" "$spec" | sed 's/^project:[[:space:]]*//')
            if [ "$project" != "$PROJECT_FILTER" ]; then
                continue
            fi
        fi

        local project size title filename
        project=$(grep -m1 "^project:" "$spec" | sed 's/^project:[[:space:]]*//')
        size=$(grep -m1 "^size:" "$spec" | sed 's/^size:[[:space:]]*//')
        title=$(grep -m1 "^# Spec:" "$spec" | sed 's/^# Spec:[[:space:]]*//')
        filename=$(basename "$spec")

        RESULTS=$(echo "$RESULTS" | jq \
            --arg path "$spec" \
            --arg filename "$filename" \
            --arg title "$title" \
            --arg status "$status" \
            --arg project "$project" \
            --arg size "$size" \
            --arg location "$location" \
            '. + [{path: $path, filename: $filename, title: $title, status: $status, project: $project, size: $size, location: $location}]')
    done
}

scan_dir "$PROJECT_ROOT/docs/backlog/in-progress" "in-progress"
scan_dir "$PROJECT_ROOT/docs/backlog/todo" "todo"

COUNT=$(echo "$RESULTS" | jq '. | length')

if [ "$COUNT" -eq 0 ]; then
    echo "⚠️  No implementable specs found (no 'implementation-in-progress' in in-progress/ or 'ready-to-implement' in todo/)" >&2
    exit 1
fi

echo "$RESULTS" | jq .
exit 0
