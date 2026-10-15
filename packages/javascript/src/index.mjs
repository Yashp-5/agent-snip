import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const SKIP_DIRECTORIES = new Set([".git", "node_modules", ".venv", "__pycache__"]);
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class SkillParseError extends Error {
  constructor(message, skillPath = "") {
    super(skillPath ? `${skillPath}: ${message}` : message);
    this.name = "SkillParseError";
    this.skillPath = skillPath;
  }
}

function normalizeNewlines(value) {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseFrontmatter(source) {
  const result = {};
  const lines = source.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(lines[index]);
    if (!match) continue;

    const [, key, raw = ""] = match;
    const block = /^([|>])[-+]?\s*$/.exec(raw);
    if (!block) {
      if (raw !== "") result[key] = unquote(raw);
      continue;
    }

    const collected = [];
    let cursor = index + 1;
    while (cursor < lines.length && (lines[cursor].trim() === "" || /^\s+/.test(lines[cursor]))) {
      collected.push(lines[cursor]);
      cursor += 1;
    }
    const nonEmpty = collected.filter((line) => line.trim() !== "");
    const indent = nonEmpty.length
      ? Math.min(...nonEmpty.map((line) => /^\s*/.exec(line)[0].length))
      : 0;
    const values = collected.map((line) => line.slice(Math.min(indent, line.length)));
    result[key] = block[1] === ">"
      ? values.join(" ").replace(/\s+/g, " ").trim()
      : values.join("\n").trim();
    index = cursor - 1;
  }

  return result;
}

export function parseSkill(content, skillPath = "SKILL.md") {
  const normalized = normalizeNewlines(content);
  const lines = normalized.split("\n");
  if (lines[0] !== "---") {
    throw new SkillParseError("missing YAML frontmatter opening delimiter", skillPath);
  }

  const closeIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closeIndex < 0) {
    throw new SkillParseError("missing YAML frontmatter closing delimiter", skillPath);
  }

  const frontmatterSource = lines.slice(1, closeIndex).join("\n");
  const body = lines.slice(closeIndex + 1).join("\n").replace(/^\n/, "");
  const frontmatter = parseFrontmatter(frontmatterSource);
  const name = frontmatter.name ?? "";
  const description = frontmatter.description ?? "";
  const diagnostics = [];

  if (!name) diagnostics.push("frontmatter.name is required");
  else {
    if (name.length > 64) diagnostics.push("frontmatter.name must be at most 64 characters");
    if (!NAME_PATTERN.test(name)) {
      diagnostics.push("frontmatter.name must use lowercase letters, numbers, and single hyphens");
    }
  }

  if (!description) diagnostics.push("frontmatter.description is required");
  else if (description.length > 1024) {
    diagnostics.push("frontmatter.description must be at most 1024 characters");
  }

  return {
    name,
    description,
    path: skillPath,
    body,
    content: normalized,
    frontmatter,
    frontmatterText: lines.slice(0, closeIndex + 1).join("\n"),
    digest: createHash("sha256").update(normalized, "utf8").digest("hex"),
    valid: diagnostics.length === 0,
    diagnostics,
  };
}

async function walk(directory) {
  const files = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) files.push(...await walk(entryPath));
    } else if (entry.isFile() && entry.name.toLowerCase() === "skill.md") {
      files.push(entryPath);
    }
  }
  return files;
}

function portablePath(value) {
  return value.split(path.sep).join("/");
}

export async function scanSkills(root) {
  const absoluteRoot = path.resolve(root);
  const paths = await walk(absoluteRoot);
  const skills = [];

  for (const skillFile of paths) {
    const content = await fs.readFile(skillFile, "utf8");
    const relativePath = portablePath(path.relative(absoluteRoot, skillFile));
    const skill = parseSkill(content, relativePath);
    skills.push({ ...skill, absolutePath: skillFile });
  }

  skills.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
  return skills;
}

export function estimateTokens(text) {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 4);
}

export function skillCard(skill) {
  return {
    name: skill.name,
    description: skill.description,
    path: skill.path,
    digest: skill.digest,
    valid: skill.valid,
    diagnostics: [...skill.diagnostics],
  };
}

export function renderCatalog(skills) {
  const valid = skills.filter((skill) => skill.valid);
  const lines = ["Available skills (open SKILL.md only when relevant):"];
  for (const skill of valid) {
    lines.push(`${skill.name}\t${skill.description.replace(/\s+/g, " ").trim()}\t${skill.path}`);
  }
  const text = lines.join("\n");
  return { text, estimatedTokens: estimateTokens(text), skills: valid.map(skillCard) };
}

function terms(value) {
  return [...new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((term) => term.length > 1))];
}

