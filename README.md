# Chorus

> **DFM as a workflow — not a slide deck.**
> A GitHub-Issues-style system for Design-for-Manufacturability between a brand and the manufacturing providers it sources from.

**Live:** **[withchorus.ai](https://withchorus.ai)**

Chorus replaces the **CAD → PowerPoint → email** loop that DFM review usually lives in. Every manufacturing risk becomes a tracked, stateful **issue** — raised on a revision *by a provider*, dispositioned by the brand, implemented in a new revision, validated by the reviewer who raised it, and closed. A part isn't "done at zero open issues" — it's cleared to **cut steel** when **every issue is dispositioned and the joint sign-offs are signed**.

> **The DFM Issue is the atomic unit of work.**  `Package → Issues → Disposition → Validation → Sign-off → DFM Approval`

![Dashboard](screenshots/dashboard.png)

---

## The model

**Hierarchy** — a **part design is reusable**: it lives in the workspace and can be referenced by many projects. The **DFM process belongs to each (part × project) membership**, not to the part — so the same part runs a *separate, independent DFM* in every project it's used in, each able to host several parallel provider reviews.

```
Workspace
├─ Part (design)              reusable — number · geometry · material · process
│                             the SAME design can be referenced by many projects
└─ Project
   └─ Part-in-Project ──┬─ Package        gate: must be Complete before reviewers can be invited
      the DFM process;  ├─ Revisions      shared design — every provider reviews these
      one per           ├─ DFMs           one per provider · parallel · walled off from each other
      (part × project)  │     └─ Issue (typed) → Disposition → Implemented → Validated → Closed
                        ├─ Issue Groups   brand rolls up the same issue across providers (+ conflict flag)
                        ├─ Sign-offs      parting line · gate · material lock · tooling (joint, signed)
                        └─ DFM Approval    the terminal gate — freeze the revision, cut steel
```

**The six fixes (v2)** that shape the model:

1. **Package gate** — reviewers can't be invited until the OEM package meets a process-type checklist.
2. **Issue Type axis** — *Show-stopper · Finding · Proposal · Info* route through disposition differently.
3. **Per-DFM revision pointer** — Provider 1 can be reviewing Rev B while Provider 2 is still on Rev A.
4. **Issue Groups** — the brand dispositions one cross-provider duplicate once; conflicts are flagged.
5. **Sign-offs** — parting line, gate, material lock are *joint agreements*, not issues one side "accepts."
6. **DFM Approval gate** — the terminal state is the steel-cut decision (all issues dispositioned + sign-offs signed + revision frozen).

**Issue lifecycle — derived state**

```
Open → Dispositioned → Implemented → Validated → Closed
 ├─ Dispositioned (rejected) → Closed            rationale required
 ├─ Needs clarification → Open                    loop
 └─ Implemented → Validation failed → Open        reopen
```

Each issue carries: title, **type** (Show-stopper/Finding/Proposal/Info), **severity**, **category** (Geometry/Tolerance/Material/Tooling/Assembly/Process/Cost-Yield), recommendation, optional **cost/yield impact**, the brand **disposition** (Accept / Reject-with-rationale / Needs clarification), implementation status, validation (owned by the reviewer who raised it), and the revisions it was *created on* and *fixed in*.

**Part state:** `Draft → Package Complete → DFM Active → Awaiting Validation → DFM Approved`

**Actors**

| Brand (e.g. ALSO) | External reviewer — one per provider (e.g. Hsinchu Precision) |
|---|---|
| Owns design intent | Owns manufacturability |
| Creates projects/parts, uploads shared revisions | Reviews revisions, raises typed DFM issues |
| Dispositions every issue, implements fixes, co-signs sign-offs | Validates the fixes to *its own* issues; co-signs sign-offs |
| *Cannot validate its own fixes* | *NDA-gated, watermarked, and walled off from other providers' DFMs* |

---

## Screens

### Dashboard — workspace-wide, cross-project
DFM rolled up across every program: open issues, awaiting validation, dispositioned, sign-offs pending, and **DFM-approved parts** — plus a parts-status donut, issue throughput, cross-project "needs attention," and a by-project table.

![Dashboard](screenshots/dashboard.png)

### Parts — a live CAD gallery
A **static 3D model per part** (press-and-hold a card to spin it); **hover** any model to pop its **2D engineering drawing** near the cursor. **List / Grid** toggle; the list rows carry the same static 3D thumbnails. Shared designs are tagged with the **other projects** they're used in, and filtering by project surfaces a part under *every* program it belongs to.

### Part Detail
A **project switcher** in the breadcrumb — because a shared part runs an **independent DFM process per project**, switching project swaps the whole context: Part State, providers, issues, sign-offs, and approval (e.g. *Battery enclosure — lower* is `DFM Active` with two providers in **TM-4 Bike Program**, and a younger single-provider review in **Cargo eBike**). Within a project, a **provider switcher** flips between each DFM. Plus the Package **completeness gate**, the v2 **Part State** strip, **per-provider DFM reviews** (each at its own revision pointer), **Sign-offs** (Proposed → Aligned → Signed), and a **DFM Approval** gate. The Package panel has a **3D viewer** *and* a **2D toggle** — a generated engineering drawing (with the Chorus title-block stamp) that re-renders to the selected revision. Each revision row has its own live 3D mini.

![Part detail](screenshots/part-detail.png)

### Issue Inbox & Issue Detail — the atomic unit
The full DFM ledger with the **Type** axis and **derived state**, and a single issue with its lifecycle stepper, disposition thread, spec change, and validation action.

| Issue Inbox | Issue Detail |
|---|---|
| ![Issue inbox](screenshots/issue-inbox.png) | ![Issue detail](screenshots/issue-detail.png) |

### Revision Diff — 3D, side-by-side
**Rev A (baseline) vs Rev C (current)** in two synced 3D viewers. The current model is a **frosted-glass shell with the changes highlighted in solid color** — amber = modified, blue = added, red = removed — so only the deltas read. Drag either model, both rotate together; a **Ghost body** toggle fades the unchanged shell.

### External Reviewer Portal
A scoped, no-account **magic link** — **NDA gate**, **watermarked** downloads, a permissions matrix, link expiry, the reviewer's own revision track, and an audit log.

![Reviewer portal](screenshots/reviewer-portal.png)

### Workflow reference
The v2 object hierarchy, the derived issue state machine, the 11-step flow, and the **"six fixes"** — printed in-app.

![Workflow](screenshots/workflow.png)

---

## Tech

- **Static HTML / CSS / JS** — no build step, no framework, no backend.
- **Three.js** throughout: the Part-Detail CAD viewer (STEP/STL/GLB/OBJ, orbit + drag-drop), the parts gallery, the per-revision minis, and the 3D revision diff.
- **`cadgrid.js`** — a shared-renderer CAD gallery: **one WebGL context blitted to many 2D canvases**, so a grid of models scales past the browser's context limit. Supports static (render-once) and press-and-hold-to-spin cells.
- **`drawsheet.js`** — generates **engineering drawing sheets** (crop marks, ortho + isometric views, dimension fans, notes, and a **Chorus title-block stamp**) from a small part spec.
- **Pure CSS/SVG charts** — donut, bars, progress (no chart library).
- **`model.js`** — the canonical worked-example data model: a workspace **part library** + projects + **(part × project) memberships**, each membership carrying its own DFM process. Part-detail, parts-list, and project-detail render from it, which is what makes the shared-part / per-project-DFM behaviour consistent across screens.
- **`localStorage`** store (`store.js`) so created projects/parts/links persist as you navigate; **`cadstore.js`** (IndexedDB) hands off uploaded CAD to the viewer.
- Shared **`sidebar.js`** (nav + workspace switcher) and **`switcher.js`** (a dev-only screen jumper; append `#noswitch` to any URL to hide it).
- The sign-in / sign-up heroes are **Three.js line-globes** (`auth-logo.js`, `auth-globe-signup.js`); the sign-in globe re-permutes its lines on every refresh.
- Hosted on **GitHub Pages** at the apex domain `withchorus.ai`.

## Run locally

No dependencies — just serve the folder:

```bash
python3 -m http.server 4599
# open http://localhost:4599
```

## Project structure

```
overview.html ......... Dashboard — workspace-wide, cross-project DFM rollup
projects.html ......... Projects index
project-detail.html ... a Project → its parts
part-detail.html ...... Part hub (package gate, revisions+3D minis, 3D/2D CAD, DFMs, sign-offs, approval)
parts-list.html ....... Parts — live CAD gallery (static 3D + hover 2D drawing, list/grid)
issues-list.html ...... Issue Inbox (Type axis, derived state)
issue-detail.html ..... a DFM Issue + lifecycle           <- the atomic unit
revision-history.html . a part's revision timeline
revision-diff.html .... 3D side-by-side Rev <-> Rev diff (frosted "edit" highlights)
magic-link-view.html .. External Reviewer Portal (NDA gate, watermark, scoped link)
activity.html ......... Issue lifecycle feed
team.html | magic-links.html | settings.html | create-project.html
user-flow.html ........ Workflow tree + derived state machine + the six fixes
login.html | signup.html ... auth, with the line-globe heroes

model.js .............. canonical data model — part library + (part × project) DFM memberships
cadgrid.js ............ shared-renderer CAD gallery (one WebGL context → many canvases)
drawsheet.js .......... engineering 2D drawing-sheet generator (+ Chorus stamp)
cadstore.js ........... IndexedDB handoff for uploaded CAD
auth-logo.js / auth-globe-signup.js ... sign-in / sign-up line-globes
store.js | sidebar.js | switcher.js | flows.js | styles.css
vendor/three .......... bundled Three.js + addons    ·    models/ , assets/ ... sample CAD + textures
```

---

*Prototype — front-end only, seeded with a worked example (the **TM-4 Bike Program**, with **ALSO** as the brand and **Hsinchu Precision** + **Shenzhen Optics** reviewing in parallel).*
