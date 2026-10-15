# Agent Snip

**Budget-aware, lossless-by-default context optimization for Agent Skills and LLM tools.**

Agent Snip reduces the tokens spent advertising and loading reusable agent capabilities. It is a standalone, provider-neutral library built around the open [Agent Skills](https://agentskills.io) `SKILL.md` format.

The project is experimental. The first vertical slice supports:

- recursive `SKILL.md` discovery and validation;
- compact discovery catalogs containing only name, description, and path;
- deterministic, local skill ranking;
- progressive loading of only selected skills;
- author-controlled section snipping through an optional `snip.json` sidecar;
- safe full-instruction fallback for every unannotated or invalid skill;
- equivalent JavaScript/TypeScript and Python APIs;
- a portable `SKILL.md` integration that any skills-compatible agent can install.

Agent Snip never edits the source skill. Every optimized result includes a SHA-256 digest and a record of whether the full or author-declared subset was returned.

## Why
Agent Skills already use progressive disclosure: agents discover names and descriptions, then load full instructions only when a skill is relevant.
Agent Snip makes that lifecycle measurable and portable across agent runtimes. It adds deterministic selection, explicit budgets, provenance, and an opt-in mechanism for loading only declared sections of large skills.

```text
Skill directories
      ↓
discover + validate
      ↓
compact catalog
      ↓
rank for the current task
      ↓
full skill OR author-declared sections
      ↓
provider / framework / agent harness
```

## Safety contract

1. An ordinary `SKILL.md` is always returned in full after activation.
2. Section snipping is enabled only by a valid `snip.json` written by the skill author.
3. Missing sections, invalid configuration, or an unmatched route fall back to the full skill.
4. Source files are never rewritten.
5. Token counts from the built-in estimator are clearly labeled estimates. Provider tokenizers can be added through adapters.

Do not use ranking as an authorization boundary. A caller must still enforce its normal tool permissions, sandboxing, approvals, and trust policy for third-party skills.

## JavaScript / TypeScript

Requires Node.js 20 or later and has no runtime dependencies.

```js
import { optimize } from "agent-snip";

const result = await optimize({
  root: ".agents/skills",
  query: "deploy the API to production",
  maxSkills: 3,
});

console.log(result.catalog.text);
console.log(result.selected);
```

The package includes TypeScript declarations.

### CLI

```bash
agent-snip scan .agents/skills
agent-snip select .agents/skills --query "review this pull request" --max 3
agent-snip pack .agents/skills --query "deploy the API" --max 2 --pretty
```

## Python

Requires Python 3.11 or later and has no runtime dependencies.

```python
from agent_snip import optimize

result = optimize(
    root=".agents/skills",
    query="deploy the API to production",
    max_skills=3,
)
print(result["catalog"]["text"])
```

## Portable Agent Skill

Copy [`integrations/agent-skills/agent-snip`](integrations/agent-skills/agent-snip) into any Agent Skills directory, such as `.agents/skills/`. The integration teaches a compatible agent how to inspect and pack skills with the CLI. It contains no vendor-specific instructions.

## Optional `snip.json`

Place `snip.json` next to `SKILL.md`:

```json
{
  "version": 1,
  "fallback": "full",
  "required": ["Safety", "Common workflow"],
  "routes": [
    {
      "when": ["deploy", "release", "production"],
      "include": ["Deployment"]
    }
  ]
}
```

When a route matches, Agent Snip returns the skill preamble plus the required and routed level-two sections. Otherwise, it returns the original `SKILL.md` byte-for-byte. See [`spec/SNIP_SIDECAR.md`](spec/SNIP_SIDECAR.md).

## Roadmap

- exact provider token counters and benchmark corpus;
- MCP `tools/list` selection proxy;
- JSON Schema tool-signature compaction with original-schema validation;
- OpenAI, Anthropic, A2A, and OpenAPI adapters;
- Rust core and gateway;
- Go, Java, and .NET clients;
- signed manifests, trust policies, and prompt-injection scanning.

## Development

```bash
npm test
python -m unittest discover -s packages/python/tests -v
```

Both implementations share the fixtures under `conformance/`.

## License

Apache-2.0. See [`LICENSE`](LICENSE).

