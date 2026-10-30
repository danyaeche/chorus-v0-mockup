// Geometric diff between two tessellated revisions.
//
// A true b-rep diff — matching faces and features between two STEP models and
// reporting "the draft angle on face 12 went from 1° to 3°" — is a research
// problem, not a component. What a reviewer actually needs from the compare
// screen is narrower: *where do I look?* So this works on tessellated geometry
// and answers that question by voxel occupancy.
//
// Both models are rasterised into a shared grid. Voxels occupied in one revision
// and not the other are the changed set; those are clustered into contiguous
// regions, and each region is classified by what it contains:
//
//   only new material      → added      (blue,   in the mockup's legend)
//   only absent material   → removed    (red)
//   both, interleaved      → modified   (orange — material moved or reshaped)
//
// That last case is the important one. Moving a boss produces removal at the old
// location and addition at the new one — two separate regions. Resizing a boss
// produces both within the same region, which is what "modified" means here.

import type { TessellatedModel } from './meshCodec'

export type ChangeKind = 'added' | 'removed' | 'modified'

export interface DiffRegion {
  kind: ChangeKind
  /** World-space bounds: [minX, minY, minZ, maxX, maxY, maxZ]. */
  bbox: [number, number, number, number, number, number]
  /** Approximate volume of the change, in the model's units cubed. */
  volume: number
  addedVoxels: number
  removedVoxels: number
}

export interface GeometryDiff {
  regions: DiffRegion[]
  addedVolume: number
  removedVolume: number
  modifiedVolume: number
  voxelSize: number
  /** True when the grid hit its resolution ceiling — the diff is coarser than requested. */
  clamped: boolean
}

export interface DiffOptions {
  /** Target voxels along the longest axis. Higher = finer, quadratically slower. */
  resolution?: number
  /** Ignore regions smaller than this many voxels — suppresses tessellation noise. */
  minRegionVoxels?: number
  /** Fraction of a region that must be added *and* removed to read as "modified". */
  modifiedRatio?: number
}

const MAX_AXIS = 256

interface Grid {
  origin: [number, number, number]
  size: number
  nx: number
  ny: number
  nz: number
  clamped: boolean
}

function buildGrid(
  a: TessellatedModel,
  b: TessellatedModel,
  resolution: number,
): Grid {
  const min = [
    Math.min(a.bbox[0], b.bbox[0]),
    Math.min(a.bbox[1], b.bbox[1]),
    Math.min(a.bbox[2], b.bbox[2]),
  ]
  const max = [
    Math.max(a.bbox[3], b.bbox[3]),
    Math.max(a.bbox[4], b.bbox[4]),
    Math.max(a.bbox[5], b.bbox[5]),
  ]

  const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const longest = Math.max(extent[0], extent[1], extent[2]) || 1
  let size = longest / resolution

  // One voxel of padding on each side keeps surface triangles that sit exactly
  // on the bounding box from landing outside the grid.
  const pad = size
  const origin: [number, number, number] = [min[0] - pad, min[1] - pad, min[2] - pad]

  let nx = Math.ceil((extent[0] + pad * 2) / size) + 1
  let ny = Math.ceil((extent[1] + pad * 2) / size) + 1
  let nz = Math.ceil((extent[2] + pad * 2) / size) + 1

  let clamped = false
  const worst = Math.max(nx, ny, nz)
  if (worst > MAX_AXIS) {
    // Bound memory on very elongated or very large parts rather than trying to
    // allocate a grid that cannot fit.
    const scale = worst / MAX_AXIS
    size *= scale
    nx = Math.ceil((extent[0] + pad * 2) / size) + 1
    ny = Math.ceil((extent[1] + pad * 2) / size) + 1
    nz = Math.ceil((extent[2] + pad * 2) / size) + 1
    clamped = true
  }

  return { origin, size, nx, ny, nz, clamped }
}

function voxelize(model: TessellatedModel, grid: Grid): Uint8Array {
  const { origin, size, nx, ny, nz } = grid
  const occupancy = new Uint8Array(nx * ny * nz)

  const mark = (x: number, y: number, z: number) => {
    const ix = Math.floor((x - origin[0]) / size)
    const iy = Math.floor((y - origin[1]) / size)
    const iz = Math.floor((z - origin[2]) / size)
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return
    occupancy[ix + iy * nx + iz * nx * ny] = 1
  }

  for (const part of model.parts) {
    const pos = part.positions
    const idx = part.indices

    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3
      const b = idx[t + 1] * 3
      const c = idx[t + 2] * 3

      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
      const bx = pos[b], by = pos[b + 1], bz = pos[b + 2]
      const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2]

      mark(ax, ay, az)
      mark(bx, by, bz)
      mark(cx, cy, cz)

      // A triangle larger than a voxel would otherwise leave gaps between its
      // corners, so subdivide it barycentrically. With a well-tessellated model
      // most triangles are sub-voxel and this stays at one step.
      const e0 = Math.hypot(bx - ax, by - ay, bz - az)
      const e1 = Math.hypot(cx - bx, cy - by, cz - bz)
      const e2 = Math.hypot(ax - cx, ay - cy, az - cz)
      const longest = Math.max(e0, e1, e2)
      if (longest <= size) continue

      const steps = Math.min(Math.ceil(longest / (size * 0.5)), 12)
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps - i; j++) {
          const u = i / steps
          const v = j / steps
          const w = 1 - u - v
          mark(
            ax * w + bx * u + cx * v,
            ay * w + by * u + cy * v,
            az * w + bz * u + cz * v,
          )
        }
      }
    }
  }

  return occupancy
}

