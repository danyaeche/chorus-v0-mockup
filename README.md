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

### Full object hierarchy

The complete v0 object model — DFM-only, multi-provider. Everything above is the abbreviated view; this is the whole tree, every field and state. **Changes from the previous version are marked ◆.** Source: [`docs/chorus-v0-hierarchy.pdf`](docs/chorus-v0-hierarchy.pdf).

<details>
<summary><strong>Expand the full hierarchy</strong> (Project → Parts → Package · Revisions · DFMs · Issues · Sign-offs · Approval → Reviewers → State)</summary>

```text
Workspace / Organization
│
└── Project                              (TM-4 Bike Program · rolls up parts & DFMs across providers)
    │
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │   PROJECT METADATA
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │
    ├── Project Metadata
    │       ├── Name
    │       ├── Product
    │       ├── Brand Owner
    │       ├── Engineering Owner
    │       └── Status
    │
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │   PARTS
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │
    ├── Parts
    │   │
    │   └── Part                         (Battery enclosure — lower · Injection Mold)
    │       │
    │       │   ────────────────────────────────
    │       │   PART METADATA
    │       │   ────────────────────────────────
    │       │
    │       ├── Part Metadata
    │       │       ├── Part Number
    │       │       ├── Material
    │       │       ├── Process               (Injection Mold, CNC, Sheet Metal, etc.)
    │       │       ├── Owner
    │       │       ├── State                 (see Part State below)
    │       │       └── Current Released Revision        ◆ single source of truth pointer
    │       │
    │       │   ────────────────────────────────
    │       │   PACKAGE        ◆ completeness now ENFORCED
    │       │   ────────────────────────────────
    │       │
    │       ├── Package
    │       │       ├── Required Items        ◆ template driven by Process type
    │       │       │       │                   (injection-mold template mirrors DFM checklist §1)
    │       │       │       ├── 3D CAD (STEP)
    │       │       │       ├── 2D Drawing w/ GD&T callouts
    │       │       │       ├── Material Spec / Approved Shortlist
    │       │       │       ├── Cosmetic Surface Grades (Class A/B/C)
    │       │       │       ├── Volume Forecast + Initial Order Qty
    │       │       │       ├── Packaging & Labeling Requirements
    │       │       │       └── Regulatory Requirements (UL, FDA, RoHS, etc.)
    │       │       ├── Optional Items
    │       │       │       ├── Target Unit Cost / Should-Cost
    │       │       │       ├── Render / Screenshot
    │       │       │       └── Other Attachments
    │       │       └── Package State         ◆ Incomplete → Complete
    │       │                                   GATE: reviewers cannot be invited until Complete
    │       │
    │       │   ────────────────────────────────
    │       │   REVISIONS      (shared design record)
    │       │   ────────────────────────────────
    │       │
    │       ├── Revisions                  every provider reviews these
    │       │       ├── Rev A
    │       │       │       ├── Files
    │       │       │       ├── Uploaded By / Timestamp
    │       │       │       ├── Change Summary
    │       │       │       └── Issues Implemented       ◆ back-links to issues fixed in this rev
    │       │       ├── Rev B
    │       │       └── Rev N
    │       │
    │       │   ────────────────────────────────
    │       │   DFMs           ◆ one per provider · parallel · confidential to each
    │       │   ────────────────────────────────
    │       │
    │       ├── DFMs
    │       │   │
    │       │   └── DFM                   (Hsinchu Precision · CM · scoped magic link)
    │       │       │
    │       │       ├── DFM Metadata
    │       │       │       ├── Provider (→ External Reviewer)
    │       │       │       ├── Role          (CM, Supplier, Fabricator, Tooling)
    │       │       │       └── Confidentiality Boundary    ◆ providers never see each other's DFMs
    │       │       │
    │       │       ├── Current Revision Under Review       ◆ per-DFM pointer — Provider 1 can be
    │       │       │                                         on Rev B while Provider 2 is on Rev A
    │       │       │
    │       │       │   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
    │       │       │   ISSUES   ◀── the atomic unit of work
    │       │       │   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
    │       │       │
    │       │       ├── Issues
    │       │       │   │
    │       │       │   └── Issue         (#12 Insufficient draft for ejection)
    │       │       │       ├── Title / Description
    │       │       │       ├── Type      ◆ NEW axis — findings ≠ proposals
    │       │       │       │       ├── Show-stopper        (not moldable as designed)
    │       │       │       │       ├── Finding             (problem needing a design change)
    │       │       │       │       ├── Proposal            (parting line, gate location, shrink est.)
    │       │       │       │       └── Info                (no action required)
    │       │       │       ├── Category
    │       │       │       │       ├── Geometry / Tolerance / Material
    │       │       │       │       └── Tooling / Assembly / Process / Cost-Yield Risk
    │       │       │       ├── Severity              (Critical / High / Medium / Low)
    │       │       │       ├── Created On Revision / Created By
    │       │       │       ├── Recommendation        (provider's proposed fix)
    │       │       │       ├── Cost / Yield Impact   ◆ optional $ field — future quote hook
    │       │       │       ├── Brand Decision
    │       │       │       │       ├── Accepted / Rejected / Needs Clarification
    │       │       │       │       └── Rationale           ◆ REQUIRED on reject (checklist §3)
    │       │       │       ├── Implementation
    │       │       │       │       ├── Not Started / In Progress
    │       │       │       │       └── Implemented in Rev X     ◆ explicit rev link
    │       │       │       ├── Validation
    │       │       │       │       ├── Owner = reviewer who raised the issue   ◆ supplier re-confirms
    │       │       │       │       ├── Compares: created-on rev vs implemented-in rev
    │       │       │       │       └── Pending / Validated / Validation Failed (→ reopens)
    │       │       │       ├── Derived Issue State   ◆ Open → Dispositioned → Implemented
    │       │       │       │                            → Validated → Closed
    │       │       │       ├── Comments / Attachments
    │       │       │       └── Audit Trail
    │       │       │
    │       │       └── DFM State         ◆ Invited → In Review → Feedback Submitted
    │       │                               → Awaiting Validation → Complete
    │       │
    │       │   ────────────────────────────────
    │       │   ISSUE GROUPS   ◆ NEW · brand-side only · cross-DFM rollup
    │       │   ────────────────────────────────
    │       │
    │       ├── Issue Groups
    │       │   └── Group                 ("Wall thickness — boss area" · 3 providers flagged)
    │       │       ├── Linked Issues     (one per provider DFM)
    │       │       ├── Conflict Flag     ◆ providers gave contradictory recommendations
    │       │       ├── Unified Decision  ◆ disposition once → cascades to linked issues
    │       │       └── Confidentiality preserved: providers see only their own issue
    │       │
    │       │   ────────────────────────────────
    │       │   SIGN-OFFS      ◆ NEW · joint alignments are first-class, not issues
    │       │   ────────────────────────────────
    │       │
    │       ├── Sign-offs
    │       │   └── Sign-off              (Gate location · Brand + Hsinchu Precision)
    │       │       ├── Topic             (Parting Line / Gate Location / Material Lock /
    │       │       │                      Tooling Ownership / custom)
    │       │       ├── Parties           (brand owner + provider, both must confirm)
    │       │       ├── State             Proposed → Aligned → Signed
    │       │       ├── Record            (what was agreed, written rationale)
    │       │       └── Audit Trail
    │       │
    │       │   ────────────────────────────────
    │       │   DFM APPROVAL   ◆ NEW · the gate that matters (checklist §6 — cut steel)
    │       │   ────────────────────────────────
    │       │
    │       ├── DFM Approval
    │       │       ├── Entry Criteria        ALL open issues dispositioned + sign-offs signed
    │       │       ├── Approved By / Timestamp
    │       │       ├── Approved Revision     (frozen — the rev steel gets cut against)
    │       │       └── PO / Tooling Reference (optional external ref)
    │       │
    │       │   ────────────────────────────────
    │       │   PART STATE     ◆ ends at approval, not "complete"
    │       │   ────────────────────────────────
    │       │
    │       ├── Part State
    │       │       ├── Draft
    │       │       ├── Package Complete      ◆ new gate state
    │       │       ├── DFM Active
    │       │       ├── Awaiting Validation
    │       │       └── DFM Approved          ◆ replaces "DFM Complete" — cleared to cut steel
    │       │
    │       │   ────────────────────────────────
    │       │   ACTIVITY
    │       │   ────────────────────────────────
    │       │
    │       └── Activity
    │               ├── Revision Uploaded / Issue Created / Issue Updated
    │               ├── Decision Recorded / Validation Requested / Issue Closed
    │               ├── Sign-off Recorded     ◆
    │               └── DFM Approved          ◆
    │
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │   EXTERNAL REVIEWERS
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │
    ├── External Reviewers
    │       ├── Company
    │       ├── Role                          (CM, Supplier, Fabricator, Tooling, etc.)
    │       ├── NDA Status                    ◆ gate before any files are visible
    │       ├── Access Scope                  (which parts → which DFMs · nothing else)
    │       ├── Magic Link
    │       │       ├── Expiry / Revoke           ◆
    │       │       └── File Watermarking Policy  ◆ CAD/drawings stamped per recipient
    │       └── Reviewer Activity Log         ◆ who viewed/downloaded what, when
    │
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │   PROJECT ACTIVITY FEED
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │
    ├── Project Activity Feed
    │       ├── Reviewer Invited / Part Added / Revision Uploaded
    │       ├── Issue Opened / Decision Recorded / Validation Requested / Issue Closed
    │       ├── Sign-off Recorded             ◆
    │       └── DFM Approved                  ◆
    │
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │   PROJECT STATE
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │
    ├── Project State
    │       ├── Setup
    │       ├── DFM Active
    │       └── DFM Approved                  ◆
    │
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │   vNEXT HOOKS    ◆ out of scope, modeled as stubs
    │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │
    └── vNext Hooks
            ├── Tooling Quote                 (checklist §4 — attaches to DFM Approval)
            ├── Mold Flow / Simulation        (checklist §5 — attaches to Revision)
            └── T1 / FAI / PPAP               (checklist §7 — attaches to Approved Revision)
```

