"""Dependency-free Agent Skills discovery and safe context optimization."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

SKIP_DIRECTORIES = {".git", "node_modules", ".venv", "__pycache__"}
NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TERM_PATTERN = re.compile(r"[^\W_]+", re.UNICODE)


class SkillParseError(ValueError):
    """Raised when a SKILL.md file cannot be structurally parsed."""

    def __init__(self, message: str, skill_path: str = "") -> None:
        super().__init__(f"{skill_path}: {message}" if skill_path else message)
        self.skill_path = skill_path


def _normalize_newlines(value: str) -> str:
    return value.removeprefix("\ufeff").replace("\r\n", "\n").replace("\r", "\n")


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] == '"':
        try:
            return str(json.loads(value))
        except json.JSONDecodeError:
            return value[1:-1]
    if len(value) >= 2 and value[0] == value[-1] == "'":
        return value[1:-1].replace("''", "'")
    return re.sub(r"\s+#.*$", "", value).strip()


def _parse_frontmatter(source: str) -> dict[str, str]:
    result: dict[str, str] = {}
    lines = source.split("\n")
    index = 0
    while index < len(lines):
        match = re.match(r"^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$", lines[index])
        if not match:
            index += 1
            continue

        key, raw = match.group(1), match.group(2) or ""
        block = re.match(r"^([|>])[-+]?\s*$", raw)
        if not block:
            if raw:
                result[key] = _unquote(raw)
            index += 1
            continue

        collected: list[str] = []
        cursor = index + 1
        while cursor < len(lines) and (not lines[cursor].strip() or lines[cursor][0].isspace()):
            collected.append(lines[cursor])
            cursor += 1
        non_empty = [line for line in collected if line.strip()]
        indent = min((len(line) - len(line.lstrip()) for line in non_empty), default=0)
        values = [line[min(indent, len(line)) :] for line in collected]
        if block.group(1) == ">":
            result[key] = re.sub(r"\s+", " ", " ".join(values)).strip()
        else:
            result[key] = "\n".join(values).strip()
        index = cursor
    return result


def parse_skill(content: str, skill_path: str = "SKILL.md") -> dict[str, Any]:
    normalized = _normalize_newlines(content)
    lines = normalized.split("\n")
    if not lines or lines[0] != "---":
        raise SkillParseError("missing YAML frontmatter opening delimiter", skill_path)
    try:
        close_index = lines.index("---", 1)
    except ValueError as error:
        raise SkillParseError("missing YAML frontmatter closing delimiter", skill_path) from error

    frontmatter_source = "\n".join(lines[1:close_index])
    body = "\n".join(lines[close_index + 1 :])
    if body.startswith("\n"):
        body = body[1:]
    frontmatter = _parse_frontmatter(frontmatter_source)
    name = frontmatter.get("name", "")
    description = frontmatter.get("description", "")
    diagnostics: list[str] = []

    if not name:
        diagnostics.append("frontmatter.name is required")
    else:
        if len(name) > 64:
            diagnostics.append("frontmatter.name must be at most 64 characters")
        if not NAME_PATTERN.fullmatch(name):
            diagnostics.append("frontmatter.name must use lowercase letters, numbers, and single hyphens")
    if not description:
        diagnostics.append("frontmatter.description is required")
    elif len(description) > 1024:
        diagnostics.append("frontmatter.description must be at most 1024 characters")

    return {
        "name": name,
        "description": description,
        "path": skill_path,
        "body": body,
        "content": normalized,
        "frontmatter": frontmatter,
        "frontmatterText": "\n".join(lines[: close_index + 1]),
        "digest": hashlib.sha256(normalized.encode("utf-8")).hexdigest(),
        "valid": not diagnostics,
        "diagnostics": diagnostics,
    }


def scan_skills(root: str | Path) -> list[dict[str, Any]]:
    root_path = Path(root).resolve()
    skills: list[dict[str, Any]] = []
    for candidate in sorted(root_path.rglob("*")):
        if candidate.is_symlink() or not candidate.is_file() or candidate.name.lower() != "skill.md":
            continue
        if any(part in SKIP_DIRECTORIES for part in candidate.relative_to(root_path).parts[:-1]):
            continue
        relative = candidate.relative_to(root_path).as_posix()
        skill = parse_skill(candidate.read_text(encoding="utf-8"), relative)
        skill["absolutePath"] = str(candidate)
        skills.append(skill)
    return sorted(skills, key=lambda skill: (skill["name"], skill["path"]))


def estimate_tokens(text: str) -> int:
    return (len(text.encode("utf-8")) + 3) // 4


def skill_card(skill: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": skill["name"],
        "description": skill["description"],
        "path": skill["path"],
        "digest": skill["digest"],
        "valid": skill["valid"],
        "diagnostics": list(skill["diagnostics"]),
    }


def render_catalog(skills: list[dict[str, Any]]) -> dict[str, Any]:
    valid = [skill for skill in skills if skill["valid"]]
    lines = ["Available skills (open SKILL.md only when relevant):"]
    for skill in valid:
        description = re.sub(r"\s+", " ", skill["description"]).strip()
        lines.append(f'{skill["name"]}\t{description}\t{skill["path"]}')
    text = "\n".join(lines)
    return {
        "text": text,
        "estimatedTokens": estimate_tokens(text),
        "skills": [skill_card(skill) for skill in valid],
    }


def _terms(value: str) -> set[str]:
    return {term for term in TERM_PATTERN.findall(value.lower()) if len(term) > 1}


def rank_skills(skills: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    query_terms = _terms(query)
    normalized_query = query.lower().strip()
    ranked: list[dict[str, Any]] = []
    for skill in skills:
        if not skill["valid"]:
            continue
        name = skill["name"].lower()
        score = 12 if normalized_query and name in normalized_query else 0
        name_terms = _terms(name)
        description_terms = _terms(skill["description"])
        for term in query_terms:
            if term in name_terms:
                score += 5
            if term in description_terms:
                score += 2
        if not query_terms or score > 0:
            ranked.append({"skill": skill, "score": score})
    return sorted(ranked, key=lambda entry: (-entry["score"], entry["skill"]["name"], entry["skill"]["path"]))


def _level_two_sections(body: str) -> tuple[str, list[dict[str, str]]]:
    lines = body.split("\n")
    starts: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        heading = re.match(r"^##\s+(.+?)\s*#*\s*$", line)
        if heading:
            starts.append((index, heading.group(1).strip()))
    if not starts:
        return body, []
    sections = []
    for offset, (start, title) in enumerate(starts):
        end = starts[offset + 1][0] if offset + 1 < len(starts) else len(lines)
        sections.append({"title": title, "text": "\n".join(lines[start:end]).rstrip()})
    return "\n".join(lines[: starts[0][0]]).rstrip(), sections


def _valid_snip_config(value: Any) -> bool:
    if not isinstance(value, dict) or value.get("version") != 1 or value.get("fallback") != "full":
        return False
    required = value.get("required")
    routes = value.get("routes")
    if not isinstance(required, list) or not all(isinstance(item, str) and item for item in required):
        return False
    if not isinstance(routes, list) or not routes:
        return False
    return all(
        isinstance(route, dict)
        and isinstance(route.get("when"), list)
        and route["when"]
        and all(isinstance(item, str) and item for item in route["when"])
        and isinstance(route.get("include"), list)
        and route["include"]
        and all(isinstance(item, str) and item for item in route["include"])
        for route in routes
    )


def _read_snip_config(skill: dict[str, Any]) -> dict[str, Any] | None:
    config_path = Path(skill["absolutePath"]).parent / "snip.json"
    try:
        value = json.loads(config_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    return value if _valid_snip_config(value) else None


def optimize_skill(skill: dict[str, Any], query: str) -> dict[str, Any]:
    original_estimated_tokens = estimate_tokens(skill["content"])

    def full(reason: str) -> dict[str, Any]:
        return {
            "name": skill["name"],
            "path": skill["path"],
            "digest": skill["digest"],
            "mode": "full",
            "reason": reason,
            "content": skill["content"],
            "originalEstimatedTokens": original_estimated_tokens,
            "optimizedEstimatedTokens": original_estimated_tokens,
        }

    config = _read_snip_config(skill)
    if config is None:
        return full("no-valid-sidecar")
    query_terms = _terms(query)
    matching_routes = [
        route
        for route in config["routes"]
        if any((route_terms := _terms(term)) and route_terms <= query_terms for term in route["when"])
    ]
    if not matching_routes:
        return full("no-route-match")

    requested = {title.lower() for title in config["required"]}
    requested.update(title.lower() for route in matching_routes for title in route["include"])
    preamble, sections = _level_two_sections(skill["body"])
    available = {section["title"].lower() for section in sections}
    if not sections or not requested <= available:
        return full("missing-declared-section")

    selected = [section for section in sections if section["title"].lower() in requested]
    body = "\n\n".join(part for part in [preamble, *(section["text"] for section in selected)] if part)
    content = f'{skill["frontmatterText"]}\n\n{body}'.rstrip()
    return {
        "name": skill["name"],
        "path": skill["path"],
        "digest": skill["digest"],
        "mode": "snipped",
        "reason": "author-declared-route",
        "content": content,
        "includedSections": [section["title"] for section in selected],
        "originalEstimatedTokens": original_estimated_tokens,
        "optimizedEstimatedTokens": estimate_tokens(content),
    }


def optimize(*, root: str | Path, query: str, max_skills: int = 3) -> dict[str, Any]:
    if not isinstance(max_skills, int) or max_skills < 1:
        raise ValueError("max_skills must be a positive integer")
    skills = scan_skills(root)
    catalog = render_catalog(skills)
    ranked = rank_skills(skills, query)[:max_skills]
    selected = [
        {"score": entry["score"], **optimize_skill(entry["skill"], query)}
        for entry in ranked
    ]
    original = sum(estimate_tokens(skill["content"]) for skill in skills if skill["valid"])
    optimized = catalog["estimatedTokens"] + sum(skill["optimizedEstimatedTokens"] for skill in selected)
    return {
        "version": 1,
        "estimator": "utf8-bytes-divided-by-4",
        "root": str(Path(root).resolve()),
        "query": query,
        "catalog": catalog,
        "selected": selected,
        "rejected": [skill_card(skill) for skill in skills if not skill["valid"]],
        "measurement": {
            "allFullSkillsEstimatedTokens": original,
            "catalogPlusSelectedEstimatedTokens": optimized,
            "estimatedTokensSaved": max(0, original - optimized),
        },
    }

