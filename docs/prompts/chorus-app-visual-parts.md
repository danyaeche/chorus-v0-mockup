# Aether task brief: visual parts and assemblies in chorus-app

Give this whole file to an Aether task on **`chorus-mfg/chorus-app`** (branch from `main`). It was
written on 2026-10-28 against head `155db3a` after reading the repository's docs, tickets and the
code paths named below. Where this brief and the repository's own docs or existing contracts
disagree, the repository wins: note the deviation under the ticket's `## Comments`.

---

## 1. Goal

Every part and assembly in Chorus should be recognisable at a glance by its model:

1. **In every list** (Library › Parts, Library › Assemblies, a project's Parts tab, an assembly's
   Contents tree): a rendered thumbnail of the record's current revision, and a Grid layout beside
   the table.
2. **On its own page** (`/projects/[id]/library/parts/[partId]` and `…/assemblies/[assemblyId]`):
   a live 3D view of the selected revision's model with a 3D | 2D toggle (2D = the controlled
   drawing), a thumbnail on each revision row, and "Open in the viewer".
3. **In the details sidebar on the right** (the shell's `DetailSection` column): the model of the
   record on screen in the Part / Assembly tab, and a viewer-ready CAD file drawn in the File tab
   instead of "No preview".
4. **Revision comparison**: two revisions' models side by side with synced cameras, an overlay
   (ghost) mode, the metadata and file deltas, and changed geometry tinted amber / blue / red.

The visual reference is the Chorus v0 mockup, `danyaeche/chorus-v0-mockup` (public):

| Mockup surface | Files | Picture |
| --- | --- | --- |
| Parts gallery: static 3D thumbnail per card and per list row, List / Grid toggle | `parts-list.html`, `cadgrid.js` (one WebGL context blitted to many canvases) | `screenshots-export/07-part-list.png` |
| Part detail: 3D viewer with a 3D / 2D toggle, a 3D mini on every revision row, a right column of secondary facts | `part-detail.html`, `drawsheet.js` | `screenshots-export/08-part-detail.png` |
| Revision diff: Rev A and Rev C in two synced viewers, the current model as a frosted shell with changes in solid colour (amber modified, blue added, red removed), a "What changed" list | `revision-diff.html` | `screenshots-export/12-revision-diff.png` |

Take the **composition and behaviour** from the mockup. Take **colours, type, spacing, controls and
motion** from chorus-app's design system (`docs/design-system.md`): the neutral scale, `bg-raised`,
`border-line`, `text-secondary`, no green accent, no auto-rotation by default, reduced motion
respected. The mockup's generated 2D drawing sheets and hover popups are not ported (see §5).

## 2. What exists already (reuse; do not rebuild)

Read these before planning. The paths are at head `155db3a`.

- **Details sidebar.** `docs/right-sidebar.md`; `components/ShellDetail.tsx` (`DetailSection`,
  `DetailHeading`, `DetailKeyValue`, `DetailActions`, `DetailNote`, `detailPill`). The Part /
  Assembly overview section is rendered by `components/part/PartWorkspace.tsx` (`order={10}`, an
  `overview` prop for extra rows) and so appears on the part page, the assembly page, the supplier
  review (issue) page and the approval page. Rules that bind: register a section before its data
  loads (the part page renders `<DetailSection id="part">{null}</DetailSection>` in its loading
  tree); no "Loading…" / "Checking…" text inside a section; secondary content only, never a
  primary workflow control; never repeat a link the page already shows under the same accessible
  name; fit 300 px wide beside the content and full width below 1100 px.
- **The 3D viewer.** `docs/cad-viewer.md`; `components/viewer/three/LazyModelViewer.tsx` (a
  dynamic import, nothing of three.js in the shell bundle), `ModelViewer.tsx` (props: `url, title,
  parts, partsCut, notes, selectedId, onSelect, placing, draft, onPlace, highlight, carried,
  onCarried, compact`), `scene.ts` (`ModelScene`: `load`, `fit`, `view()`, `setView`, `lookAt`,
  `orbitBy`, `setSection`, `setHidden`, `setHighlight`, `setMeasure`, `project`, `pick`;
  `loadGeometry`). The inline embed pattern to copy is `components/pdm/Visualize.tsx`: read
  `GET /api/projects/[id]/viewer?file=<fileId>` (`lib/annotations/model.ts` `ViewerAnswer`), poll
  every 4 s while `model.readiness === "converting"` and not `stalled`, render
  `<LazyModelViewer compact url={model.url} … />` when `ready`, say the readiness sentence
  otherwise, and link `viewerHref(projectId, { file })` (`lib/hrefs.ts`).
- **CAD processing.** `docs/cad-metadata.md`, `docs/cad-viewer.md`; `lib/artifacts/stages.ts`
  (`ARTIFACT_STAGES`, `stagesFor`, `cadReader`), `lib/artifacts/processing.ts` (`convertForViewer`,
  the two-at-a-time gate, `startQueuedViewer`), `lib/cad/occt.ts` (`readCad` in `mesh` mode),
  `lib/cad/geometry.ts` (`CadModel`, `CadMesh`, `CadMetadata`, `GeometryRef`), `lib/cad/glb.ts`,
  `lib/cad/viewer.ts` (`VIEWER_LIMITS`, `ViewerReadiness`, `readinessLabel`, `partNodes`,
  `faceCentroid`, `nearestSurfacePoint`, `reanchor`, `SAME_FACE_MM`, `REANCHOR_TRIANGLES`),
  `lib/cad/metadata.ts`. Schema: `convex/schema/architecture.ts` (`artifact_processing` with the
  stage literals `text | image_description | metadata | viewer`, `viewerOutputValidator`),
  `convex/schema/cadMetadata.ts` (`cad_summaries`: kind, volume, area, part and triangle counts,
  bbox, watertight, one small row per file), `convex/schema.ts` `files`
  (`derived_from_file_id`, `derived_kind: "viewer_glb"`, indexes `by_derived_from` and
  `by_owner_own`). The **derived-file rule** (`convex/lib/viewerFiles.ts`: read only through the
  source, listed nowhere, protects nothing, replaced on re-run, goes with its source) applies to
  anything new you derive from a CAD file.
- **Doors that queue CAD stages.** `convex/lib/artifacts.ts` `queueArtifact` (a file attached to a
  system) and `convex/lib/cadVersions.ts` `recordCadVersion` (a replacement on a part revision).
  **Verify** whether the first CAD upload to a part revision (a `files` row with
  `owner_type: "package"`, written by the package upload mutation behind `uploadOwnedFile`) queues
  the stages at all; the code search found `stagesFor` called only from `queueArtifact`. If it does
  not, that door is part of ticket 01, with a resumable migration for existing package CAD files.
- **Lists.** `convex/library.ts` `list` already reads every package's files and answers
  `thumbnail_url: null` on each part row; `components/library/types.ts` (`LibraryPart.thumbnail_url`),
  `components/library/controls.tsx` (`GenericPartThumbnail`, 32 px, a cube placeholder; and a
  `Toolbar` whose "List view" button is a static stub with `aria-pressed="true"` and no handler),
  `components/library/tables.tsx` (`PartsTable`), `components/library/views.tsx` (`PartsView`, used
  by the Library's Parts and Assemblies tabs and by the project's own Parts tab with
  `projects={null}`), `lib/domain/assemblies.ts` (`partPath`, `contentsLabel`).
- **Part and assembly pages.** `app/(workspace)/projects/[id]/library/parts/[partId]/page.tsx`
  (1,052 lines: it is already past the 1,000-line bound, so every new piece of UI goes in a new
  file under `components/part/` and the page only mounts it), views `contents | dfm | package |
  files | history`; `components/part/RevisionWorkspace.tsx` → `PackageVersions.tsx` (`PackageForm`
  for the current revision, `OlderPackageRow` for the others; file rows carry `role`, among
  `ARTIFACT_ROLES` in `lib/workflow.ts`, including `cad` and `controlled_drawing`);
  `components/part/AssemblyStructure.tsx` (the Contents tree from
  `GET /api/parts/[id]/structure?revision=`); `lib/types/part.ts` (`PartDetail`, `PartPackageRow`,
  `PartFileRow`). The legacy `/parts/[id]` and `/assemblies/[id]` routes open these pages.
- **File tab.** `docs/file-preview.md`; `components/files/FileSelection.tsx`, `FilePreview.tsx`,
  `previews/load.ts`. Today "only 3D models are not drawn" and `GET /api/files/:id/preview` refuses
  them with 415 before any read.
- **Metadata comparison** exists only per system lineage (`cadVersions:compare`,
  `GET /api/projects/[id]/changes/[lineageId]/compare?from=&to=`, Design Changes). Reuse its
  wording for a side with no metadata.
- **Export control.** `docs/export-control.md`. A thumbnail, a GLB and a comparison are the file's
  content: every new read asserts the file's export access as `GET /api/projects/[id]/viewer/model`
  does, answers nothing for a withheld file (the list emits `thumbnail_url: null`), and a verified
  reader's read is logged under the most specific mark.
- **Conventions.** `.scratch/tandem-port-build/README.md` ("Working a ticket": `/ponytail` mode,
  shortest diff, no file over 1,000 lines, new tables in their own `convex/schema/<module>.ts` and
  in `TABLES` of `convex/testing.ts`, never weaken a test, never touch `lib/workflow.ts`) and its
  ticket format (`issues/43-cad-metadata.md`, `44-viewer-3d.md`: `**Plan**`, `**What to build**`,
  `**Blocked by**`, `**Status**`, `**Write boundary**`, shared contract, checkbox criteria,
  `**Tests**`, `**Out of scope**`, `## Comments`). `AGENTS.md`: run a Rams `quick_review` on edited
  UI files and `review_files` before committing (or say the tools are unavailable). Known failures
  on `main` are listed in that README; do not chase them, name them in the PR.

## 3. Tickets

Create `.scratch/visual-parts/spec.md` (this brief's §1, §2 and §4, condensed to what you keep) and
one file per ticket, `.scratch/visual-parts/issues/01-thumbnails.md` … `04-revision-compare.md`,
in the house format, with `**Status:** ready-for-agent`. Claim, build, resolve. Dependencies:
01 → {02, 03} → 04. 02 and 03 may run in parallel on disjoint write boundaries once 01 is
integrated; if you spawn children, each child owns exactly one ticket, publishes its own PR, and
you integrate them serially and run the combined gates.

### 01 · Model thumbnails (server-rendered, stored as derived files, served through the source)

**What to build.** The `viewer` stage, which already holds the model's meshes in memory after
reading the CAD file, also rasterises **one PNG thumbnail** and records it as a second derived file
of the source (`derived_kind: "thumbnail_png"`, an additive literal beside `viewer_glb`; `role:
"derived"`; the source's owner; no uploader), and names it on the stage's output
(`viewerOutputValidator` gains an optional `thumbnail_file_id`). The thumbnail follows the
derived-file rule in full.

- **Renderer** `lib/cad/thumbnail.ts`, pure TypeScript, deterministic (no randomness, no
  dependence on wall-clock), bounded: an orthographic three-quarter view of the model as the mockup's
  cards show it (camera direction from above-front-right, roughly azimuth 35° and elevation 25°),
  fitted to the bounding sphere with a small margin; a z-buffer rasteriser over every mesh's
  triangles; flat shading with one key light from the upper left, a fill from the opposite side,
  and ambient, in the neutral scale (base around `#B5B4B1`, shaded between `#D3D2CF` and
  `#6F6E6C`); a transparent background so it sits on `bg-raised` in light and dark; drawn at 2×
  and downscaled to **512 × 384** with `sharp` (already a dependency), encoded as PNG. Bounds, in
  `VIEWER_LIMITS`: triangles as the viewer's (5,000,000), **20 s** for the rasterisation inside the
  stage's 180 s, **256 KiB** output. Past a bound the thumbnail is left out and the stage records
  why on its output (the GLB still lands: a thumbnail is never a reason to fail the viewer stage).
- **Route** `GET /api/files/[id]/thumbnail` for the **source** file's id: the download route's
  authorization (`GET /api/files/[id]`), then the file's export access exactly as the model route
  asserts it, then the derived row through `files.by_derived_from`; `content-type: image/png`,
  `cache-control: private, max-age=300`, an `ETag` from the derived file's id; 404 when there is
  none (not ready, cut off, withheld, derived id given). A verified reader's read of an ITAR file's
  thumbnail is logged as the source's read, as the GLB's is.
- **Which file is a revision's model.** One helper, client-safe, in `lib/domain/files.ts` or a new
  `lib/domain/model-file.ts`: among a revision's own attached files (`files.by_owner_own` for
  `owner_type: "package"`, live, not detached), the newest with `role === "cad"` that `cadReader`
  reads; else the newest CAD-category file that `cadReader` reads; else none. An assembly's model
  is its own revision's file by the same rule (an assembly without a CAD file of its own has no
  model; it does not get a composite of its children).
- **Doors.** The stages are queued when a CAD file that `cadReader` reads is attached to a part
  revision (see §2 "Doors"): add the door if it is missing, at the mutation that records the
  package file, once per file (`artifact_processing.by_file_stage`), and
  `migrations:queuePackageCadStages` (resumable, 100 rows a call, the house pattern of
  `queueViewerConversion`) for existing package CAD files without stages. For files whose viewer
  stage is done but has no thumbnail, `migrations:queueThumbnails` re-queues the viewer stage, 100
  rows a call, resumable; the derived-file rule replaces the GLB.
- **Reads.** `convex/library.ts` `list` fills `thumbnail_url` for each part from its current
  revision's model file (the package files are already read there; one `by_file_stage` read per
  part, bounded as the list is), and answers beside it, additively, `model: { file_id, readiness,
  summary: { bbox, part_count, triangle_count } | null } | null` (readiness from the viewer stage as
  `viewerReadiness` computes it; the summary from `cad_summaries`). The part detail read
  (`GET /api/parts/[id]`) answers the same `model` per revision (`packages[].model`) and for the
  selected revision; `GET /api/parts/[id]/structure` answers `thumbnail_url` and `model.readiness`
  per node from the node's pinned (else current) revision. A withheld file answers `null`
  everywhere. A read that lists a part whose model stage is still queued starts a runner as the
  viewer read does (`startQueuedViewer`), within the existing gate.

