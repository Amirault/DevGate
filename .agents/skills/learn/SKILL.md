---
name: learn
description: "Learning pass on a spec: extract its conversation bundle, classify session breakdown points into four categories, record every finding in the learning history (docs/learnings), and suggest at most one cross-spec harness improvement with evidence. Applies no fix. Triggers on learn/retro/post-mortem."
effort: medium
---

# Learn

```yaml
version: v1

scope:
  in_scope:
    - Observation of one spec's session bundle
    - Classification of breakdown points found in those sessions
    - Prioritization down to at most one candidate
    - Suggestion of that candidate and its potential fix
    - Recording every finding in the learning history under docs_root, through learnings.py only
  out_of_scope:
    - Executing the specify / implement / review skills
    - Applying the suggested fix
    - Any write outside docs_root, and any write to docs_root not made through learnings.py

inputs:
  docs_root: >
    Directory holding docs/learnings/ (a learning worktree for an autonomous run, the working
    tree for a manual /learn: left uncommitted). Default: the project root.
  history: python3 .agents/scripts/learnings.py <match|record|index> --docs-root <docs_root>/docs/learnings
  sessions:
    tool: capture-spec-sessions
    cwd: the project root (paths below are relative to it); capture.sh itself resolves the project root from any cwd
    session_source: Resolve from the active runtime — Warp → `warp`, Claude Code → `claude-code`, Hermes → `hermes`.
    locate_spec: .agents/tools/capture-spec-sessions/capture.sh --list
    extract: .agents/tools/capture-spec-sessions/capture.sh --spec <slug> --source <session_source>
    bundle_path: >
      The path printed on the `wrote …` line. The wrapper stores bundles in the main
      checkout's spec-sessions/ folder, so captures made from worktrees are included.
    rules:
      - ALWAYS pass the resolved session_source explicitly; never rely on a default or infer it from a stored bundle.
      - ALWAYS run the tool; never read the stored bundle directly (decay-safe merge).
      - Read the JSONL with the runtime's file-read tool (Warp read_files, Claude Code Read), losslessly; on truncation, read the rest in ranges.
      - Never pipe the bundle through commands that summarize or truncate.
    second_evidence_source: the spec's "## Implementation Log"
    warnings:
      - warning: unbindable marker, phase present in bundle
        action: Report the phase as recovered from disk.
      - warning: unbindable marker, phase absent from both persisted and live
        action: Report as a finding (session lost), fall back to the Implementation Log, say so.
      - warning: fresh read failed
        action: Note the degradation to the stored bundle; captured phases are still recovered.
    exit_codes:
      0: bundle written
      1: nothing written (zero conversations bound, or --complete-only withheld)
      2: usage error
    event_fields_used:
      - phase, seq, ts, role, kind, content
      - meta.exit_code, meta.tool, meta.repeat, meta.truncated, meta.original_len, meta.confidence

pipeline:
  - id: observation
    name: OBSERVATION
    goal: Retrieve the session bundle for the targeted spec.
    actions:
      - Record spec_id and status.
      - Run capture-spec-sessions, then read the bundle and its warnings.
      - Read the spec's "## Implementation Log".
      - Read <docs_root>/docs/learnings/INDEX.md: the history to match findings against.

  - id: diagnose_spec_sessions
    name: DIAGNOSE SPEC SESSIONS
    goal: Search the bundle and classify every breakdown point found.
    evidence_rule: >
      Every item MUST cite its evidence: an event ts plus a quoted line, a command plus its
      meta.exit_code, or an Implementation Log entry. No evidence, no item.
    evidence_integrity: >
      Flag any item whose evidence carries meta.truncated, meta.confidence heuristic, or
      meta.confidence schema-mismatch. Compaction happens upstream above 2000 chars.

    disambiguation:
      question: Is the asset correct as written?
      rules:
        - if: The asset says the right thing and the session did not follow it.
          then: asset_interpretation_gaps
          fix_axis: wording, placement, or enforcement of the existing asset
        - if: The asset says the wrong thing.
          then: bad_expectation
          fix_axis: content of the rule itself
      note: Execution fault versus specification fault. This axis decides the fix.

    classification:
      - id: asset_interpretation_gaps
        label: Asset interpretation gaps
        meaning: The asset was right, the session did not honour it.
        criteria:
          - A session does not follow the AGENTS.md rules.
          - A skill shows unexpected behaviour during a session.
          - Project standards are not properly followed.
          - The specify / implement / review workflow was not followed as written.
        bound: >
          Record the deviation with its evidence. Do not reopen the workflow's design in the
          abstract, but an evidenced deviation may target the phase skill file involved.

      - id: bad_expectation
        label: Bad expectation
        meaning: The asset itself carries the defect.
        criteria:
          - A skill triggers but should not.
          - A skill does not trigger but should.
          - >
            The AGENTS.md context degrades the session:
            obsolete path, wrong assertion, outdated information.
          - >
            The project's domain ontology (when it keeps one) degrades the session:
            wrong concept or invariant, missing twin or divergence, stale change-impact entry,
            an open question answered during the session but still open in the file.
          - >
            The spec file is wrong and has been corrected mid-flight,
            e.g. a wrong assertion was added and degraded the workflow.
        fix_target: >
          When the defect is a domain fact (concept, invariant, header, twin), target
          the domain ontology first (when the project keeps one), before AGENTS.md or any skill file.

      - id: time_cost
        label: Time cost
        criteria:
          - id: task_too_long
            condition: A task took too much time to resolve.
            signal: Delta between the first and last event ts of the task, within one phase.
          - id: task_looping
            condition: A task looped without reaching a resolution.
            signal: >
              ts delta for the duration, plus the repetition count of the same meta.tool
              or the same target file across events, plus meta.repeat when present.
        on_missing_ts: Report the gap and skip this category. Never estimate a duration.

      - id: side_improvement
        label: Side improvement
        meaning: No failure occurred, but an asset can be tightened.
        patterns:
          - trigger: A decision was made, or a written decision is missing.
            suggestion: Create an ADR.
          - trigger: A new rule can be locked, or a blocking rule is missing.
            suggestion: Improve lint / pre-commit hooks.
          - trigger: Runtime information was needed and missing.
            suggestion: Add monitoring / observability.
          - trigger: A new principle has been detected (e.g. TDD).
            suggestion: Enforce this principle explicitly.

  - id: score
    name: SCORE
    goal: Rate every item on three discrete scales.
    scales:
      impact_on_harness:
        values: [high, medium, low]
        justification: Each value must be backed by a cited session observation.
      change_cost:
        values: [low, medium, high]
        justification: Each value must name the files to modify.
      direct_improvement:
        values: [yes, no]
        definition: >
          yes when the fix removes the friction, no when it only makes it easier to notice.
    forbidden:
      - Numeric scores or ratios. Discrete scales only, to avoid false precision.

  - id: prioritize
    name: PRIORITIZE
    goal: Reduce all scored items down to at most one candidate.
    ordering:
      method: lexicographic
      keys:
        - impact_on_harness, high first
        - change_cost, low first
        - direct_improvement, yes first
    filters:
      - id: cross_spec_only
        type: hard
        keep_if: >
          The fix targets a shared asset: AGENTS.md, the domain ontology
          (when the project keeps one), a phase skill file
          (specify / implement / review), any other skill file, a lint rule,
          a pre-commit hook, an ADR, or the observability configuration.
        discard_if: The fix only touches this spec file or the code written for it.
        decided_on: The target of the fix, never on an assumed generality.
      - id: at_most_one
        rule: Keep at most one item.

  - id: record
    name: RECORD
    goal: Persist EVERY finding of the run, those discarded by cross_spec_only included.
    actions:
      - >
        Fingerprint each finding: category, failure_mode (closed vocabulary of
        docs/learnings/SCHEMA.md), asset_path, asset_section (both `none` when no asset), symptom.
      - >
        Run `match`, then `record` with --slug, --spec, --increment, --evidence and
        --discarded-by <filter> when a filter removed it. `match: <slug>` records an occurrence
        on that entry. `related: <slugs>` is never a merge: record a new entry with
        --related-to and --related-reason saying why it differs.
      - Run `index` once all findings are recorded. Never record the fix: the orchestrator does.

  - id: suggest
    name: SUGGEST
    goal: Deliver the outcome. Write nothing beyond the record step.
    output_contract:
      all_findings: every finding with its slug and match status (new, match, related), the discarded ones included.
      when_one_item:
        - breakdown_point: what went wrong
        - category: the classification id
        - evidence: ts plus quoted line, or command plus exit_code, or log entry
        - target: the specific file AND section to change, never generic advice
        - proposed_fix: what to change there
        - scores: impact, cost, direct improvement, each with its justification
      when_no_item:
        - statement: No cross-spec harness improvement identified.
        - discarded: the items found, each with the filter that removed it
      note: An empty result is valid and must not be padded.
```
