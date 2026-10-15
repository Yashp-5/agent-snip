from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACKAGE_SRC = HERE.parent / "src"
ROOT = HERE.parents[2] / "conformance" / "fixtures"
sys.path.insert(0, str(PACKAGE_SRC))

from agent_snip import (  # noqa: E402
    optimize,
    optimize_skill,
    parse_skill,
    rank_skills,
    render_catalog,
    scan_skills,
)


class AgentSnipTests(unittest.TestCase):
    def test_discovers_and_validates_deterministically(self) -> None:
        skills = scan_skills(ROOT)
        self.assertEqual([skill["name"] for skill in skills], ["contract-review", "service-operations"])
        self.assertTrue(all(skill["valid"] for skill in skills))
        self.assertEqual(len(skills[0]["digest"]), 64)

    def test_parses_folded_description(self) -> None:
        skill = parse_skill(
            "---\nname: folded-skill\ndescription: >-\n"
            "  Review source files\n  when code changes.\n---\n\n# Instructions\n"
        )
        self.assertEqual(skill["description"], "Review source files when code changes.")
        self.assertTrue(skill["valid"])

    def test_catalog_and_ranking(self) -> None:
        skills = scan_skills(ROOT)
        catalog = render_catalog(skills)
        self.assertTrue(catalog["text"].startswith("Available skills"))
        self.assertEqual(len(catalog["skills"]), 2)
        ranked = rank_skills(skills, "please deploy this service to production")
        self.assertEqual(ranked[0]["skill"]["name"], "service-operations")

    def test_unannotated_skill_falls_back_to_full(self) -> None:
        skill = next(skill for skill in scan_skills(ROOT) if skill["name"] == "contract-review")
        result = optimize_skill(skill, "review the contract")
        self.assertEqual(result["mode"], "full")
        self.assertEqual(result["content"], skill["content"])

    def test_author_declared_route(self) -> None:
        skill = next(skill for skill in scan_skills(ROOT) if skill["name"] == "service-operations")
        result = optimize_skill(skill, "deploy the service to production")
        self.assertEqual(result["mode"], "snipped")
        self.assertEqual(result["includedSections"], ["Safety", "Deployment", "Reporting"])
        self.assertIn("Roll back automatically", result["content"])
        self.assertNotIn("Inspect health, recent changes", result["content"])
        self.assertLess(result["optimizedEstimatedTokens"], result["originalEstimatedTokens"])

    def test_unmatched_route_returns_original(self) -> None:
        skill = next(skill for skill in scan_skills(ROOT) if skill["name"] == "service-operations")
        result = optimize_skill(skill, "write a project announcement")
        self.assertEqual(result["mode"], "full")
        self.assertEqual(result["reason"], "no-route-match")
        self.assertEqual(result["content"], skill["content"])

    def test_shared_conformance_cases(self) -> None:
        cases = json.loads((ROOT.parent / "cases.json").read_text(encoding="utf-8"))
        for fixture in cases["cases"]:
            with self.subTest(query=fixture["query"]):
                result = optimize(root=ROOT, query=fixture["query"], max_skills=1)
                selected = result["selected"][0]
                self.assertEqual(selected["name"], fixture["selected"])
                self.assertEqual(selected["mode"], fixture["mode"])
                if "includedSections" in fixture:
                    self.assertEqual(selected["includedSections"], fixture["includedSections"])
                if "includedText" in fixture:
                    self.assertIn(fixture["includedText"], selected["content"])
                if "excludedText" in fixture:
                    self.assertNotIn(fixture["excludedText"], selected["content"])


if __name__ == "__main__":
    unittest.main()

