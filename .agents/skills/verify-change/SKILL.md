---
name: verify-change
description: Run the complete PDP Guard verification gate after code, rule, benchmark, route, browser, or storage changes. Use before finishing implementation or when asked to lint, typecheck, test, benchmark, and build the project.
---

# Verify a change

Run:

```sh
.agents/skills/verify-change/scripts/verify.sh
```

The script stops at the first failure and runs only the project checks defined in `package.json` and documented as the current gate. Report the failing command and its output; do not bypass or weaken a check.

For network, browser, route, or storage changes, also review SSRF, resource exhaustion, path traversal, and error disclosure risks using [references/security-review.md](references/security-review.md).