export function rankSkills(skills, query) {
  const queryTerms = terms(query);
  const normalizedQuery = query.toLowerCase().trim();

  return skills
    .filter((skill) => skill.valid)
    .map((skill) => {
      const name = skill.name.toLowerCase();
      const nameTerms = new Set(terms(name));
      const descriptionTerms = new Set(terms(skill.description));
      let score = normalizedQuery && normalizedQuery.includes(name) ? 12 : 0;
      for (const term of queryTerms) {
        if (nameTerms.has(term)) score += 5;
        if (descriptionTerms.has(term)) score += 2;
      }
      return { skill, score };
    })
    .filter((entry) => queryTerms.length === 0 || entry.score > 0)
    .sort((left, right) => right.score - left.score
      || left.skill.name.localeCompare(right.skill.name)
      || left.skill.path.localeCompare(right.skill.path));
}

function levelTwoSections(body) {
  const lines = body.split("\n");
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^##\s+(.+?)\s*#*\s*$/.exec(lines[index]);
    if (heading) starts.push({ index, title: heading[1].trim() });
  }
  if (starts.length === 0) return { preamble: body, sections: [] };

  const sections = starts.map((start, index) => ({
    title: start.title,
    text: lines.slice(start.index, starts[index + 1]?.index ?? lines.length).join("\n").trimEnd(),
  }));
  return {
    preamble: lines.slice(0, starts[0].index).join("\n").trimEnd(),
    sections,
  };
}

function validateSnipConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.version !== 1 || value.fallback !== "full") return false;
  if (!Array.isArray(value.required) || !value.required.every((item) => typeof item === "string" && item)) {
    return false;
  }
  if (!Array.isArray(value.routes) || value.routes.length === 0) return false;
  return value.routes.every((route) => route && typeof route === "object"
    && Array.isArray(route.when) && route.when.length > 0
    && route.when.every((item) => typeof item === "string" && item)
    && Array.isArray(route.include) && route.include.length > 0
    && route.include.every((item) => typeof item === "string" && item));
}

async function readSnipConfig(skill) {
  const configPath = path.join(path.dirname(skill.absolutePath), "snip.json");
  try {
    const value = JSON.parse(await fs.readFile(configPath, "utf8"));
    return validateSnipConfig(value) ? value : null;
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function optimizeSkill(skill, query) {
  const originalEstimatedTokens = estimateTokens(skill.content);
  const full = (reason) => ({
    name: skill.name,
    path: skill.path,
    digest: skill.digest,
    mode: "full",
    reason,
    content: skill.content,
    originalEstimatedTokens,
    optimizedEstimatedTokens: originalEstimatedTokens,
  });

  const config = await readSnipConfig(skill);
  if (!config) return full("no-valid-sidecar");

  const queryTerms = new Set(terms(query));
  const matchingRoutes = config.routes.filter((route) => route.when.some((term) => {
    const routeTerms = terms(term);
    return routeTerms.length > 0 && routeTerms.every((candidate) => queryTerms.has(candidate));
  }));
  if (matchingRoutes.length === 0) return full("no-route-match");

  const requested = new Set([
    ...config.required.map((title) => title.toLowerCase()),
    ...matchingRoutes.flatMap((route) => route.include.map((title) => title.toLowerCase())),
  ]);
  const { preamble, sections } = levelTwoSections(skill.body);
  const available = new Set(sections.map((section) => section.title.toLowerCase()));
  if (sections.length === 0 || [...requested].some((title) => !available.has(title))) {
    return full("missing-declared-section");
  }

  const selected = sections.filter((section) => requested.has(section.title.toLowerCase()));
  const body = [preamble, ...selected.map((section) => section.text)].filter(Boolean).join("\n\n");
  const content = `${skill.frontmatterText}\n\n${body}`.trimEnd();
  return {
    name: skill.name,
    path: skill.path,
    digest: skill.digest,
    mode: "snipped",
    reason: "author-declared-route",
    content,
    includedSections: selected.map((section) => section.title),
    originalEstimatedTokens,
    optimizedEstimatedTokens: estimateTokens(content),
  };
}

export async function optimize({ root, query, maxSkills = 3 }) {
  if (!Number.isInteger(maxSkills) || maxSkills < 1) {
    throw new RangeError("maxSkills must be a positive integer");
  }
  const skills = await scanSkills(root);
  const catalog = renderCatalog(skills);
  const ranked = rankSkills(skills, query).slice(0, maxSkills);
  const selected = await Promise.all(ranked.map(async ({ skill, score }) => ({
    score,
    ...await optimizeSkill(skill, query),
  })));

  const originalEstimatedTokens = skills
    .filter((skill) => skill.valid)
    .reduce((sum, skill) => sum + estimateTokens(skill.content), 0);
  const optimizedEstimatedTokens = catalog.estimatedTokens
    + selected.reduce((sum, skill) => sum + skill.optimizedEstimatedTokens, 0);

  return {
    version: 1,
    estimator: "utf8-bytes-divided-by-4",
    root: path.resolve(root),
    query,
    catalog,
    selected,
    rejected: skills.filter((skill) => !skill.valid).map(skillCard),
    measurement: {
      allFullSkillsEstimatedTokens: originalEstimatedTokens,
      catalogPlusSelectedEstimatedTokens: optimizedEstimatedTokens,
      estimatedTokensSaved: Math.max(0, originalEstimatedTokens - optimizedEstimatedTokens),
    },
  };
}

