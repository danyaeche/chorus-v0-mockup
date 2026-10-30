// Additive schema for the geometry layer.
//
// Merge these table definitions into your existing `defineSchema({...})`. Nothing
// here modifies an existing table — the geometry hangs off `partVersions` by id,
// so the parts/BOM/findings model is untouched.
//
// ASSUMPTION: the part-version table is named `partVersions`. If it is named
// something else, change the `v.id(...)` targets below and nothing else.

import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const tessellationStatus = v.union(
  v.literal('pending'),   // source CAD uploaded, not yet tessellated
  v.literal('ready'),     // derived mesh available in meshStorageId
  v.literal('failed'),    // OpenCascade could not read it — see tessellationError
)

export const changeKind = v.union(
  v.literal('added'),
  v.literal('modified'),
  v.literal('removed'),
)

export const geometryTables = {
  /**
   * The CAD attached to one part revision.
   *
   * Source file and derived render mesh are deliberately separate columns. The
   * source (STEP) is authoritative and is what gets shared with a provider; the
   * mesh is a disposable cache that exists only so the viewer does not have to
   * run OpenCascade on every page view. Re-tessellating at a different deflection
   * replaces the mesh and leaves the source untouched.
   */
  partVersionGeometry: defineTable({
    partVersionId: v.id('partVersions'),

    // Files live in R2, keyed by `r2Key` — NOT Convex `_storage`. Confirmed from
    // the shipped bundle: `kernel.files.generateDownloadUrl({ r2Key })` returns
    // `{ url }`, and part versions already carry `fileRefs[].r2Key`. The source
    // CAD here is normally an existing fileRef on the version, not a new upload.
    sourceR2Key: v.string(),
    sourceFilename: v.string(),
    sourceFormat: v.union(
      v.literal('step'),
      v.literal('iges'),
      v.literal('brep'),
      v.literal('mesh'), // already-tessellated upload (STL/GLB) — no OCCT needed
    ),
    sourceBytes: v.number(),

    meshR2Key: v.optional(v.string()),
    thumbnailR2Key: v.optional(v.string()),

    /** Linear unit the mesh coordinates are in. */
    unit: v.optional(v.string()),
    /** [minX, minY, minZ, maxX, maxY, maxZ] in `unit`. */
    bbox: v.optional(v.array(v.number())),
    triangleCount: v.optional(v.number()),
    /** Deflection the mesh was tessellated at, so a finer pass can be detected. */
    linearDeflection: v.optional(v.number()),

    tessellationStatus,
    tessellationError: v.optional(v.string()),

    uploadedBy: v.string(),
    uploadedAt: v.number(),
  })
    .index('by_partVersion', ['partVersionId'])
    .index('by_status', ['tessellationStatus']),

  /**
   * Cached geometric diff for an ordered revision pair.
   *
   * Diffing is O(triangles) and a reviewer opens the same compare repeatedly, so
   * the first computation is persisted and every later view is a lookup. Keyed
   * on the ordered pair — from→to is not the same diff as to→from.
   */
  geometryDiffCache: defineTable({
    fromVersionId: v.id('partVersions'),
    toVersionId: v.id('partVersions'),

    regions: v.array(
      v.object({
        kind: changeKind,
        bbox: v.array(v.number()),
        volume: v.number(),
        addedVoxels: v.number(),
        removedVoxels: v.number(),
      }),
    ),

    addedVolume: v.number(),
    removedVolume: v.number(),
    modifiedVolume: v.number(),
    voxelSize: v.number(),
    clamped: v.boolean(),

    /** Invalidation key — if either mesh is replaced, the cache row is stale. */
    fromMeshR2Key: v.string(),
    toMeshR2Key: v.string(),

    computedAt: v.number(),
  })
    .index('by_pair', ['fromVersionId', 'toVersionId'])
    .index('by_from', ['fromVersionId']),
}

/*
Merge like this:

  import { defineSchema } from 'convex/server'
  import { geometryTables } from './schema.additions'

  export default defineSchema({
    ...existingTables,
    ...geometryTables,
  })
*/
