---
name: deliver-increment
description: "Deliver ONE increment of an approved spec as ONE pull request: implement, refactor and review it in three fresh subagents (review auto-fixes until PASS), commit it on workflow/<spec-slug>-<N>, open its Ask draft PR, then stop and ask whether to continue with the next increment once that PR is merged. Invoke on /deliver-increment <spec> [increment N], 'deliver the next increment', 'implement spec X', 'start implementing this spec'."
effort: high
---

# Deliver Increment

```text
[human] specify → deliver-increment(1) → PR 1 → [human] merge → continue? → deliver-increment(2) → PR 2 → … → last PR → [human] merge + DONE
deliver-increment(N), run inline by the caller (never itself a subagent):
  implement(N) subagent → refactor(N) subagent → review(N) subagent (auto-fix loop) → commit → Ask draft PR → stop and ask
```

One increment = one PR. Each increment has a clear goal, ships alone, is reviewed before it is committed, and is green against the full harness (`.agents/skills/specify/references/harness.md`). An increment counts as done only after a clean PASS. The next increment starts only once its PR is merged.

## Guard rails

1. **Run inline, subagent depth 1.** Run this skill in the calling session, never as a subagent. It launches three sibling subagents (Warp → `run_agents`, Claude Code → `Agent`, Hermes → its delegate subagents); none of them ever launches another one. No subagent mechanism → stop, and never do a phase's work inline.
2. **Approved spec only**: `ready-to-implement` (first increment) or `implementation-in-progress`. Otherwise stop.
3. **Fresh subagent every time.** A fixer never reviews its own fix; after an answered GAP or FAIL, launch a new subagent.
4. **One commit and one PR per increment, only after a clean PASS.** The subagents never commit. Invoking this skill is the explicit commit and PR request.
5. **Review cap: 5 iterations** per increment. Then stop with a report.
6. **Never push to `main`.** Push only the increment branch, at PR time (`git push -u origin <branch>`), or let the project's post-commit hook do it.
7. **Modes differ only in who answers a GAP or a FAIL spec gap**: interactive (default) → ask the human; autonomous (the caller says so, e.g. an autonomous orchestrator) → decide. Either way, log the answer.
8. **Stop after every increment, in every mode.** Once the PR is open, stop and ask whether to continue. Increment N+1 starts from `main` only after the PR of increment N is merged. An autonomous caller stops too.

## Inputs

`/deliver-increment <spec> [increment N]`:

- **Spec**: a path, or a name matched against `.agents/skills/implement/scripts/list-implementable-specs.sh` (filename without `.md` or title, case-insensitive). Zero or several matches → stop and list them; never guess.
- **Increment**: run `git fetch origin main` first. Default = the first unchecked `- [ ] Increment` of `## Implementation Plan` in the spec **as it is on `origin/main`** (the spec of the working tree for a first increment not yet merged anywhere), skipping the post-merge increments of older specs (see the Completeness definition in `review`). None left → report that every increment is merged and that the human says DONE.
- **Waiting for merge**: that increment already has its commit on `workflow/<spec-slug>-<N>` and an open PR → stop: `"increment N is waiting for its PR to be merged: <URL>"`. Never stack an increment on an unmerged one.

## Status-line contract

Each subagent ends its report with exactly one status line. A missing or unknown line = `BLOCKED`.

| Subagent     | Line                                      | Action                                                                                                                 |
| ------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| implement(N) | `STATUS: DONE`                            | full harness green → refactor(N)                                                                                       |
|              | `STATUS: GAP <question>`                  | answer it (interactive: the human; autonomous: decide), log it in `## Implementation Log`, launch a fresh implement(N) |
|              | `STATUS: BLOCKED <reason>`                | stop and report                                                                                                        |
| refactor(N)  | `STATUS: APPLIED` / `STATUS: NONE_NEEDED` | check `**Refactoring**`, log the outcome → review(N)                                                                   |
| review(N)    | `VERDICT: PASS`                           | zero edits → commit                                                                                                    |
|              | `VERDICT: FIXED`                          | launch a fresh review(N)                                                                                               |
|              | `VERDICT: FAIL <blockers>`                | handle like GAP, then launch a fresh review(N)                                                                         |

