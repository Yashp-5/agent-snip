# Architecture

Agent Snip separates portable semantics from provider integrations.

## Core model

A discovered skill has:

- original path and byte content;
- parsed Agent Skills metadata;
- validation diagnostics;
- SHA-256 digest;
- estimated token cost;
- optional, author-owned `snip.json` routing metadata.

The core performs no network calls and executes no skill scripts.

## Optimization stages

1. **Discover**: recursively find `SKILL.md` files without following symbolic links.
2. **Validate**: check the required metadata used for discovery.
3. **Catalog**: render a deterministic list of name, description, and path.
4. **Rank**: score local lexical overlap with stable tie-breaking.
5. **Activate**: select at most the requested number of skills.
6. **Snip**: return the full skill unless a valid author-owned sidecar selects sections.
7. **Measure**: report original and optimized estimates with provenance.

Ranking is intentionally replaceable. Embedding or model-based selectors belong in adapters so the reference core remains local, deterministic, and dependency-free.

## Planned tool pipeline

Tool support will add a canonical JSON Schema representation and three modes:

- native schemas after relevance filtering;
- compact signatures with local decoding and original-schema validation;
- a dispatcher tool for very large catalogs.

Unsupported schemas must bypass compaction. Provider-specific constrained decoding must not be silently replaced with text parsing.

## Portability

The JavaScript and Python libraries implement the same public data model. Shared fixtures define conformance behavior. A future Rust core and gateway will expose this model over a stable JSON protocol so Go, Java, and .NET clients can remain thin.

