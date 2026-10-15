import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  optimize,
  optimizeSkill,
  parseSkill,
  rankSkills,
  renderCatalog,
  scanSkills,
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../conformance/fixtures");

test("discovers and validates Agent Skills deterministically", async () => {
  const skills = await scanSkills(root);
  assert.deepEqual(skills.map((skill) => skill.name), ["contract-review", "service-operations"]);
  assert.ok(skills.every((skill) => skill.valid));
  assert.equal(skills[0].digest.length, 64);
});

test("parses folded descriptions", () => {
  const skill = parseSkill(`---\nname: folded-skill\ndescription: >-\n  Review source files\n  when code changes.\n---\n\n# Instructions\n`);
  assert.equal(skill.description, "Review source files when code changes.");
  assert.equal(skill.valid, true);
});

test("renders a compact deterministic catalog", async () => {
  const catalog = renderCatalog(await scanSkills(root));
  assert.match(catalog.text, /^Available skills/);
  assert.match(catalog.text, /contract-review\tReview contracts/);
  assert.equal(catalog.skills.length, 2);
});

test("ranks the relevant skill first", async () => {
  const ranked = rankSkills(await scanSkills(root), "please deploy this service to production");
  assert.equal(ranked[0].skill.name, "service-operations");
  assert.ok(ranked[0].score > 0);
});

test("unannotated skills always fall back to full content", async () => {
  const skill = (await scanSkills(root)).find((candidate) => candidate.name === "contract-review");
  const result = await optimizeSkill(skill, "review the contract");
  assert.equal(result.mode, "full");
  assert.equal(result.content, skill.content);
});

test("author-declared routes include required sections and omit unrelated sections", async () => {
  const skill = (await scanSkills(root)).find((candidate) => candidate.name === "service-operations");
  const result = await optimizeSkill(skill, "deploy the service to production");
  assert.equal(result.mode, "snipped");
  assert.deepEqual(result.includedSections, ["Safety", "Deployment", "Reporting"]);
  assert.match(result.content, /Roll back automatically/);
  assert.doesNotMatch(result.content, /Inspect health, recent changes/);
  assert.ok(result.optimizedEstimatedTokens < result.originalEstimatedTokens);
});

test("an unmatched route returns the original skill", async () => {
  const skill = (await scanSkills(root)).find((candidate) => candidate.name === "service-operations");
  const result = await optimizeSkill(skill, "write a project announcement");
  assert.equal(result.mode, "full");
  assert.equal(result.reason, "no-route-match");
  assert.equal(result.content, skill.content);
});

test("shared conformance cases pass", async () => {
  const cases = JSON.parse(await readFile(path.resolve(root, "../cases.json"), "utf8"));
  for (const fixture of cases.cases) {
    const result = await optimize({ root, query: fixture.query, maxSkills: 1 });
    assert.equal(result.selected[0].name, fixture.selected);
    assert.equal(result.selected[0].mode, fixture.mode);
    if (fixture.includedSections) {
      assert.deepEqual(result.selected[0].includedSections, fixture.includedSections);
    }
    if (fixture.includedText) assert.match(result.selected[0].content, new RegExp(fixture.includedText));
    if (fixture.excludedText) assert.doesNotMatch(result.selected[0].content, new RegExp(fixture.excludedText));
  }
});

