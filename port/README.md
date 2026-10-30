# Port — mockup CAD flows → the Convex/Clerk app

Drop-in modules that add the mockup's **geometry layer** to the deployed app
(`chorus-ruby.vercel.app`). Written self-contained on purpose: they import only
`react`, `three`, and `occt-import-js` — nothing from your component library —
so they drop in without knowing your internal component names.

Styling is done entirely with the design tokens the deployed app already
defines (`--surface-*`, `--ink-*`, `--line*`, `--tone-*`, `--accent*`). Light and
dark both work with no extra wiring, because the components never hard-code a
colour.

---

## What this adds

The deployed app already has part versions, version files, Convex file storage,
and a compare route. What it does not have is any geometry: zero `three`, zero
`<canvas>`, zero WebGL in the shipped bundle. Its `/part/$partId/compare` diffs
*declared attributes* (value + unit). These modules add the geometric dimension
alongside it.

| Module | Adds |
|---|---|
| `components/CadViewer.tsx` | Inline 3D viewer — orbit/pan/zoom, fit, grid, wireframe, drag-a-file-to-replace |
| `components/RevisionCompare3D.tsx` | Two **synced** viewers, ghost-body + highlight-changes toggles, added/modified/removed legend |
| `lib/occt.ts` | Real **STEP/IGES** parsing via OpenCascade compiled to WASM, off the main thread |
| `lib/geometryDiff.ts` | Voxel-based geometric diff between two tessellated revisions |
| `convex/schema.additions.ts` | Additive tables — geometry, tessellation cache, diff cache |
| `convex/geometry.ts` | Queries/mutations for the above |

---

## Assumptions I had to make

I could not read your repo when I wrote this (the Aether GitHub App is scoped to
`chorus-v0-mockup` only), so these are inferred from your shipped bundle. Each is
marked `ASSUMPTION:` at its use site.

1. There is a `partVersions` table keyed by a Convex id, with a `versionLabel`
   field — inferred from `getPartRevisionCompare` returning
   `fromVersion.versionLabel` / `toVersion.versionLabel`.
2. Part-version files go through `graph.parts.addPartVersionFile` and Convex
   storage (`kernel.files.generateUploadUrl` / `generateDownloadUrl`).
3. Your Convex API is namespaced `graph.*` / `kernel.*`, so these land as
   `graph.geometry.*`.
4. The compare route already resolves a from/to pair via
   `graph.partCompare.getDefaultComparePair`, so the 3D panel can reuse that pair
   rather than introducing its own revision picker.

Where an assumption is wrong the fix is renaming a table or a function reference,
not restructuring the modules.

---

## Install

```bash
npm i three occt-import-js
npm i -D @types/three
```

`occt-import-js` ships a `.wasm` that must be served as a static asset. With Vite:

```ts
// vite.config.ts
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [{
        src: 'node_modules/occt-import-js/dist/occt-import-js.wasm',
        dest: 'occt',
      }],
    }),
  ],
})
```

That publishes it at `/occt/occt-import-js.wasm`, which is the default
`wasmUrl` in `lib/occt.ts`. Override via the `wasmUrl` option if you host it
elsewhere.

---

## The tessellation strategy (worth reading)

STEP is a b-rep format — it describes surfaces analytically, not as triangles.
It cannot be handed to three.js directly. OpenCascade has to tessellate it first,
which for a real part is expensive (hundreds of ms to seconds, and the WASM
binary is ~7 MB).

So parsing every STEP on every page view would be unusable. The flow here is
**tessellate once, then never again**:

1. First view of a revision → download the STEP from Convex storage, tessellate
   in a Web Worker, render.
2. Immediately upload the tessellated mesh back to Convex storage as a compact
   binary blob, recorded in `partVersionGeometry.meshStorageId`.
3. Every later view — any user, any device — downloads that mesh directly and
   skips OpenCascade entirely. The 7 MB WASM is never even fetched.

`tessellationStatus` on the geometry row tracks which state a revision is in, so
the UI can show progress rather than appearing to hang. This is why the schema
separates the **source CAD file** from the **derived render mesh** — they have
different lifecycles, and only the source is authoritative.

---

## Try it

`port/demo/` is a small Vite app that runs these components standalone, against
the deployed app's real design tokens, in both themes:

```bash
cd port/demo
npm install
npm run dev        # http://localhost:4600
```

Drag any STEP/IGES/BREP file onto the viewer to load your own part. Three sample
STEP files ship with it, copied from `occt-import-js`'s test suite (MIT) —
including `as1-tu-203.stp`, the CAx-IF AP203 interoperability assembly.

## Verified

```bash
npx tsc -p port/tsconfig.json           # strict, clean
npx tsx port/lib/geometry.test.ts       # 17 passed — codec + diff
npx tsx port/lib/occt.integration.test.ts   # 14 passed — real STEP through the pipeline
```

The integration suite runs real STEP files through OpenCascade and asserts on the
result: b-rep face ranges survive, indices stay in range, deflection controls mesh
density, the codec round-trips a real assembly byte-for-byte, and the diff
correctly reports added/removed/moved solids. In the browser demo the CAx-IF
assembly parses in ~1.7 s (139 KB STEP → 4,688 triangles → 178 KB cached), and
after that the cached path skips OpenCascade entirely.

## Honest limits

- **The diff is approximate.** A true b-rep diff (matching faces/features between
  two STEP models) is a research-grade problem. `geometryDiff.ts` works on
  tessellated geometry with a voxel occupancy comparison, which reliably catches
  *added material*, *removed material*, and *moved/reshaped regions* — the three
  buckets the mockup's legend shows. It will not tell you "the draft angle on
  face 12 changed from 1° to 3°". Treat it as a visual aid that directs a
  reviewer's eye, not as a metrology tool.
- **Alignment is assumed.** Two revisions are compared in their own coordinate
  systems. If a revision moves the origin, everything reads as changed. Best-fit
  registration is a follow-on if it turns out to matter.
- **Very large assemblies.** Voxel diffing is O(triangles); above ~2M triangles
  you'd want to push the diff server-side and cache the result, which is what
  `geometryDiffCache` in the schema is there for.
- **The mockup's viewer is not a reference implementation.** Its geometry is
  generated procedurally from a shape keyword (`enclosure`, `bezel`, `housing`…)
  out of three.js primitives; the `.step` filenames in it are decorative labels.
  What ported is the interaction design and the visual language, not its
  rendering code — that had to be written against real CAD.
