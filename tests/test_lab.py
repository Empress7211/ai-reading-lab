from __future__ import annotations

import datetime as dt
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts/lab.py"
SPEC = importlib.util.spec_from_file_location("lab", MODULE_PATH)
assert SPEC and SPEC.loader
lab = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = lab
SPEC.loader.exec_module(lab)


CONFIG = """\
project: "Test Lab"
repository: "owner/repo"
timezone: "Asia/Singapore"
active_cycle: "2026-C01"
active_cycle_dir: "cycles/2026-C01-test"
cycle_start: "2026-08-04"
cycle_end: "2026-10-25"
weekly_hours: "5-6"
statuses: ["queued", "reading", "read", "synthesized", "revisit", "archived"]
depths: ["scan", "normal", "deep"]
deep_reading_wip_limit: 1
deep_queue_limit: 3
max_file_bytes: 5242880
"""


class LabTestCase(unittest.TestCase):
    def make_repo(self) -> tuple[tempfile.TemporaryDirectory[str], Path]:
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        for directory in [
            "config",
            "cycles/2026-C01-test/weeks",
            "notes/papers",
            "notes/concepts",
            "notes/maps",
            "references",
            "templates",
        ]:
            (root / directory).mkdir(parents=True, exist_ok=True)
        (root / "config/project.yaml").write_text(CONFIG, encoding="utf-8")
        (root / "references/library.bib").write_text("", encoding="utf-8")
        (root / "cycles/2026-C01-test/PLAN.md").write_text("# Test Cycle\n", encoding="utf-8")
        return temporary, root

    def test_simple_yaml_parser_handles_inline_lists(self) -> None:
        parsed = lab.parse_simple_yaml('status: "queued"\ntopics: ["rlhf", "agents"]\nlimit: 3\n')
        self.assertEqual(parsed["topics"], ["rlhf", "agents"])
        self.assertEqual(parsed["limit"], 3)

    def test_duplicate_bibtex_keys_fail(self) -> None:
        temporary, root = self.make_repo()
        self.addCleanup(temporary.cleanup)
        (root / "references/library.bib").write_text(
            "@article{same, title={A}}\n@misc{same, title={B}}\n", encoding="utf-8"
        )
        lab.build(root, today=dt.date(2026, 8, 4))
        errors, _ = lab.run_checks(root, today=dt.date(2026, 8, 4))
        self.assertTrue(any("duplicate citekeys" in error for error in errors))

    def test_forbidden_pdf_fails(self) -> None:
        temporary, root = self.make_repo()
        self.addCleanup(temporary.cleanup)
        (root / "paper.pdf").write_bytes(b"%PDF")
        errors = lab.check_forbidden_files(root, 5_242_880)
        self.assertTrue(any("forbidden file type" in error for error in errors))

    def test_possible_secret_fails(self) -> None:
        temporary, root = self.make_repo()
        self.addCleanup(temporary.cleanup)
        (root / "accidental.txt").write_text(
            "sk-" + "A" * 40 + "\n", encoding="utf-8"
        )
        errors = lab.check_forbidden_files(root, 5_242_880)
        self.assertTrue(any("possible OpenAI API key" in error for error in errors))

    def test_local_absolute_path_fails(self) -> None:
        temporary, root = self.make_repo()
        self.addCleanup(temporary.cleanup)
        (root / "references/library.bib").write_text(
            "@article{paper, file={/" + "Users/example/Zotero/storage/ABCD1234/paper.pdf}}\n",
            encoding="utf-8",
        )
        errors = lab.check_forbidden_files(root, 5_242_880)
        self.assertTrue(any("possible local absolute path" in error for error in errors))

    def test_broken_relative_link_fails(self) -> None:
        temporary, root = self.make_repo()
        self.addCleanup(temporary.cleanup)
        (root / "README.md").write_text("[missing](missing.md)\n", encoding="utf-8")
        errors = lab.check_links(root)
        self.assertEqual(len(errors), 1)
        self.assertIn("broken relative link", errors[0])

    def test_missing_frontmatter_field_fails(self) -> None:
        temporary, root = self.make_repo()
        self.addCleanup(temporary.cleanup)
        note_path = root / "notes/papers/example.md"
        note_path.write_text("---\ncitekey: example\n---\n# Example\n", encoding="utf-8")
        note = lab.parse_frontmatter(note_path)
        errors = lab.validate_paper_note(note, lab.load_config(root), set())
        self.assertTrue(any("missing frontmatter fields" in error for error in errors))

    def test_build_is_idempotent_and_check_passes(self) -> None:
        temporary, root = self.make_repo()
        self.addCleanup(temporary.cleanup)
        today = dt.date(2026, 8, 4)
        lab.build(root, today=today)
        first_dashboard = (root / "DASHBOARD.md").read_text(encoding="utf-8")
        first_index = (root / "notes/INDEX.md").read_text(encoding="utf-8")
        lab.build(root, today=today)
        self.assertEqual(first_dashboard, (root / "DASHBOARD.md").read_text(encoding="utf-8"))
        self.assertEqual(first_index, (root / "notes/INDEX.md").read_text(encoding="utf-8"))
        errors, warnings = lab.run_checks(root, today=today)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_stale_generated_file_fails(self) -> None:
        temporary, root = self.make_repo()
        self.addCleanup(temporary.cleanup)
        today = dt.date(2026, 8, 4)
        lab.build(root, today=today)
        (root / "DASHBOARD.md").write_text("stale\n", encoding="utf-8")
        errors, _ = lab.run_checks(root, today=today)
        self.assertTrue(any("generated file is stale" in error for error in errors))

    def test_week_ranges_cover_short_first_week(self) -> None:
        config = lab.parse_simple_yaml(CONFIG)
        self.assertEqual(
            lab.week_range(config, 1),
            (dt.date(2026, 8, 4), dt.date(2026, 8, 9)),
        )
        self.assertEqual(
            lab.week_range(config, 12),
            (dt.date(2026, 10, 19), dt.date(2026, 10, 25)),
        )


if __name__ == "__main__":
    unittest.main()
