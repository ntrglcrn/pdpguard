---
name: review-change
description: Review a substantial PDP Guard code or rule change. Use after meaningful implementation work or when asked to review architecture, regressions, tests, benchmark impact, heuristic complexity, duplication, or public rule ID stability.
---

# Review a change

1. Read [references/checklist.md](references/checklist.md).
2. Inspect the diff and trace changed functions through every caller.
3. Report only actionable findings, ordered by severity, with file and line.
4. Check architecture boundaries, regressions, tests, benchmark effects, heuristic complexity, duplication, and public IDs.
5. Run focused checks when needed; use `$verify-change` for the complete gate.

Prefer deleting duplication or reusing existing helpers over introducing a new abstraction. If no actionable findings remain, say so and name any residual test or benchmark gap briefly.
