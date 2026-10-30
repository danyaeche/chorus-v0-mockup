# Handoff prompts

Paste these into an Aether task that **has access to the Chorus app repo** (the
Vite + TanStack + Convex + Clerk one behind `chorus-ruby.vercel.app`). Run them
in order; each builds on the last. Prompt 1 is the important one — it makes the
agent derive the design contract from your real source instead of trusting
anything second-hand.

Reference implementation to pull from:
`https://github.com/danyaeche/chorus-v0-mockup` → `port/` (PR #10).

---

## Prompt 1 — Recon and conformance brief

```
You're adding a 3D CAD geometry layer to this app. Before writing any feature
code, produce a conformance brief, because everything you add must be
indistinguishable in style from what's already here.

Read this repo and write `docs/geometry-port/conformance.md` recording, with
real file paths and real exported names:

1. The design primitives and their exact props. Find them by their rendered
   class strings rather than by guessing names:
   - page header — renders `<header class="mb-6">` with breadcrumbs, an
     `h1.mt-2.text-2xl.font-medium.text-ink`, optional caption
     `p.mt-1.5.text-sm.text-ink-subtle`, and portals its actions to a shell slot
   - breadcrumbs — `flex min-w-0 items-center font-mono text-2xs uppercase
     text-ink-subtle`, `/` separators
   - mono text — `font-mono tabular-nums tracking-tight`, props for tone/size/truncate
   - micro label — `font-mono text-2xs font-medium uppercase`, tone + `as` props
   - chip — `inline-flex ... rounded-md border px-2 py-0.5 text-xs`, value/tone/mono
   - state badge — `inline-flex items-center gap-1.5 rounded-md border border-line
     px-2 py-0.5 font-mono text-2xs uppercase text-ink-muted`, with a status dot
   - status dot — `inline-block size-1.5`, `bg-tone-ok|warn|info|danger`
   - tabs — `<div role="tablist" class="flex border-b border-line">` with buttons
     `-mb-px border-b-2 border-transparent px-3 py-2 text-sm ...
     aria-selected:border-ink aria-selected:font-medium aria-selected:text-ink`
   - table — props roughly `{columns, rows, rowKey, ariaLabel, empty, loading}`
   - the shared panel class constant `rounded-lg border border-line bg-surface-1`
   - the `cn`/`clsx` helper, and the icon default helper
     (`strokeWidth: 1.5`, `size-3.5`, `aria-hidden`)
   - the URL-synced tab hook (writes `search.tab`, `replace: true`)

2. The conventions, as rules a reviewer could check:
   type scale (`text-sm` body, `text-xs` meta, `text-2xs` labels,
   `text-2xl font-medium` titles; `font-medium` is the only weight emphasis),
   spacing (`gap-2` default, `p-3`/`p-4` panels, `pt-5` section, `space-y-5` page),
   radius (`rounded-lg` panels, `rounded-md` controls), and the fact that the
   design is flat — borders, not shadows, with the single shadow token reserved
   for popovers.

3. The empty and loading state patterns, verbatim, including copy voice
   (empty states are full sentences ending in a period).

4. Route definition pattern, and how `/part/$partId` and
   `/part/$partId/compare` are declared and parameterised.

5. The Convex layer: how part versions are stored (table name, fields), how
   `fileRefs` and R2 `r2Key` work, the signatures of the file upload/download
   helpers, and how `getPartDetail` / `getPartRevisionCompare` are shaped.

6. Answer explicitly: **is there any UI today that attaches a STEP/IGES file to
   a part version?** The only file `accept` filter I could find anywhere is
   `.csv`. If nothing attaches CAD, say so plainly and stop — the feature would
   render empty and we need to decide on an attach path first.

Do not write feature code in this step. End with the brief and any
contradictions you found between it and what I've described.
```

---

## Prompt 2 — Geometry engine and schema

```
Using the conformance brief, add the geometry engine. Copy these files from
https://github.com/danyaeche/chorus-v0-mockup (directory `port/`) — they are
pure logic with no styling and are already tested, so port them as-is, only
adjusting import paths and matching this repo's lint/format rules:

  port/lib/occt.ts           main-thread API, worker pool, three.js conversion
  port/lib/occtWorker.ts     Web Worker running OpenCascade
  port/lib/occtResult.ts     OCCT result → internal model
  port/lib/meshCodec.ts      binary container for the cached mesh
  port/lib/geometryDiff.ts   voxel-occupancy diff → added/modified/removed
  port/lib/occt-import-js.d.ts
  port/lib/geometry.test.ts             17 tests
  port/lib/occt.integration.test.ts     14 tests against real STEP

Install: `three`, `occt-import-js@0.0.23`, `-D @types/three`. The OpenCascade
WASM must be served as a static asset — publish
`node_modules/occt-import-js/dist/occt-import-js.wasm` at `/occt/` (via
vite-plugin-static-copy or equivalent) since `lib/occt.ts` defaults to
`/occt/occt-import-js.wasm`.

Then add the Convex side, modelled on port/convex/ but written to this repo's
actual conventions and table names:

  partVersionGeometry — one row per part revision:
    partVersionId, sourceR2Key, sourceFilename, sourceFormat
    (step|iges|brep|mesh), sourceBytes, meshR2Key?, thumbnailR2Key?, unit?,
    bbox?, triangleCount?, linearDeflection?, tessellationStatus
    (pending|ready|failed), tessellationError?, uploadedBy, uploadedAt
    indexes: by_partVersion, by_status

  geometryDiffCache — one row per ordered (from,to) pair:
    fromVersionId, toVersionId, regions[] {kind,bbox,volume,addedVoxels,
    removedVoxels}, addedVolume, removedVolume, modifiedVolume, voxelSize,
    clamped, fromMeshR2Key, toMeshR2Key, computedAt
    indexes: by_pair, by_from

Both tables are purely additive — do not modify any existing table.

Critical: files here live in R2 keyed by `r2Key`, not Convex `_storage`. Store
r2Keys and resolve URLs through the existing download-URL helper. Do not call
ctx.storage.

Also critical: this data is **advisory only**. Nothing in the geometry layer may
write to, or be read by, the `declaredChanged` / "External re-review required"
rule. Geometry never gates anything.

Add queries/mutations for: register CAD on a version, get geometry for a
version, get geometry for several versions (for the rail), record a
tessellation result, record a tessellation failure, get a cached diff, record a
diff. Registering different CAD on a version must invalidate cached diffs on
both sides of the pair.

Verify: typecheck clean, both test suites pass.
```

---

## Prompt 3 — UI components, in this app's design system

```
Build the geometry UI. Write it natively against the primitives in the
conformance brief — import the real components, use the real class constants.
Do not create a new stylesheet, do not use `rgb(var(--token))`, do not use
inline `style={{}}`, do not add box-shadows. The reference implementation at
https://github.com/danyaeche/chorus-v0-mockup `port/components/` is a behaviour
reference only; its styling is deliberately non-conformant and must not be
copied.

1. A CAD viewer component. three.js scene, orbit controls with damping,
   render-on-demand (only draw when something changed, so an idle viewer costs
   nothing), ResizeObserver sizing, and full disposal on unmount. Toolbar:
   zoom in, zoom out, fit, toggle grid, toggle wireframe — as icon buttons using
   this app's icon conventions (size-3.5, strokeWidth 1.5, aria-hidden) and its
   button component. Loading, error and empty states must use this app's
   existing patterns and copy voice. It must expose an imperative handle for
   fit / focus-a-region / get-camera / apply-camera.

2. A synced compare component. Two viewers side by side that stay locked
   together — dragging either moves both. Guard the two-way binding so applying
   a camera to one doesn't echo back forever. Toggles for ghost body, highlight
   changes, auto-rotate. A legend and a change list; clicking a change frames it
   in both viewers.

3. A revision rail for the Revisions tab: one entry per part version showing
   `versionLabel`, its latest/state badge, and a small geometry preview,
   selecting which revision the viewer shows.

Design rules that are not negotiable:
- identifiers, version labels, counts, volumes → the mono text component
- field labels and eyebrows → the uppercase mono micro-label
- status → the status dot + state badge, never a coloured fill
- panels → the shared `rounded-lg border border-line bg-surface-1` constant,
  padding at the use site
- empty state → the app's dashed-border pattern, copy as a full sentence
- everything must work in light and dark with no hard-coded colour

Diff overlay colours: added → `--tone-ok`, modified → `--tone-warn`,
removed → `--tone-danger`. Read these token values off the document at runtime
so the 3D overlays follow the theme (the mockup's blue "added" does not exist in
this palette and must not be introduced).

Also add the hook that loads geometry for a revision: prefer the cached mesh;
only if absent, download the source CAD, tessellate in the worker, render, then
upload the derived mesh and record it so nobody pays that cost again. Surface a
distinct loading message for the first-parse case, because it is slow.
```

---

## Prompt 4 — Wire into the two routes

```
Wire the components in. Two integration points, both of which already exist —
extend them, don't replace them.

1. `/part/$partId?tab=revisions`
   The Revisions tab currently renders one panel per version with versionLabel,
   a Latest badge, author · date, and a Files list built from `fileRefs`.
   Add the revision rail and the CAD viewer so a reviewer can see the geometry
   of the selected revision. The viewer must render the STEP that is already in
   that version's `fileRefs` — do not introduce a second upload path. Keep the
   existing "Compare revisions" link and the Files list exactly as they are.

2. `/part/$partId/compare?from=&to=`
   Introduce tabs — **Geometry** and **Attributes** — using this app's tab
   primitive and its URL-synced tab hook, matching how part detail does it.
   Move the existing attribute diff under Attributes with zero behavioural
   change. Put the synced 3D compare under Geometry. Keep the existing header,
   the from→to version labels, and the "External re-review required" badge
   exactly as they are.

   Which tab opens by default: Geometry when both revisions have ready
   geometry, otherwise Attributes.

Constraints:
- Geometry is advisory. It must not set, clear, or influence
  `declaredChanged` or the re-review badge.
- If a revision has no CAD, that must degrade gracefully to the app's empty
  state — never a broken viewer or a layout shift.
- No route or search-param may change shape for existing users; adding `tab` to
  compare must default to today's behaviour for anyone with an existing link.
```

---

## Prompt 5 — Verify and ship

```
Verify end to end and open a PR.

1. Typecheck and lint clean under this repo's own config.
2. Both geometry test suites pass (17 unit, 14 integration against real STEP
   including the CAx-IF AP203 assembly).
3. Run the app. On a part with ≥2 revisions that have STEP files attached:
   - the Revisions tab renders geometry for the selected revision
   - `/part/$partId/compare` opens on Geometry, both panes render, and dragging
     one pane moves the other
   - the change list is populated and clicking an entry frames that region in
     both panes
   - the Attributes tab behaves exactly as the compare page does on main
4. Toggle the workspace to dark. Screenshot both themes. Confirm no hard-coded
   colour and no contrast regression.
5. Confirm a part with no CAD renders the app's empty state cleanly.
6. Grep your own diff for violations: `rgb(var(`, `style={{`, `box-shadow`,
   any new `.css` file, any hex colour. There should be none.

Open a PR with before/after screenshots in a `## Screenshots` table, and call
out explicitly: what is advisory-only, what the diff's known limits are (it is a
voxel-occupancy approximation, not a b-rep feature diff, and it assumes the two
revisions share an origin), and anything in the conformance brief you could not
satisfy.
```