</details>

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

## Every page

The complete screen set, in user-flow order — rendered full-page at 1440×900. Files live in [`screenshots-export/`](screenshots-export/).

| | |
|---|---|
| **01 · Login**<br>![Login](screenshots-export/01-login.png) | **02 · Sign up**<br>![Sign up](screenshots-export/02-signup.png) |
| **03 · Dashboard**<br>![Dashboard](screenshots-export/03-dashboard.png) | **04 · Projects**<br>![Projects](screenshots-export/04-projects.png) |
| **05 · Project detail**<br>![Project detail](screenshots-export/05-project-detail.png) | **06 · Create project**<br>![Create project](screenshots-export/06-create-project.png) |
| **07 · Parts — CAD gallery**<br>![Parts](screenshots-export/07-part-list.png) | **08 · Part detail**<br>![Part detail](screenshots-export/08-part-detail.png) |
| **09 · Issue inbox**<br>![Issue inbox](screenshots-export/09-issue-list.png) | **10 · Issue detail**<br>![Issue detail](screenshots-export/10-issue-detail.png) |
| **11 · Revision history**<br>![Revision history](screenshots-export/11-revision-history.png) | **12 · Revision diff**<br>![Revision diff](screenshots-export/12-revision-diff.png) |
| **13 · Activity**<br>![Activity](screenshots-export/13-activity.png) | **14 · Team**<br>![Team](screenshots-export/14-team.png) |
| **15 · Manufacturer access**<br>![Manufacturer access](screenshots-export/15-manufacturer-access.png) | **16 · Reviewer portal**<br>![Reviewer portal](screenshots-export/16-supplier-portal.png) |
| **17 · Settings**<br>![Settings](screenshots-export/17-settings.png) | |

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
