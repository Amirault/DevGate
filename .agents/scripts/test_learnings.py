"""Tests for the learning history tool (learnings.py), one test per acceptance criterion.

Loads `learnings.py` via importlib, like test_validate_skills.py. Fixtures use temp dirs.
"""

import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "learnings.py"
REAL_DOCS_ROOT = Path(__file__).resolve().parents[2] / "docs" / "learnings"

FINGERPRINT = {
    "category": "asset_interpretation_gaps",
    "failure_mode": "skill_unexpected_behavior",
    "asset_path": ".agents/skills/git-commit/SKILL.md",
    "asset_section": "Fresh worktree",
}


def load_tool():
    spec = importlib.util.spec_from_file_location("learnings", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class LearningsTestCase(unittest.TestCase):
    def setUp(self):
        self.tool = load_tool()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.entries = self.root / "entries"

    def run_tool(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = self.tool.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def fingerprint_args(self, **overrides):
        values = {**FINGERPRINT, **overrides}
        args = []
        for key, value in values.items():
            args += [f"--{key.replace('_', '-')}", value]
        return args

    def match(self, **overrides):
        return self.run_tool("match", "--docs-root", str(self.root), *self.fingerprint_args(**overrides))

    def record(self, slug="git-commit-fresh-worktree-direnv", spec="spec-a", increment="1", date="2026-10-05", extra=(), **overrides):
        return self.run_tool(
            "record", "--docs-root", str(self.root), "--slug", slug,
            *self.fingerprint_args(**overrides),
            "--symptom", "git commit blocked in a fresh worktree",
            "--spec", spec, "--increment", increment, "--date", date,
            "--evidence", "exit_code 1 on git commit",
            *extra,
        )

    def fix_args(self, fixed_at="2026-10-05"):
        return [
            "--fixed-by", "learning/spec-a-1",
            "--fix-target", ".agents/skills/git-commit/SKILL.md#Fresh worktree",
            "--fix-why", "document direnv allow",
            "--fixed-at", fixed_at,
        ]

    def entry_text(self, slug="git-commit-fresh-worktree-direnv"):
        return (self.entries / f"{slug}.md").read_text()

    def occurrence_lines(self, slug="git-commit-fresh-worktree-direnv"):
        return [line for line in self.entry_text(slug).splitlines() if line.startswith("- spec=")]

    def entry_files(self):
        return sorted(p.name for p in self.entries.glob("*.md")) if self.entries.exists() else []

    def write_entry(self, name, **overrides):
        fields = {
            "category": "asset_interpretation_gaps",
            "failure_mode": "skill_unexpected_behavior",
            "asset_path": ".agents/skills/a/SKILL.md",
            "asset_section": "Intro",
            "symptom": "something broke",
            "status": "detected",
            **overrides,
        }
        front = "".join(f"{k}: {v}\n" for k, v in fields.items() if v is not None)
        self.entries.mkdir(parents=True, exist_ok=True)
        (self.entries / name).write_text(
            f"---\n{front}---\n\n## Occurrences\n\n- spec=s increment=1 date=2026-10-05 evidence=e\n"
        )


class MatchCriteria(LearningsTestCase):
    def test_match_answers_new_when_no_entry_has_the_key(self):
        code, out, _ = self.match()
        self.assertEqual((code, out.strip()), (0, "new"))

    def test_match_answers_match_slug_on_same_key(self):
        self.record()
        code, out, _ = self.match()
        self.assertEqual((code, out.strip()), (0, "match: git-commit-fresh-worktree-direnv"))

    def test_match_answers_related_never_match_on_same_path_other_key(self):
        self.record()
        variants = [
            {"asset_section": "Other section"},
            {"failure_mode": "workflow_not_followed"},
            {"category": "bad_expectation", "failure_mode": "agents_md_degrades"},
        ]
        for overrides in variants:
            with self.subTest(overrides=overrides):
                code, out, _ = self.match(**overrides)
                self.assertEqual((code, out.strip()), (0, "related: git-commit-fresh-worktree-direnv"))


class RecordCriteria(LearningsTestCase):
    def test_record_refuses_invalid_failure_mode_naming_allowed_values_and_writes_nothing(self):
        code, _, err = self.record(category="time_cost", failure_mode="adr")
        self.assertEqual(code, 1)
        self.assertIn("task_too_long, task_looping", err)
        self.assertEqual(self.entry_files(), [])

    def test_record_refuses_unknown_category_naming_allowed_values_and_writes_nothing(self):
        code, _, err = self.record(category="nonsense")
        self.assertEqual(code, 1)
        self.assertIn("asset_interpretation_gaps", err)
        self.assertIn("side_improvement", err)
        self.assertEqual(self.entry_files(), [])

    def test_record_creates_entry_with_fingerprint_detected_status_and_one_occurrence(self):
        code, _, _ = self.record()
        self.assertEqual(code, 0)
        text = self.entry_text()
        for key, value in FINGERPRINT.items():
            self.assertIn(f"{key}: {value}", text)
        self.assertIn("status: detected", text)
        self.assertEqual(len(self.occurrence_lines()), 1)

    def test_record_appends_occurrence_on_existing_key_without_new_file(self):
        self.record(spec="spec-a", increment="1")
        self.record(slug="another-slug", spec="spec-b", increment="2")
        self.assertEqual(self.entry_files(), ["git-commit-fresh-worktree-direnv.md"])
        self.assertEqual(len(self.occurrence_lines()), 2)

    def test_record_is_idempotent_on_slug_spec_increment_and_updates_the_occurrence(self):
        self.record(spec="spec-a", increment="3")
        self.run_tool(
            "record", "--docs-root", str(self.root), "--slug", "git-commit-fresh-worktree-direnv",
            *self.fingerprint_args(), "--symptom", "s", "--spec", "spec-a", "--increment", "3",
            "--date", "2026-10-05", "--evidence", "evidence A prime",
        )
        lines = self.occurrence_lines()
        self.assertEqual(len(lines), 1)
        self.assertIn("evidence A prime", lines[0])
        self.assertNotIn("exit_code 1 on git commit", lines[0])

    def test_record_stores_discard_filter_and_entry_stays_detected(self):
        code, _, _ = self.record(slug="discarded-finding", asset_path="none", asset_section="none",
                                 extra=["--discarded-by", "cross_spec_only"])
        self.assertEqual(code, 0)
        self.assertIn("discarded_by=cross_spec_only", self.occurrence_lines("discarded-finding")[0])
        self.assertIn("status: detected", self.entry_text("discarded-finding"))

    def test_record_with_fix_fields_marks_entry_fixed(self):
        self.record()
        self.record(extra=self.fix_args())
        text = self.entry_text()
        self.assertIn("status: fixed", text)
        self.assertIn("fixed_by: learning/spec-a-1", text)
        self.assertIn("fix_target: .agents/skills/git-commit/SKILL.md#Fresh worktree", text)
        self.assertIn("fix_why: document direnv allow", text)
        self.assertIn("fixed_at: 2026-10-05", text)

    def test_record_fix_pr_alone_sets_link_without_adding_an_occurrence(self):
        self.record(extra=self.fix_args())
        url = "https://github.com/acme/app/pull/1"
        code, _, _ = self.run_tool(
            "record", "--docs-root", str(self.root), "--slug", "git-commit-fresh-worktree-direnv", "--fix-pr", url
        )
        self.assertEqual(code, 0)
        self.assertIn(f"fix_pr: {url}", self.entry_text())
        self.assertEqual(len(self.occurrence_lines()), 1)


class IndexCriteria(LearningsTestCase):
    def index_text(self):
        self.assertEqual(self.run_tool("index", "--docs-root", str(self.root))[0], 0)
        return (self.root / "INDEX.md").read_text()

    def row_for(self, text, slug):
        return next(line for line in text.splitlines() if f"[{slug}]" in line)

    def test_index_flags_recurred_only_for_occurrence_after_fixed_at(self):
        self.record(extra=self.fix_args(fixed_at="2026-10-05"))
        self.record(spec="spec-b", date="2026-10-05")
        self.assertIn("fixed", self.row_for(self.index_text(), "git-commit-fresh-worktree-direnv"))
        self.assertNotIn("recurred", self.row_for(self.index_text(), "git-commit-fresh-worktree-direnv"))
        self.record(spec="spec-c", date="2026-10-12")
        self.assertIn("recurred", self.row_for(self.index_text(), "git-commit-fresh-worktree-direnv"))

    def test_index_has_one_sorted_row_per_entry_with_count_and_last_seen_and_is_reproducible(self):
        self.record(slug="skill-trigger-miss", asset_section="A", date="2026-10-01")
        self.record(slug="git-commit-fresh-worktree-direnv", asset_section="B", date="2026-10-02")
        self.record(slug="git-commit-fresh-worktree-direnv", asset_section="B", spec="spec-b", date="2026-10-09")
        self.record(slug="fix-mutants-baseline-fetch", asset_section="C", date="2026-10-03")
        first = self.index_text()
        rows = [line for line in first.splitlines() if line.startswith("| [")]
        self.assertEqual(
            [r.split("]")[0][3:] for r in rows],
            ["fix-mutants-baseline-fetch", "git-commit-fresh-worktree-direnv", "skill-trigger-miss"],
        )
        middle = self.row_for(first, "git-commit-fresh-worktree-direnv")
        cells = [c.strip() for c in middle.strip("|").split(" | ")]
        self.assertEqual(cells[-2:], ["2", "2026-10-09"])
        self.assertEqual(self.index_text(), first)


class CheckCriteria(LearningsTestCase):
    def test_check_exits_1_naming_each_problem_and_0_on_a_valid_set(self):
        self.write_entry("a.md", asset_section="Same")
        self.write_entry("b.md", asset_section="Same")
        self.write_entry("c.md", asset_path=None, asset_section="Other")
        code, out, err = self.run_tool("check", "--docs-root", str(self.root))
        report = out + err
        self.assertEqual(code, 1)
        self.assertIn("a.md", report)
        self.assertIn("b.md", report)
        self.assertIn("entries/c.md", report)
        self.assertIn("asset_path", report)
        self.assertIn("INDEX.md is out of date", report)
        self.assertIn("index", report)

        (self.entries / "b.md").unlink()
        (self.entries / "c.md").unlink()
        self.run_tool("index", "--docs-root", str(self.root))
        code, out, err = self.run_tool("check", "--docs-root", str(self.root))
        self.assertEqual((code, out + err), (0, ""))

    def test_check_flags_stale_index_after_a_new_entry(self):
        self.write_entry("a.md")
        self.run_tool("index", "--docs-root", str(self.root))
        self.write_entry("z.md", asset_section="New")
        code, out, err = self.run_tool("check", "--docs-root", str(self.root))
        self.assertEqual(code, 1)
        self.assertIn("INDEX.md is out of date", out + err)


class RealHistory(LearningsTestCase):
    def test_committed_history_passes_check(self):
        code, out, err = self.run_tool("check", "--docs-root", str(REAL_DOCS_ROOT))
        self.assertEqual((code, out + err), (0, ""))


if __name__ == "__main__":
    unittest.main()
