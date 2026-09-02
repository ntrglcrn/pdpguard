# PDP Guard Design System v1

PDP Guard product UI composes domain components from `src/components/ui` primitives. Those primitives build on shadcn and Radix; shadcn supplies behavior and baseline structure, not PDP Guard visual decisions.

## Tokens

`src/app/globals.css` has two layers. Product foundation tokens define canvas, surfaces, text, `--accent`, `--border`, severity colors, radii, and shadow. Semantic tokens map them to application intent: shadcn `background`, `foreground`, `primary`, `card`, `muted`, `input`, and `ring`, plus `surface-raised`, `interactive`, and status colors. Prefer these roles over raw colors. `--accent` and `--border` are product-owned and must retain their meanings; `--shadcn-accent` maps shadcn's quiet `accent` surface to `interactive` instead of redefining product `--accent`.

The current system-theme dark mode swaps foundation values, so all semantic tokens adapt without component-specific theme rules.

## Type, density, and surfaces

Use display for page titles, title for sections/components, body for reading, compact for controls and descriptions, meta for labels, and `--font-mono` only for technical values. Use Tailwind's 4px spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64px. Prefer compact 12–16px component padding, 16–24px cards, and 24–40px sections.

The canvas holds `surface` content. `surface-raised` is reserved for an elevated panel; `interactive` and `interactive-hover` are for controls. Do not stack cards merely to create hierarchy; use spacing, type, and borders first.

## States and primitives

Finding severity follows the domain: `critical`, `warning`, `info`; a passed finding is its separate `status`. Audit summary is `critical`, `warning`, or `passed`. Future run states such as queued/running/completed/failed must use an explicit text label (and icon where useful), not color alone. Severity tokens are `severity-*`; `passed` is separate from severity.

Button variants are `default`, `secondary`, `outline`, `ghost`, `destructive`, and `link`; sizes are compact through `lg`. Badge adds `critical`, `warning`, `info`, and `passed` variants. Input has default and `lg` `density`. Card has `default` (bordered surface) and `subtle` variants; avoid using a Card inside a Card without a clear information boundary.

Every interactive primitive keeps hover, disabled, and visible keyboard focus states. Labels remain associated with inputs; tooltips supplement, never replace, a name or instruction. Preserve wrapping/ellipsis protections for URLs and evidence, and honor reduced motion.

## Adding UI

Use an existing PDP Guard primitive before adding one. Add a shadcn primitive only when an implemented product flow needs its accessible behavior. Extend a semantic token or primitive variant for a recurring visual pattern; do not bypass the system with arbitrary colors, spacing, or component-specific theme hacks.
