# Plan — geometry layer into the Chorus app

## Context

The mockup (this repo) has CAD flows the deployed app doesn't: an inline 3D
viewer on a part revision, and a synced two-pane revision diff with
added/modified/removed highlighting. The deployed app (Vite + TanStack Router +
Convex + Clerk, `chorus-ruby.vercel.app`) has **no geometry at all** — zero
`three`, zero `<canvas>`, zero `WebGLRenderer` in its shipped bundle. Its
`/part/$partId/compare` diffs *declared attributes* (value + unit).

The requirement is that anything crossing over adopts the app's style, system
structure, format and design class — the app's aesthetic is the target, not the
mockup's. So this is not "move the mockup's components"; it is "rebuild those
two flows natively in the app's design system."

A working, tested reference implementation of the hard parts (STEP parsing,
mesh caching, geometric diff) already exists in `port/` on PR #10. Its **engine
is reusable as-is**; its **UI is not** — see "What gets rebuilt" below.

## Decisions taken

| Question | Decision |
|---|---|
| Compare layout | **Tabs: Geometry \| Attributes**, using the app's existing tab primitive |
| Re-review gate | **Advisory only** — geometry never sets `declaredChanged` or any gate |
| Extra scope | **Revision rail on the Revisions tab** only |
| CAD rendering | **Real STEP** via `occt-import-js` (OpenCascade → WASM) |
| Not in scope | drag-to-replace upload, Parts Library thumbnails, file chips |

## Integration points (confirmed from the bundle)

**1. `/part/$partId?tab=revisions`** — the Revisions tab already exists.
Component takes `{ partId, versions }`, renders `<section class="space-y-3 pt-5">`,
a "Compare revisions" link when there are ≥2 versions, then one
`<article class="rounded-lg border border-line bg-surface-1 p-4">` per version
with `versionLabel`, a `Latest` badge, author · date, and a **Files** list built
from `version.fileRefs`. Each version carries `_id`, `versionLabel`, `isLatest`,
`createdAt`, `createdByName`, `fileRefs[]`.

*Change:* add a viewer to each revision article, and a rail affordance for
selecting which revision is displayed. The Files list already renders the STEP —
the viewer renders the same file rather than introducing a parallel upload path.

**2. `/part/$partId/compare?from=&to=`** — route defined with
`validateSearch: e => ({ from, to })`, falls back to
`graph.partCompare.getDefaultComparePair`. Currently renders "Revision compare",
`fromVersion.versionLabel → toVersion.versionLabel`, an
"External re-review required" badge when `declaredChanged`, and the attribute
table.

*Change:* introduce tabs — **Geometry** and **Attributes** — with the existing
attribute table moving under Attributes unchanged. Tab state uses the app's
URL-synced tab hook (same one part detail uses, `search.tab`, `replace: true`).

## Storage model — corrected

Files are in **R2, addressed by an opaque `r2Key` string**, not Convex
`_storage`. Confirmed: `kernel.files.generateDownloadUrl({ r2Key }) -> { url }`,
and `version.fileRefs[].r2Key`. The geometry tables therefore store r2Keys only
and let the existing helper resolve URLs. (`port/convex/` has been corrected;
the first published version wrongly used `v.id('_storage')`.)

## Schema (additive, nothing existing is modified)

- **`partVersionGeometry`** — one row per part revision: `sourceR2Key`,
  `sourceFilename`, `sourceFormat`, `meshR2Key?`, `thumbnailR2Key?`, `unit?`,
  `bbox?`, `triangleCount?`, `linearDeflection?`, `tessellationStatus`
  (`pending|ready|failed`), `tessellationError?`.
  Indexes: `by_partVersion`, `by_status`.
- **`geometryDiffCache`** — one row per ordered `(from, to)` pair: `regions[]`,
  volume totals, `voxelSize`, `clamped`, plus `fromMeshR2Key`/`toMeshR2Key` as
  the invalidation key. Indexes: `by_pair`, `by_from`.

