// Convex functions for the geometry layer — lands as `graph.geometry.*`.
//
// ASSUMPTIONS (see port/README.md): the part-version table is `partVersions`;
// auth identity comes from `ctx.auth.getUserIdentity()` as it does elsewhere in
// this app via Clerk. Swap in your own auth helper where marked.

import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'

async function requireIdentity(ctx: { auth: { getUserIdentity: () => Promise<unknown> } }) {
  const identity = (await ctx.auth.getUserIdentity()) as { subject: string } | null
  if (!identity) throw new Error('Not authenticated')
  return identity
}

/** Upload URL for the raw CAD file. Mirrors `kernel.files.generateUploadUrl`. */
export const generateCadUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Attach a CAD file to a part revision.
 *
 * The row starts `pending` — the client tessellates on first view and calls
 * `recordTessellation`. A mesh upload (STL/GLB) needs no OpenCascade pass, so it
 * is recorded `ready` immediately.
 */
export const attachCad = mutation({
  args: {
    partVersionId: v.id('partVersions'),
    storageId: v.id('_storage'),
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

    const existing = await ctx.db
      .query('partVersionGeometry')
      .withIndex('by_partVersion', (q) => q.eq('partVersionId', args.partVersionId))
      .unique()

    // Replacing the CAD on a revision invalidates the derived mesh and every
    // diff that referenced it. Drop the blobs rather than orphaning them.
    if (existing) {
      if (existing.meshStorageId) await ctx.storage.delete(existing.meshStorageId)
      if (existing.sourceStorageId !== args.storageId) {
        await ctx.storage.delete(existing.sourceStorageId)
      }
      await invalidateDiffsFor(ctx, args.partVersionId)
      await ctx.db.delete(existing._id)
    }

    return await ctx.db.insert('partVersionGeometry', {
      partVersionId: args.partVersionId,
      sourceStorageId: args.storageId,
      sourceFilename: args.filename,
      sourceFormat: args.format,
      sourceBytes: args.bytes,
      tessellationStatus: args.format === 'mesh' ? 'ready' : 'pending',
      uploadedBy: identity.subject,
      uploadedAt: Date.now(),
    })
  },
})

/** Geometry for one revision, with signed URLs for whichever blobs exist. */
export const getGeometry = query({
  args: { partVersionId: v.id('partVersions') },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const geometry = await ctx.db
      .query('partVersionGeometry')
      .withIndex('by_partVersion', (q) => q.eq('partVersionId', args.partVersionId))
      .unique()

    if (!geometry) return null

    return {
      ...geometry,
      // The client prefers meshUrl and only falls back to sourceUrl (and the
      // 7 MB OpenCascade payload) when the mesh has not been built yet.
      meshUrl: geometry.meshStorageId
        ? await ctx.storage.getUrl(geometry.meshStorageId)
        : null,
      sourceUrl: await ctx.storage.getUrl(geometry.sourceStorageId),
      thumbnailUrl: geometry.thumbnailStorageId
        ? await ctx.storage.getUrl(geometry.thumbnailStorageId)
        : null,
    }
  },
})

/** Record the derived mesh after a client-side tessellation pass. */
export const recordTessellation = mutation({
  args: {
    partVersionId: v.id('partVersions'),
    meshStorageId: v.id('_storage'),
    thumbnailStorageId: v.optional(v.id('_storage')),
    unit: v.string(),
    bbox: v.array(v.number()),
    triangleCount: v.number(),
    linearDeflection: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const geometry = await ctx.db
      .query('partVersionGeometry')
      .withIndex('by_partVersion', (q) => q.eq('partVersionId', args.partVersionId))
      .unique()

    if (!geometry) throw new Error('No CAD attached to this revision')

    // Two clients can open the same revision at once and both tessellate. The
    // first write wins; the loser's blob is deleted so it does not leak.
    if (geometry.meshStorageId) {
      await ctx.storage.delete(args.meshStorageId)
      if (args.thumbnailStorageId) await ctx.storage.delete(args.thumbnailStorageId)
      return geometry._id
    }

    await ctx.db.patch(geometry._id, {
      meshStorageId: args.meshStorageId,
      thumbnailStorageId: args.thumbnailStorageId ?? geometry.thumbnailStorageId,
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
  args: {
    partVersionId: v.id('partVersions'),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const geometry = await ctx.db
      .query('partVersionGeometry')
      .withIndex('by_partVersion', (q) => q.eq('partVersionId', args.partVersionId))
      .unique()
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

    // A cache row is only valid while both meshes it was computed from are still
    // the current ones — re-uploading CAD on either side makes it a lie.
    const [from, to] = await Promise.all([
      geometryFor(ctx, args.fromVersionId),
      geometryFor(ctx, args.toVersionId),
    ])

    if (
      from?.meshStorageId !== cached.fromMeshStorageId ||
      to?.meshStorageId !== cached.toMeshStorageId
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

    if (!from?.meshStorageId || !to?.meshStorageId) {
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
      fromMeshStorageId: from.meshStorageId,
      toMeshStorageId: to.meshStorageId,
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
  // A revision appears on both sides of different pairs, so both directions have
  // to be swept.
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
