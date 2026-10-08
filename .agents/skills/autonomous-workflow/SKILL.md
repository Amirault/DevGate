---
name: autonomous-workflow
description: "Entry point for an autonomous agent (Hermes or any headless agent) to run the spec-driven pipeline without human intervention inside an increment, starting from an approved spec: deliver the next increment (implement → refactor → review → commit → its own Ask PR), run learn on that increment and open its learning PR, then stop and ask whether to continue once the increment PR is merged. Use whenever an agent must execute a ready-to-implement spec autonomously or the user says 'run the workflow on spec X', 'continue the workflow on spec X', 'autonomous mode', or 'hermes'."
effort: high
---

# Autonomous Workflow

```text
[human] specify → [autonomous] deliver-increment(1) → PR 1 → learn(1) → learning PR 1 → stop: continue?
→ [human] merge PR 1 + "continue" → [autonomous] deliver-increment(2) → PR 2 → learn(2) → learning PR 2 → stop: continue? → …
… → [autonomous] last increment → last PR → learn → learning PR → [human] merge + DONE
```

You are the **orchestrator**. Each run delivers **one** increment and learns from it: you run `deliver-increment` inline, its fresh subagents (implement, refactor, review) do the phase work, a `learn` subagent audits the increment, and you collect their verdicts. Never do phase work yourself: a reviewer sharing the implementer's context inherits its blind spots.

## Guard Rails

1. **Approved spec only**: status `ready-to-implement` (or `implementation-in-progress` to
   continue). Otherwise abort. Never run `specify` autonomously.
2. **Isolation mandatory, depth 1**: `deliver-increment` runs inline in your session and
   launches its subagents; `learn` is a subagent. No subagent ever launches another one. No
   subagent mechanism → abort, never fall back to inline phase work.
3. **Everything lands via PRs, always Ask**: every PR waits for a manual review and a human merges it; never Ship or Show, never merge.
   - One **increment PR** per increment (branch `workflow/<spec-slug>-<N>`), opened by `deliver-increment`.
   - At most one **learning PR** per increment (branch `learning/<spec-slug>-<N>`), opened in Phase 3 when learn recorded a finding: fix and history with a top learning, history only without one. It is independent of the increment PRs: the next increment never waits for it.
   - **The post-commit hook pushes each commit** when the project has one. Never push manually otherwise than at PR time (`git push -u origin <branch>`, never to `main`), for a branch whose commits no push hook covers.
4. **Review cap**: 5 review iterations per increment (`deliver-increment`); reaching it aborts
   the run.
5. **Spec gaps: decide and log**: `deliver-increment` runs in autonomous mode: every GAP and
   every FAIL spec gap gets your best judgment, logged in the spec's `## Implementation Log`
   and surfaced in the increment PR and the report.
6. **Decide-and-act inside an increment, never ask**: during a run, no agent (orchestrator or
   subagent) waits for an explicit user request to act: a finished, validated increment is
   committed with its planned message and gets its PR; a judgment call is made and logged; the
   top learning gets its learning PR.
7. **Learn after every delivered increment**: each run that opens an increment PR runs learn on
   that increment before it stops. Learning waits for no spec end.
8. **Stop after every increment**: once the increment PR (and its learning PR, if any) is open,
   the run ends and asks whether to continue. The next increment starts from `main` only after
   the increment PR is merged and the human says continue. Never deliver two increments in one
   run.
9. **Human sign-off stays human**: the workflow ends at status `implemented`; only the human
   says DONE.

**Abort** on any `STATUS: BLOCKED` (a missing or unknown status line included) or when the review cap is reached. On any abort: run no learn, open no PR, leave branch and spec as-is (resumable), and emit the report with the reason.

## Process

### Phase 0 — PREFLIGHT (orchestrator)

1. Resolve the spec (named by caller, or `.agents/skills/implement/scripts/list-implementable-specs.sh`).
   Ambiguity → abort.
2. Verify the spec status and a clean git state (`git status --porcelain` empty, except for the spec file itself), else abort.
3. Record the run start: `<run-start>` = the output of `date -u +%Y-%m-%dT%H:%M:%SZ` (never typed or estimated). Learn uses it to keep this run's events only.
4. **The caller says stop** ("stop the workflow on spec X", or "no" to the continue question) →
   deliver nothing and run no learn (each delivered increment already had its own): go to
   Phase 4 with outcome STOPPED BY HUMAN. The spec stays `implementation-in-progress` and can
   resume later.

### Phase 1 — DELIVER ONE INCREMENT (inline)

Read `.agents/skills/deliver-increment/SKILL.md` and run it **once** for `<spec-path>` in **autonomous mode**. It picks the next increment from the spec on `origin/main`, creates `workflow/<spec-slug>-<N>`, runs implement(N) → refactor(N) → review(N) auto-fix loop → one commit → the Ask draft increment PR.

Record for that increment: the implement GAPs and your decisions, the refactor outcome, every review iteration (verdict, blockers fixed, warnings, recommendations), the commit hash, the PR URL.