No field feeds any gate — advisory only, per decision.

## Why tessellation is cached

STEP is b-rep: it describes surfaces analytically and cannot go to three.js
directly. OpenCascade must tessellate it, and its WASM is ~7 MB. So: first view
downloads the STEP, tessellates in a Web Worker, renders, then uploads the
derived mesh; every later view — any user, any device — fetches that mesh and
never loads OpenCascade. This is why the schema separates the authoritative
**source CAD** from the disposable **render mesh**.

## What gets reused vs rebuilt

**Reused unchanged** (pure logic, no styling, already tested):
`port/lib/occt.ts`, `occtWorker.ts`, `occtResult.ts`, `meshCodec.ts`,
`geometryDiff.ts`, and both test suites.

**Rebuilt against the app's design system** — the existing components were
written standalone (own CSS file, `rgb(var(--token))`, box-shadows, inline
styles, sentence-case labels) and do not conform:

| Mockup/port habit | App convention it must become |
|---|---|
| `cad.css` + `rgb(var(--token))` | Tailwind semantic utilities — `text-ink-subtle`, `border-line`, `bg-surface-1` |
| `box-shadow` on toolbar/legend | flat; borders only. The one shadow token, `shadow-panel`, is for popovers |
| panel styling ad hoc | the shared panel constant: `rounded-lg border border-line bg-surface-1`, padding at use site |
| sentence-case labels | mono uppercase micro-label — `font-mono text-2xs font-medium uppercase` |
| numbers in body font | the Mono component — `font-mono tabular-nums tracking-tight` |
| coloured status pills | status **dot** (`size-1.5`, `bg-tone-*`) + uppercase mono text in a bordered chip |
| inline `style={{}}` | utilities only |
| icons 14px / strokeWidth 1.3 | `size-3.5`, `strokeWidth: 1.5`, `aria-hidden` |
| ad-hoc empty state | `rounded-lg border border-dashed border-line p-8 text-sm text-ink-muted`, full sentence with a period |
| custom toggles | the app's Button variants / chip components |

**Type scale:** `text-sm` for body, `text-xs` for meta, `text-2xs` for labels,
`text-2xl font-medium` for page titles. `font-medium` is the only weight
emphasis. **Spacing:** `gap-2` default, `p-3`/`p-4` panels, `pt-5` section
rhythm, `space-y-5` page rhythm. **Radius:** `rounded-lg` panels, `rounded-md`
controls.

## Diff legend colours

The mockup's legend was orange/blue/red; the app's palette has no blue. Change
kinds map onto existing semantic tones: **added → `--tone-ok`**,
**modified → `--tone-warn`**, **removed → `--tone-danger`**. The 3D overlays
read those token values off the document at runtime, so they track the theme.

## Verification

1. `tsc` clean under the app's own strict config.
2. Existing suites still pass: `geometry.test.ts` (17), `occt.integration.test.ts`
   (14, real STEP incl. the CAx-IF AP203 assembly).
3. Run the app; on a part with ≥2 revisions carrying STEP files: the Revisions
   tab renders geometry per revision, and `/part/$partId/compare?tab=geometry`
   shows both panes synced, with the change list populated.
4. Toggle the workspace to dark and confirm no hard-coded colour appears.
5. Confirm the Attributes tab is byte-identical in behaviour to today's compare
   page, and that no geometry state can set `declaredChanged`.

## Open items for the implementing task

- **Does any current UI attach a STEP to a part version?** The only `accept`
  filter in the bundle is `.csv`, and there are no `.step`/`.iges` strings. If
  nothing attaches CAD today, the feature renders empty until something does —
  confirm against the real repo, and if so, raise it before building.
- Exact names of the design primitives (page header, breadcrumbs, chip, mono,
  label, state badge, status dot, tabs, table) — discover them in the real
  source rather than assuming.
- The shape of `kernel.files.generateUploadUrl` (not visible in the bundle).
- Whether `partVersions` is the real table name.
