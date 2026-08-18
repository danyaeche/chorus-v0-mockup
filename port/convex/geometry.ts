// Convex functions for the geometry layer — lands as `graph.geometry.*`.
//
// STORAGE MODEL (confirmed from the shipped bundle, not assumed):
// files live in R2 and are addressed by an opaque `r2Key` string. Part versions
// already carry `fileRefs[].r2Key`, and the client resolves a URL through the
// existing `kernel.files.generateDownloadUrl({ r2Key }) -> { url }` action.
// These functions therefore only ever store and return r2Keys — they never call
// `ctx.storage`, and URL resolution stays with the helper that already owns it.
//
// ASSUMPTIONS still to confirm against the real repo:
//   - the part-version table is named `partVersions`
//   - `kernel.files.generateUploadUrl` returns something the client can PUT to
//     and yields an r2Key (its exact shape is not visible in the bundle)
//   - auth identity comes from `ctx.auth.getUserIdentity()` as elsewhere

import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'

async function requireIdentity(ctx: { auth: { getUserIdentity: () => Promise<unknown> } }) {
  const identity = (await ctx.auth.getUserIdentity()) as { subject: string } | null
  if (!identity) throw new Error('Not authenticated')
  return identity
}

/**
 * Register an existing part-version file as this revision's CAD.
 *
 * The normal path is not an upload: a STEP already sits in `version.fileRefs`,
 * and this marks which one is the geometry of record. Starts `pending`; the
 * client tessellates on first view and calls `recordTessellation`. A mesh upload
 * (STL/GLB) needs no OpenCascade pass and is recorded `ready` immediately.
 */
export const registerCad = mutation({
  args: {
    partVersionId: v.id('partVersions'),
    r2Key: v.string(),
    filename: v.string(),
    format: v.union(
      v.literal('step'),
      v.literal('iges'),
      v.literal('brep'),
      v.literal('mesh'),
    ),
    bytes: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    const existing = await geometryFor(ctx, args.partVersionId)

    // Pointing a revision at different CAD invalidates the derived mesh and
    // every cached diff that referenced it.
    if (existing) {
      if (existing.sourceR2Key === args.r2Key) return existing._id
      await invalidateDiffsFor(ctx, args.partVersionId)
      await ctx.db.delete(existing._id)
    }

    return await ctx.db.insert('partVersionGeometry', {
      partVersionId: args.partVersionId,
      sourceR2Key: args.r2Key,
      sourceFilename: args.filename,
      sourceFormat: args.format,
      sourceBytes: args.bytes,
      tessellationStatus: args.format === 'mesh' ? 'ready' : 'pending',
      uploadedBy: identity.subject,
      uploadedAt: Date.now(),
    })
  },
})

/**
 * Geometry for one revision. Returns r2Keys; the caller resolves them through
 * `kernel.files.generateDownloadUrl`. Prefer `meshR2Key` — falling back to
 * `sourceR2Key` means paying the ~7 MB OpenCascade download and a parse.
 */
export const getGeometry = query({
  args: { partVersionId: v.id('partVersions') },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await geometryFor(ctx, args.partVersionId)
  },
})

/** Geometry rows for several revisions at once — for the revision rail. */
export const getGeometryForVersions = query({
  args: { partVersionIds: v.array(v.id('partVersions')) },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const rows = await Promise.all(
      args.partVersionIds.map((partVersionId) => geometryFor(ctx, partVersionId)),
    )
    return rows.filter((row): row is NonNullable<typeof row> => row !== null)
  },
})

