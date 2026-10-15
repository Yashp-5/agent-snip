# `snip.json` sidecar specification — draft 1

`snip.json` is an optional Agent Snip extension. It does not modify the Agent Skills standard. Clients that do not understand it continue to load `SKILL.md` normally.

## Location

The sidecar must be named `snip.json` and reside beside `SKILL.md`.

## Schema

```json
{
  "version": 1,
  "fallback": "full",
  "required": ["Safety"],
  "routes": [
    {
      "when": ["deploy", "release"],
      "include": ["Deployment"]
    }
  ]
}
```

- `version` must equal `1`.
- `fallback` must equal `"full"`.
- `required` is an array of exact, case-insensitive level-two Markdown heading names.
- `routes` is a non-empty array.
- `routes[].when` contains lowercase or mixed-case terms. A route matches when any term appears as a complete normalized term in the task query.
- `routes[].include` contains exact, case-insensitive level-two heading names.

## Processing

When at least one route matches, the output contains:

1. the original YAML frontmatter;
2. the original body preamble before the first level-two heading;
3. every level-two section named by `required`;
4. every level-two section named by a matching route.

Sections remain in source order and include their level-three and deeper descendants.

The complete original skill must be returned when:

- no sidecar exists;
- the sidecar is invalid;
- no route matches;
- any requested heading cannot be found;
- the document has no level-two sections.

These fallback rules are normative and exist to prevent accidental instruction loss.

