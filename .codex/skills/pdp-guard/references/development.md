# PDP Guard delivery rules

| Task              | Read first                             | Verification                                                           |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Docs only         | Direct docs                            | `git diff --check`; `pnpm format:check` for Markdown.                  |
| Localized code    | Owner and direct tests                 | Focused test plus lint/typecheck as applicable.                        |
| Engine/rule       | Audit contract, rule, tests, benchmark | Regression test, benchmark, lint, typecheck.                           |
| Security boundary | Owner, route/service, hosted boundary  | Focused security tests, lint/typecheck, independent review.            |
| Frontend          | Route/component, design system         | Lint/typecheck; browser/a11y review when behavior changes.             |
| Milestone         | Snapshot, architecture, roadmap + PRD  | lint, typecheck, test, benchmark if engine changes, build, diff check. |

Use the architecture map before a repository-wide scan. Read only relevant
source; use `code-mapper` for unfamiliar cross-cutting areas. Stage work as
discovery → implementation → review. Reuse the discovery handoff rather than
repeating scans or copying full project context into every prompt. Avoid
browser/build/benchmark work unless this table requires it.

| Need                           | Recommended role                            |
| ------------------------------ | ------------------------------------------- |
| Milestone coordination         | `multi-agent-coordinator`                   |
| Unfamiliar ownership           | `code-mapper`                               |
| Architecture/security boundary | `architect-reviewer`                        |
| Next.js SaaS work              | `nextjs-developer`                          |
| UI/design                      | `frontend-developer` / `ui-designer`        |
| Browser/accessibility          | `browser-debugger` / `accessibility-tester` |
| Independent final review       | `reviewer`                                  |

Use 0–2 agents for a small task and normally 2–5 independently scoped agents
for a milestone. Do not duplicate repository scans across agents.