/** Record the derived mesh after a client-side tessellation pass. */
export const recordTessellation = mutation({
  args: {
    partVersionId: v.id('partVersions'),
    meshR2Key: v.string(),
    thumbnailR2Key: v.optional(v.string()),
    unit: v.string(),
    bbox: v.array(v.number()),
    triangleCount: v.number(),
    linearDeflection: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const geometry = await geometryFor(ctx, args.partVersionId)
    if (!geometry) throw new Error('No CAD registered on this revision')

    // Two clients can open the same revision at once and both tessellate. First
    // write wins; the loser's mesh is left for R2 lifecycle rules to reap.
    if (geometry.meshR2Key) return geometry._id

    await ctx.db.patch(geometry._id, {
      meshR2Key: args.meshR2Key,
      thumbnailR2Key: args.thumbnailR2Key ?? geometry.thumbnailR2Key,
      unit: args.unit,
      bbox: args.bbox,
      triangleCount: args.triangleCount,
      linearDeflection: args.linearDeflection,
      tessellationStatus: 'ready',
      tessellationError: undefined,
    })

    return geometry._id
  },
})

export const recordTessellationFailure = mutation({
  args: { partVersionId: v.id('partVersions'), error: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const geometry = await geometryFor(ctx, args.partVersionId)
    if (!geometry) return
    await ctx.db.patch(geometry._id, {
      tessellationStatus: 'failed',
      tessellationError: args.error.slice(0, 500),
    })
  },
})

/** Cached diff for a revision pair, or null when it must be computed. */
export const getCachedDiff = query({
  args: {
    fromVersionId: v.id('partVersions'),
    toVersionId: v.id('partVersions'),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const cached = await ctx.db
      .query('geometryDiffCache')
      .withIndex('by_pair', (q) =>
        q.eq('fromVersionId', args.fromVersionId).eq('toVersionId', args.toVersionId),
      )
      .unique()

    if (!cached) return null

    // Only valid while both meshes it was computed from are still current —
    // re-registering CAD on either side makes it a lie.
    const [from, to] = await Promise.all([
      geometryFor(ctx, args.fromVersionId),
      geometryFor(ctx, args.toVersionId),
    ])

    if (
      from?.meshR2Key !== cached.fromMeshR2Key ||
      to?.meshR2Key !== cached.toMeshR2Key
    ) {
      return null
    }

    return cached
  },
})

export const recordDiff = mutation({
  args: {
    fromVersionId: v.id('partVersions'),
    toVersionId: v.id('partVersions'),
    regions: v.array(
      v.object({
        kind: v.union(v.literal('added'), v.literal('modified'), v.literal('removed')),
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
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const [from, to] = await Promise.all([
      geometryFor(ctx, args.fromVersionId),
      geometryFor(ctx, args.toVersionId),
    ])

    if (!from?.meshR2Key || !to?.meshR2Key) {
      throw new Error('Both revisions must be tessellated before a diff can be cached')
    }

    const existing = await ctx.db
      .query('geometryDiffCache')
      .withIndex('by_pair', (q) =>
        q.eq('fromVersionId', args.fromVersionId).eq('toVersionId', args.toVersionId),
      )
      .unique()

    const row = {
      ...args,
      fromMeshR2Key: from.meshR2Key,
      toMeshR2Key: to.meshR2Key,
      computedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, row)
      return existing._id
    }
    return await ctx.db.insert('geometryDiffCache', row)
  },
})

/* ---- helpers ---- */

type Ctx = Parameters<Parameters<typeof query>[0]['handler']>[0]

async function geometryFor(ctx: Ctx, partVersionId: Id<'partVersions'>) {
  return await ctx.db
    .query('partVersionGeometry')
    .withIndex('by_partVersion', (q) => q.eq('partVersionId', partVersionId))
    .unique()
}

async function invalidateDiffsFor(
  ctx: { db: { query: Ctx['db']['query']; delete: (id: Id<'geometryDiffCache'>) => Promise<void> } },
  partVersionId: Id<'partVersions'>,
) {
  // A revision appears on both sides of different pairs, so both directions
  // have to be swept.
  const asFrom = await ctx.db
    .query('geometryDiffCache')
    .withIndex('by_from', (q) => q.eq('fromVersionId', partVersionId))
    .collect()

  const all = await ctx.db.query('geometryDiffCache').collect()
  const asTo = all.filter((row) => row.toVersionId === partVersionId)

  for (const row of [...asFrom, ...asTo]) {
    await ctx.db.delete(row._id)
  }
}