On GAP, the subagent stops before writing the ambiguous part.

Log every answer: `- <timestamp> — increment N · <GAP|review FAIL>: <question or blockers> → <answer> — decided by <human | agent (autonomous)>`, where `<timestamp>` is the output of `date -u +%Y-%m-%dT%H:%M:%SZ` run right before writing (never typed or estimated). An answer that reduces scope also strikes the affected criteria through (`~~…~~ → see Implementation Log <timestamp>`), never deletes them.

## Process

### 0. Preflight

1. Resolve the spec and increment N; check the status (guard rail 2) and the merge state (_Inputs_).
2. `git status --porcelain` must be empty, except for the spec file itself. Otherwise stop and list the dirty files: a stopped run's leftovers are the human's call.
3. **Legacy branch**: a branch `workflow/<spec-slug>` (no increment number) with commits that are not on `origin/main` comes from the former one-PR-per-spec model. Switch to it, open its Ask draft PR for the increments it holds (step 5), then stop with outcome `LEGACY PR OPENED <URL>` (no increment number, so no question to continue). Never start a new increment on top of it.
4. **Branch** `workflow/<spec-slug>-<N>`:
   - Exists locally (a stopped run) → `git switch workflow/<spec-slug>-<N>` and resume.
   - Otherwise → `git fetch origin main && git switch -c workflow/<spec-slug>-<N> --no-track origin/main` (`--no-track`: an upstream of `origin/main` would let the post-commit push target `main`). For the first increment, the spec must be on `origin/main` or uncommitted in the working tree (it then follows the switch); otherwise stop, because branching from `main` would lose it. Spec uncommitted locally and also on `origin/main` → delete the untracked copy first, or the switch aborts.
   - A fresh worktree may need the project's toolchain set up first (e.g. `direnv allow`, `mise trust`), then a restore of every tracked project, including those outside the solution file (the commands are in the project `AGENTS.md`), unless the restore assets already exist. Tell implement(N) and refactor(N) in their prompt that the restore assets are present.
5. First increment: `.agents/skills/specify/scripts/transition-spec.sh <spec> implementation-in-progress`, which moves the spec to `docs/backlog/in-progress/`. Use the new path from here on.
6. **Emit the spec correlation marker (phase=implement).** Run this literal no-op shell command with the active runtime's shell tool (Warp → `run_shell_command`, Claude Code → `Bash`, Hermes → `terminal` or `run_shell_command`). Run it; do not just print it. Run it as its own shell call — the whole command is the marker line alone: no `cd` prefix, no `;`/`&&` chaining, nothing after it. Use the resolved literal `spec_id` (spec filename without `.md`), never a `$(...)` substitution:

   ```bash
   : SPEC_MARKER v=1 spec_id=2026-06-30-multiquote-limit-5 phase=implement
   ```

   Each subagent emits its own marker (implement and refactor: `phase=implement`; review: `phase=review`), so the adapter binds each transcript to its phase. See `.agents/skills/specify/references/spec-marker.md`.

### 1. implement(N)

> Read `.agents/skills/implement/SKILL.md` and execute it for spec `<spec-path>`, increment `<N>`, <interactive | autonomous> caller. Read the `## Implementation Log` answers first. Never commit, never launch a subagent. End with exactly one status line.

### 2. refactor(N)

List the increment's files with `.agents/skills/review/scripts/gather-artifacts.sh increment <N> <spec-path>`, then:

> First run `: SPEC_MARKER v=1 spec_id=<spec_id> phase=implement` as its own shell call.
> Read `.agents/skills/refactoring/SKILL.md` and apply it to the files changed by increment "[increment title]" of spec "[spec path]": [changed file list].
> Targets: [only for a legacy increment whose **Refactoring** line lists targets — omit the line otherwise].
> Follow its refactoring loop (green tests → one smell → one refactoring → re-test) and Fowler / Uncle Bob principles only: structure changes, zero behavior change, no new tests, no scope beyond the listed files (plus the immediate consumers of a renamed symbol), nothing that contradicts the spec's Acceptance Criteria or "What NOT". Never commit, never launch a subagent.
> Finish with the full harness (`.agents/skills/specify/references/harness.md`). If it is red, undo the refactoring that broke it; still red → `STATUS: BLOCKED <reason>`.
> Report: each refactoring applied (smell → refactoring → file), or "none needed" with the reason, and the harness result. End with exactly one line: `STATUS: APPLIED` or `STATUS: NONE_NEEDED`.