**Write boundary.** `lib/cad/thumbnail.ts` (new), `lib/cad/viewer.ts` (bounds), `lib/artifacts/processing.ts`
(the thumbnail step of `convertForViewer`), `convex/schema/architecture.ts` and `convex/schema.ts`
(additive literals and fields), `convex/lib/viewerFiles.ts` (the second derived kind),
`convex/artifacts.ts` (`record`), `convex/library.ts`, `convex/parts.ts` (or wherever the part
detail and structure reads live), `convex/migrations.ts`, the package upload mutation,
`app/api/files/[id]/thumbnail/route.ts` (new), `lib/domain/model-file.ts` (new),
`components/library/types.ts`, `lib/types/part.ts`, `next.config.ts` (trace the CAD reader into the
route that may now start a stage, as 43 and 44 did), `docs/part-visuals.md` (new), `docs/cad-viewer.md`.

**Acceptance.**
- [ ] `tests/fixtures/cad/box-400x250x20.step` becomes viewer-ready with a thumbnail: a 512 × 384 PNG under 256 KiB, transparent at all four corners, opaque at the centre, whose decoded pixels are identical across two runs; `two-blocks.step` shows two shaded regions; the STL variants render; the minimal STEP (`e2e/fixtures/100-0290-rev-A.step`) fails as before with no thumbnail; a model past the triangle bound records "left out" on the output and keeps its GLB.
- [ ] The thumbnail row is derived: never listed (Library › Files, Artifacts tab, owner file lists, search, PDM totals, retention's walk), 404 at every file door by its own id, replaced when the stage re-runs, deleted with its source (removal, detach, draft deletion, retention), classified as its source.
- [ ] `GET /api/files/[id]/thumbnail`: 200 PNG for a member who may open the file; 403 / 404 as the download is; 404 for a withheld ITAR file to an unverified reader and a logged read for a verified one; 404 for a file without one.
- [ ] A CAD file uploaded to a part revision gets its `metadata` and `viewer` stages at upload, once; the migrations queue existing package files and existing viewer-ready files, resumably.
- [ ] `library.list` answers `thumbnail_url` and `model` per part and `null` for a withheld model; the part detail and structure reads answer them per revision and per node.
- [ ] Nothing of this is in the shell bundle; no file passes 1,000 lines; `docs/part-visuals.md` says what is rendered, its bounds, the route and the derived rule.

**Tests.** `tests/cad-thumbnail.test.ts` (the rasteriser on the fixtures: size, transparency, determinism, bounds), `tests/artifacts-thumbnail.test.ts` (the stage output, the derived row's lifecycle, both migrations, the package door), `tests/file-thumbnail-route.test.ts` (authorization, export control, caching headers), `tests/library-thumbnails.test.ts` (the list fields, withheld → null), plus the touched suites (`tests/artifacts-viewer.test.ts`, `tests/export-control-doors-files.test.ts`, the Library and part suites).

### 02 · Lists: thumbnails in every row, a Grid layout, Contents rows

**Blocked by:** 01.

**What to build.**
- `GenericPartThumbnail` shows the PNG when `thumbnail_url` is set: 4:3, at least 44 px wide,
  `object-contain` on `bg-raised` with `border-line`, `alt=""` (the row names the record), the cube
  placeholder otherwise; a `size` prop for the row (small) and the card (large).
- The Library toolbar's List button becomes a real **List | Grid** toggle: a segmented control with
  `aria-pressed`, the choice in the URL through `useLibraryParam("layout", "list", ["list",
  "grid"])` like every other Library filter. Grid cards (`components/library/cards.tsx`, new): the
  thumbnail at 4:3 on top, the name, the part number in mono, the project (when the Project column
  would show), the current revision and the coverage label, the progress label, the blocker count,
  and the status; the whole card is one link to `partPath(...)`, the row menu (Open, Delete) stays,
  the same filters, sort, pagination and empty state apply, cards are in the tab order, and the grid
  is `repeat(auto-fill, minmax(240px, 1fr))`. The selection checkboxes are a table affordance and
  are left out of the grid (say so in the ticket). Assembly cards show `contentsLabel`.
- The same `PartsView` serves the project's own Parts tab (`projects={null}`), so it gets both.
- `AssemblyStructure`: each node label starts with the node's thumbnail (small), from the
  structure read's `thumbnail_url`; a node whose model is converting shows the placeholder and
  "Converting" in its facts; the page polls the structure read every 4 s only while a node is
  converting and the document is visible.
- No GLB is ever fetched by a list; thumbnails are the only model bytes a list loads.

**Write boundary.** `components/library/controls.tsx`, `tables.tsx`, `views.tsx`, `cards.tsx` (new),
`url-state.ts`, `components/part/AssemblyStructure.tsx`, `app/globals.css` (a "Library grid" block
only if Tailwind utilities cannot express it), `docs/part-visuals.md`.

**Acceptance.**
- [ ] Library › Parts and › Assemblies and a project's Parts tab show a real thumbnail for every part whose model is ready and the placeholder otherwise, in both layouts; the layout choice survives a reload (it is in the URL) and the filters, sort and pagination keep working in the grid.
- [ ] The grid at 1280 px with the details sidebar folded shows at least four cards a row and no horizontal scrolling; at 390 px it is one column; the Rams review passes on the touched files.
- [ ] An assembly's Contents tree shows each child's thumbnail; a converting child says so and the tree refreshes when it is ready without a reload.
- [ ] Before and after screenshots of the Library Parts tab (list and grid), the Assemblies tab, a project's Parts tab and an assembly's Contents view are in the PR under `## Screenshots`.

**Tests.** `tests/library-grid-browser.test.ts` (toggle, URL state, cards, keyboard order, 390 px, no overflow at 1280 px), additions to the existing Library browser suite (thumbnails in rows), `tests/assembly-structure-browser.test.ts` or the existing assembly suite (thumbnails, converting → ready).

### 03 · Part and assembly pages, and the details sidebar

**Blocked by:** 01.

**What to build.**
- **Model panel** (`components/part/ModelPanel.tsx`, new; mounted by the page in the `package` view
  above the artifact manifest, and in the `contents` view of an assembly above the tree): for the
  selected revision's model file, the inline compact viewer as PDM Visualize embeds it, with the
  readiness sentences (converting with the 4 s poll, too large, failed with Retry for editors,
  stalled), "No model attached to this revision" when there is none, and a segmented **3D | 2D**
  toggle: 2D draws the revision's `controlled_drawing` file through the existing `FilePreview`
  (PDF, DXF, image) and says "No controlled drawing attached" otherwise. The panel's heading names
  the revision ("Model · Rev B · historical" for a historical selection) and offers "Open in the
  viewer" (`viewerHref(projectId, { file })`). Switching the revision in `PartWorkspace`'s picker
  switches the panel. No auto-rotation; the viewer's own toolbar stays.
- **Revision rows**: `PackageForm`'s header and each `OlderPackageRow` show the revision's
  thumbnail (small) before the label, placeholder when none.
- **Details sidebar.** `PartWorkspace`'s Part / Assembly section gains, above the key / value rows,
  a **Model** block: the selected (else current) revision's thumbnail at 4:3 on `bg-raised` with
  `border-line`, the placeholder when none, never a spinner or "Loading…"; under it
  `DetailKeyValue` rows "Model" (`Viewer-ready · 12,480 triangles` / `Converting` / `Not viewable` /
  `No model attached`, from `readinessLabel`) and "Size" (`180 × 120 × 42 mm` from the summary's
  bbox, when the metadata stage is done); and a `DetailActions` pill **View model** opening
  `viewerHref(projectId, { file })` in the viewer. Because `PartWorkspace` is shared, the block
  appears on the supplier review and approval pages too, for the revision they are on: confirm
  `selectedRevisionId` drives it there. The page's own link stays "Open in the viewer" and the
  sidebar's "View model", so no two controls share a name.
- **File tab.** A selected CAD file that `cadReader` reads is drawn in the File tab by the compact
  3D viewer when its viewer stage is ready (the viewer read, not the preview route, which keeps
  refusing 3D), with the readiness sentence otherwise and the Open file / Download pills unchanged;
  the tab's accessible name stays "File details: {filename}". A CAD format no reader reads keeps
  "No preview for this file's contents". The project id comes from the row (`file.project.id` in
  the Library, the part's project on the part and issue pages).

**Write boundary.** `components/part/ModelPanel.tsx` (new), `components/part/PackageVersions.tsx`,
`components/part/PartWorkspace.tsx`, `components/part/RevisionWorkspace.tsx`,
`app/(workspace)/projects/[id]/library/parts/[partId]/page.tsx` (mounting only; the file must not
grow), `components/files/FileSelection.tsx`, `components/files/FilePreview.tsx` or a new
`components/files/ModelPreview.tsx`, `docs/right-sidebar.md` (the Part and Assembly rows),
`docs/file-preview.md` (3D now drawn through the viewer), `docs/part-visuals.md`.

**Acceptance.**
- [ ] On a part with a viewer-ready model: the Package view shows the model inline, 2D shows the controlled drawing, the picker switches both, "Open in the viewer" opens the full viewer on that file; on an assembly, the Contents view shows its own model or "No model attached to this revision".
- [ ] Every revision row shows its thumbnail; a converting revision's panel polls and settles without a reload.
- [ ] The details sidebar's Part tab shows the Model block, its two rows and the View model pill on the part page, and on an issue page for the issue's revision; the section registers before data loads; `tests/browser/geist-pages.spec.ts` still finds no "Loading…" paragraph in `main`; the block fits at 300 px and below 1100 px.
- [ ] The File tab draws a ready STEP and STL in 3D, says "Converting" for one in conversion, and keeps "No preview" for a SolidWorks file; Escape, the ×, focus return and the modal sheet behave as `docs/file-preview.md` says.
- [ ] Before and after screenshots of the part page (Package view, 3D and 2D), the assembly page, the details sidebar on a part page and on an issue page, and the File tab with a model, under `## Screenshots`.

**Tests.** `tests/part-model-browser.test.ts` (Playwright with software WebGL, as `tests/viewer-3d-browser.test.ts` launches it: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`; the panel, the toggle, the picker, readiness states, the revision thumbnails), additions to `tests/detail-sidebar-browser.test.ts` (the Model block on the part, assembly and issue pages, placeholder before load), `tests/file-preview-browser.test.ts` (3D in the File tab), and the touched part, assembly and issue suites.

### 04 · Revision comparison

**Blocked by:** 03.

**What to build.** A page `…/library/parts/[partId]/compare?from=<revisionId>&to=<revisionId>`
(and the assembly route alike), rendered by `components/part/RevisionCompare.tsx` (new), reached
from a "Compare with current" link on every older revision row (Package and History views) and
from the compare page's own two revision selects (every revision with a model; a revision without
one is listed disabled with "No model"). Breadcrumb "Compare revisions", a "Back to part" link.

- **Two viewers, one camera.** `ModelViewer` gains an optional controlled camera prop
  (`camera?: { view: View | null; onView: (view: View) => void }`, built on `ModelScene.view()` /
  `setView`), so the page keeps one view state and both viewers follow it: drag either, both turn.
  `Fit` fits both to the union of their bounds.
- **Overlay mode.** A third layout beside "Side by side": one viewer drawing the `from` model as a
  ghost (translucent neutral, `depthWrite` off, drawn first) under the `to` model drawn solid.
  `ModelScene` gains `loadOverlay(url)` / `clearOverlay()`; the ghost takes no picks, section cuts
  apply to both.
- **What changed.** A panel listing, for the two models' `cad_summaries`: volume, surface area, part
  count, triangle count and each bbox axis, as `from → to (Δ, %)` rows, with the Design Changes
  compare's sentences for a side whose metadata is missing (being extracted, failed, no shape
  could be read, download-only format, withheld); the revisions' file deltas by role (added,
  removed, replaced, from the two manifests); and, for an assembly, the Contents deltas from the two
  `structure` reads (children added, removed, quantity or pinned revision changed).
- **Changed geometry, tinted** (client-side, once both GLBs are loaded, bounded). For each B-rep
  face of the `to` model (the GLB's `extras.faces` ranges, mesh by mesh): the face with the same
  `face_id` on the same mesh index in `from`, when its centroid (`faceCentroid`) moved at most
  `SAME_FACE_MM`, is **unchanged** if the farthest of its sampled vertices lies within
  `COMPARE_TOLERANCE_MM = 0.1` of the `from` surface (`nearestSurfacePoint`), else **modified**
  (amber, `--td-warning`); a face id absent from `from` is **added** (blue, `--td-info`); a `from`
  face id absent from `to` is **removed** (red, `--danger`), drawn only in
  overlay mode as a tinted ghost. One budget of `REANCHOR_TRIANGLES` triangles visited for the
  whole comparison; past it the tinting stops where it is and the panel says "Geometry comparison
  was cut short: the models are larger than the comparison reads." A legend names the three
  colours and says "Based on face matching; a face the reader numbered differently shows as
  changed." (face ids are the reader's explorer order and are not promised stable across exports:
  say so in the doc, and never present the tinting as an exact diff). A **Highlight changes**
  toggle (default on) and the legend sit in the `to` viewer as the mockup draws them.
- Export control: the page asserts both files as the viewer does; a withheld side shows the
  viewer's refusal and no deltas.

**Write boundary.** `components/part/RevisionCompare.tsx` (new), `components/viewer/three/ModelViewer.tsx`
and `scene.ts` (the camera prop, the overlay), `lib/cad/compare.ts` (new: the face classification and
the metadata deltas, pure), `app/(workspace)/projects/[id]/library/parts/[partId]/compare/page.tsx`
and the assembly twin (new), `components/part/PackageVersions.tsx` (the link), `lib/hrefs.ts`
(`revisionCompareHref`), a read route for the two sides if the existing reads do not already answer
them, `docs/part-visuals.md`, `docs/cad-viewer.md` (the new props).

**Acceptance.**
- [ ] Rev A vs Rev B of the box fixture against a modified box (generate a second fixture with `scripts/gen-cad-fixtures.mjs`: the box with one side wall thickened and a boss added) shows the thickened wall amber, the boss blue, and in overlay mode the old wall red; the summary rows show the volume and bbox deltas; dragging one viewer turns the other; Fit, section and Highlight changes work; the budget cut-off sentence shows for a synthetic pair past the budget (unit-tested on `lib/cad/compare.ts` with a small budget).
- [ ] A revision without a model is disabled in the selects; a withheld side refuses as the viewer does; an assembly comparison lists its Contents deltas.
- [ ] 390 px stacks the viewers; no auto-rotation; Rams passes; screenshots of side-by-side, overlay and the panel under `## Screenshots`.

**Tests.** `tests/cad-compare.test.ts` (classification on the fixtures and on synthetic meshes: unchanged, modified, added, removed, budget), `tests/revision-compare.test.ts` (the read, export control, the file and contents deltas), `tests/revision-compare-browser.test.ts` (software WebGL: synced cameras through the `data-view` attribute, overlay, tinting by sampled pixels or exposed state, the toggle, 390 px).

## 4. Gates for every PR

`NODE_OPTIONS=--max-old-space-size=6144 npm run typecheck`; `npm run check:agent-parity` (a new
**write** route goes into `docs/agent-parity.md`; the routes here are reads except the two
migrations, which are admin mutations run with `npx convex run`); `npx next build`; the ticket's
new Vitest files and Playwright specs; every existing suite that covers the code you touched;
`/thermo-nuclear-code-quality-review` on your own diff; Rams `quick_review` on touched UI files
and `review_files` before committing. Record each gate with `run_check` at the PR head. Before and
after screenshots of every changed screen under `## Screenshots`; no demo videos in the PR.
Publish with `publish_to_github`; keep working on the same PR for review comments and CI.

## 5. Out of scope

- The mockup's generated 2D drawing sheets (`drawsheet.js`), the hover drawing popup, and
  press-and-hold spinning in lists (no GLB is loaded by a list).
- Composite models for assemblies without a CAD file of their own (no transforms are recorded on
  `part_relationships`).
- Linking a geometry change to a finding or an issue; three-way comparison; CAD editing; Onshape;
  formats OpenCascade does not read (they keep "Metadata unavailable — download only" and the
  placeholder).
- Changing the supplier workflow machine, the export-control rules, or any existing test's
  expectations except where this brief changes behaviour (the File tab drawing 3D).

## 6. Reporting

Report through `aether_respond_to_parent` only at usable milestones: ticket 01 integrated (the
contract the others build on), then each of 02, 03 and 04, and at the end. Each report: what landed
(with the PR URL and head SHA), the gates recorded, what was left out and why, and any question
whose answer changes the work. Questions go through `ask_user`; do not stop for anything the
repository's docs already answer.
