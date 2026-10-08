# Harness

The harness is everything that controls agent behavior. Every spec-workflow skill (`specify`, `implement`, `review`) points here instead of listing commands.

- **Mechanical part**: the Lefthook pre-commit hook — the project's `lefthook.yml` and every config it `extends` (build + analyzers + CSharpier, full tests, coverage check, linters, NuGet audit, …) — plus any agent hooks the project configures and `validate-spec.sh`.
- **Written part**: `AGENTS.md`, the skills, `standards/adopted/`.

**Single source of truth for the commands: the Lefthook config.** Never copy a harness command into a skill, a spec, or an Implementation Plan — name the full harness instead. When the Lefthook config changes, nothing else has to.

## Run the full harness

Run exactly what the commit will run, before committing:

```bash
git add -A
mise exec -- lefthook run pre-commit --no-tty
```

- Run it from the changed project's directory (e.g. `src/MyApi`): `mise` must resolve the project's tools.
- Stage first. The hooks pick what to run from the staged files (`git diff --cached`), and the unstaged-changes check fails on anything left unstaged. Staging is not committing.
- Exit 0 = green. Any other exit = red, and the output names the failing command.
- Hooks with `stage_fixed` (Prettier, sqlfluff) may rewrite staged files. Re-run until green.

## Rules

- **The full harness validates an increment. A filtered run never does.** a filtered test run (`dotnet test --filter …`, `vitest -t …`, `pytest -k …`) or a single test project gives fast feedback while coding, never the proof that an increment is done.
- **Red harness → the increment is not done**, whatever the focused tests say.
- **Never trust a claim of green.** A reviewer reruns the harness itself.
- Never bypass the hook (`--no-verify`) to get an increment through (`AGENTS.md` → Never Do).
