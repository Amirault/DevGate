#!/usr/bin/env bash
# capture.sh — run capture-spec-sessions from any cwd (repo root, any subdirectory, a git worktree).
# Usage: capture.sh --spec <slug> --source warp|claude-code|hermes [cli flags...]
#        capture.sh --list
# - Runs the CLI from the project root (the dir containing docs/backlog/), so --list and the
#   default --backlog-root resolve whatever the caller's cwd is.
# - Installs the tool's npm deps on first use: a fresh git worktree carries no node_modules.
# - Resolves node through mise when available: non-interactive shells often have no npx on PATH.
# - Defaults --out to the MAIN worktree's spec-sessions/ store, so a capture made in a
#   disposable worktree survives its removal (the decay-safe merge reads that store).
set -euo pipefail

TOOL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${TOOL_DIR}/../../.." && pwd)"
TOOL_REL=".agents/tools/capture-spec-sessions"

with_node() {
  if command -v mise >/dev/null 2>&1; then
    mise exec -- "$@"
  else
    "$@"
  fi
}

main_worktree_store() {
  local common_dir prefix main_root
  common_dir="$(git -C "${PROJECT_ROOT}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  prefix="$(git -C "${PROJECT_ROOT}" rev-parse --show-prefix 2>/dev/null || true)"
  main_root="$(dirname "${common_dir:-/}")"
  if [[ -n "${common_dir}" && -d "${main_root}/${prefix}${TOOL_REL}" ]]; then
    echo "${main_root}/${prefix}${TOOL_REL}/spec-sessions"
    return
  fi
  echo "${TOOL_DIR}/spec-sessions"
}

cd "${PROJECT_ROOT}"

if [[ ! -x "${TOOL_DIR}/node_modules/.bin/tsx" ]]; then
  echo "capture.sh: installing ${TOOL_REL} dependencies (first run in this checkout)..." >&2
  with_node npm ci --prefix "${TOOL_DIR}" --silent --no-audit --no-fund >&2
fi

needs_default_out=1
for arg in "$@"; do
  case "${arg}" in
    --out | --out=* | --list | -h | --help) needs_default_out=0 ;;
    *) ;;
  esac
done
if [[ "${needs_default_out}" -eq 1 ]]; then
  store="$(main_worktree_store)"
  set -- "$@" --out "${store}"
fi

with_node "${TOOL_DIR}/node_modules/.bin/tsx" "${TOOL_DIR}/src/cli.ts" "$@"