Then, per its outcome:

- `PR OPENED` (not the last increment) → Phase 2.
- `SPEC IMPLEMENTED` (last increment, spec → `implemented`, PR opened with `rollout:observe` when `## Rollout observation` exists) → Phase 2.
- `WAITING FOR MERGE` → Phase 4: nothing was delivered, so nothing to learn; report that the previous increment PR must be merged first.
- `STOPPED` (BLOCKED or review cap) → abort.

### Phase 2 — LEARN: INCREMENT AUDIT (subagent, after every delivered increment)

Create the learning worktree first: `git worktree add ../learning-<spec-slug>-<N> -b learning/<spec-slug>-<N> origin/main`. Its root is learn's docs root.

List the learning PRs already opened for this spec, open or merged, so learn does not propose the same fix twice:

```bash
gh pr list --state all --limit 100 --json headRefName,title,url \
  --jq '.[] | select(.headRefName | startswith("learning/<spec-slug>-")) | "\(.title) → \(.url)"'
```

Then launch the subagent:

> Read `.agents/skills/learn/SKILL.md` and execute it for spec `<spec-slug>`, scoped to
> increment `<N>`: from the session bundle, keep only the events with `ts` ≥ `<run-start>`; from
> the `## Implementation Log`, keep only the `increment <N> ·` entries. Add this run's record:
> `<verdicts, blockers fixed, open warnings and recommendations, decisions>`. Discard any finding
> already covered by these learning PRs of the spec: `<title → URL list, or none>`. Docs root:
> `../learning-<spec-slug>-<N>`: record every finding there and match it against its history
> (`learn` does both). Never launch a subagent. These scoping rules and this report layout extend learn's own contract: its `when_one_item` suggestion is the `Top learning`, its `when_no_item` is `none`. Produce:
>
> ```markdown
> # Increment Audit — <spec-slug>, increment <N>
>
> ## Phase timeline
>
> ## Autonomous decisions
>
> ## Findings (evidence → target skill file + section → improvement)
>
> ## Top learning (the ONE highest-impact finding: concrete change + exact target file, or none)
> ```

Take the `Top learning` as-is (next ranked finding if it lacks evidence or a target file). Nothing recorded (`git -C ../learning-<spec-slug>-<N> status --porcelain` empty) → no learning PR: `git worktree remove ../learning-<spec-slug>-<N>`, `git branch -D learning/<spec-slug>-<N>`, go to Phase 4. Otherwise → Phase 3.

### Phase 3 — LEARNING PR (orchestrator, when Phase 2 recorded a finding)

1. Top learning: in the worktree apply the change (skill/script/template only, never production
   code), then `python3 .agents/scripts/learnings.py record --slug <top slug> --fixed-by learning/<spec-slug>-<N>
--fix-target <file>#<section> --fix-why <why> --fixed-at <today>` and `index` (same script). Commit it with
   the project's commit conventions (`build(skills): …`). No top learning: commit the recorded history
   (`docs(learnings): record increment <N> detections`).
2. Open it with `gh pr create --draft` (Ask mode: it waits for a review), title = the commit title, body = the
   findings, their evidence, and `learned from increment <N> of <spec-slug>: <increment PR URL>`.
   Push the `learning/*` branch only if no push hook already did.
3. Top learning: `record --slug <top slug> --fix-pr <PR URL>`, `index`, second commit
   `docs(learnings): add learning PR link`.
4. `git worktree remove ../learning-<spec-slug>-<N>`

### Phase 4 — REPORT AND QUESTION (orchestrator)

```markdown
# Workflow Report — <spec-slug>, increment <N> of <M>

**Outcome**: PR OPENED | SPEC IMPLEMENTED | WAITING FOR MERGE | STOPPED BY HUMAN | ABORTED (<phase> — <increment N> — <reason>)
**Increment PR**: <URL> — branch workflow/<spec-slug>-<N>
**Learning PR**: <URL> — branch learning/<spec-slug>-<N> | none (<learn found no new cross-spec improvement>)
**Spec status**: <status>

## Increment <N> — <goal>

- <commit>: implement <DONE after G GAPs> · refactor <APPLIED | NONE_NEEDED> · review <PASS after K iterations: FIXED, FAIL, PASS> — fixes: <blockers fixed>

## Autonomous decisions (require your audit)

- <each GAP / FAIL decision logged in the Implementation Log>

## Open findings (in the increment PR)

- <each WARNING / RECOMMENDATION left open>

## Top learning → PR

- <finding> → <learning PR URL> | none

## Next steps (human)

1. Review the increment PR + autonomous decisions; merge when satisfied.
2. Review the learning PR (if any) on its own; the next increment does not wait for it.
3. <not the last increment> Continue with increment <N+1> (<title>: <goal>) once the increment PR is merged? Answer "continue" to run it, "stop" to end the spec here.
   <last increment> After deploy, report the `## Rollout observation` (if any) in the Implementation Log, then say DONE (`review` skill).
```
