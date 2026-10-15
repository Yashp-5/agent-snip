# Contributing

Agent Snip is intentionally conservative: token savings must not silently change the meaning of a skill or tool schema.

Before opening a change:

1. Add or update a shared fixture under `conformance/`.
2. Keep JavaScript and Python behavior aligned.
3. Add tests for fallback behavior as well as the optimized path.
4. Report token reduction separately from task correctness.
5. Do not introduce network calls into discovery or ranking defaults.

Run both suites:

```bash
npm test
python -m unittest discover -s packages/python/tests -v
```

By contributing, you agree that your contribution is licensed under Apache-2.0.