export function diffGeometry(
  from: TessellatedModel,
  to: TessellatedModel,
  options: DiffOptions = {},
): GeometryDiff {
  const resolution = options.resolution ?? 96
  const minRegionVoxels = options.minRegionVoxels ?? 3
  const modifiedRatio = options.modifiedRatio ?? 0.2

  const grid = buildGrid(from, to, resolution)
  const { nx, ny, nz, size, origin } = grid

  const fromVoxels = voxelize(from, grid)
  const toVoxels = voxelize(to, grid)

  // 0 = unchanged, 1 = added, 2 = removed.
  const changed = new Uint8Array(nx * ny * nz)
  for (let i = 0; i < changed.length; i++) {
    const f = fromVoxels[i]
    const t = toVoxels[i]
    if (f === t) continue
    changed[i] = t === 1 ? 1 : 2
  }

  const regions: DiffRegion[] = []
  const visited = new Uint8Array(nx * ny * nz)
  const voxelVolume = size * size * size
  const stack: number[] = []

  for (let seed = 0; seed < changed.length; seed++) {
    if (!changed[seed] || visited[seed]) continue

    // Flood fill with 26-connectivity so diagonally-touching change voxels read
    // as one region rather than a scatter of fragments.
    stack.length = 0
    stack.push(seed)
    visited[seed] = 1

    let added = 0
    let removed = 0
    let minIx = nx, minIy = ny, minIz = nz
    let maxIx = -1, maxIy = -1, maxIz = -1

    while (stack.length) {
      const index = stack.pop()!
      const iz = Math.floor(index / (nx * ny))
      const rem = index - iz * nx * ny
      const iy = Math.floor(rem / nx)
      const ix = rem - iy * nx

      if (changed[index] === 1) added++
      else removed++

      if (ix < minIx) minIx = ix
      if (iy < minIy) minIy = iy
      if (iz < minIz) minIz = iz
      if (ix > maxIx) maxIx = ix
      if (iy > maxIy) maxIy = iy
      if (iz > maxIz) maxIz = iz

      for (let dz = -1; dz <= 1; dz++) {
        const nz2 = iz + dz
        if (nz2 < 0 || nz2 >= nz) continue
        for (let dy = -1; dy <= 1; dy++) {
          const ny2 = iy + dy
          if (ny2 < 0 || ny2 >= ny) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx2 = ix + dx
            if (nx2 < 0 || nx2 >= nx) continue
            const neighbour = nx2 + ny2 * nx + nz2 * nx * ny
            if (!changed[neighbour] || visited[neighbour]) continue
            visited[neighbour] = 1
            stack.push(neighbour)
          }
        }
      }
    }

    const total = added + removed
    if (total < minRegionVoxels) continue

    const kind: ChangeKind =
      added / total >= modifiedRatio && removed / total >= modifiedRatio
        ? 'modified'
        : added >= removed
          ? 'added'
          : 'removed'

    regions.push({
      kind,
      bbox: [
        origin[0] + minIx * size,
        origin[1] + minIy * size,
        origin[2] + minIz * size,
        origin[0] + (maxIx + 1) * size,
        origin[1] + (maxIy + 1) * size,
        origin[2] + (maxIz + 1) * size,
      ],
      volume: total * voxelVolume,
      addedVoxels: added,
      removedVoxels: removed,
    })
  }

  // Biggest change first — that is the one a reviewer should look at.
  regions.sort((a, b) => b.volume - a.volume)

  let addedVolume = 0
  let removedVolume = 0
  let modifiedVolume = 0
  for (const region of regions) {
    if (region.kind === 'added') addedVolume += region.volume
    else if (region.kind === 'removed') removedVolume += region.volume
    else modifiedVolume += region.volume
  }

  return {
    regions,
    addedVolume,
    removedVolume,
    modifiedVolume,
    voxelSize: size,
    clamped: grid.clamped,
  }
}