Then check the increment's `- [ ] **Refactoring**` box. A legacy increment without one gets `- [x] **Refactoring**: subagent pass`. Append `- <timestamp> — increment N · refactoring pass: <refactorings applied | none needed> — subagent per .agents/skills/refactoring/SKILL.md`.

### 3. review(N) — auto-fix loop

> Read `.agents/skills/review/SKILL.md` and execute it for spec `<spec-path>`, scope `increment <N>`, auto-fix mode, iteration `<K>`. Never commit, never launch a subagent. End with the `VERDICT:` status line.

For the last increment of the plan, add `last increment` to the prompt: the review then also checks that the whole spec is covered (`review` → Completeness).

Handle the verdict per the contract. K = 5 without a PASS → stop with the report.

### 4. Commit

1. Check the increment off: `- [x] Increment N`.
2. Last increment only: `.agents/skills/specify/scripts/transition-spec.sh <spec> implemented`. Use the new path from here on.
3. Commit with the project's commit conventions (Conventional Commits when it uses them). The PR is step 5 below; worktree cleanup is the human's call. Stage everything: code, tests, refactoring, review fixes, checkboxes, status and log entries. The message is the plan's **Commit** field, plus the co-author trailer. Run the commit from the changed project's directory, with the toolchain active (`mise exec --` without direnv).
4. The pre-commit hook rejects the commit → this is a review FAIL: launch a fresh review(N) with the hook output. It counts toward the cap. Exception: exit 127 or `command not found` is an environment fault (directory, direnv, mise): fix it and retry the commit, it is no review FAIL and does not count toward the cap.
5. **Capture session** (non-blocking): resolve `<session_source>` from the active runtime (Warp → `warp`, Claude Code → `claude-code`, Hermes → `hermes`), then run `.agents/tools/capture-spec-sessions/capture.sh --spec <slug> --source <session_source>` (path relative to the project root; the wrapper works from any cwd). Never omit `--source`. Report the `wrote …` line and any `unbindable marker` warning; on failure, log a warning and continue.

### 5. Ask draft PR

Open it with `gh pr create --draft` — the **Ask** mode of Ship / Show / Ask: it waits for a review — title = the increment's **Commit** field. Write the body for a human reviewer, intention first:

- the increment's **Goal**, then "Increment N of M" and the spec path;
- what changed, in a few sentences (not a file list);
- every GAP / FAIL decision of this increment;
- every open WARNING and RECOMMENDATION from this increment's review trace entries;
- last increment: the `## Rollout observation` summary.

Add the label `rollout:observe` to the last increment's PR when `## Rollout observation` exists. Never merge.

### 6. Stop and ask

Stop with the report, then ask:

- **Not the last increment**: `"Increment N is ready for review: <PR URL>. Continue with increment N+1 (<title>: <goal>) once this PR is merged?"` Yes → after the merge, the next invocation delivers increment N+1 from `main`. No → the spec stays `implementation-in-progress` and can resume any time.
- **Last increment**: `"Last increment ready for review: <PR URL>. Merge it, then say DONE (review)."`

## Report

```markdown
# Delivery — <spec-slug>, increment <N> of <M>

**Outcome**: PR OPENED <URL> | LEGACY PR OPENED <URL> | SPEC IMPLEMENTED — last PR <URL> | WAITING FOR MERGE <URL> | STOPPED (<phase> — <reason>)
**Branch**: workflow/<spec-slug>-<N> — commit: <hash subject> (unpushed: <yes | no>)

- Goal: <the increment's Goal>
- implement <DONE after G GAPs> · refactor <APPLIED | NONE_NEEDED> · review <PASS after K iterations — FIXED, FAIL, PASS>
- Decisions: <each GAP / FAIL answer, who decided>
- Open findings: <WARNINGs and RECOMMENDATIONs traced, or none>

**Next**: continue with increment <N+1> once the PR is merged? | merge the PR, then say DONE | <what the human must resolve>
```

On a stop, leave the branch, the working tree and the spec as they are: the report says what is left.
