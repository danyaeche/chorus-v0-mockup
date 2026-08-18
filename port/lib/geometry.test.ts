// Tests for the two pieces of real algorithm in this port: the mesh container
// format and the geometric diff. Both are dependency-free, so they run under
// plain `tsx` with no bundler or DOM.
//
//   npx tsx port/lib/geometry.test.ts

import assert from 'node:assert/strict'
import { encodeModel, decodeModel, type MeshPart, type TessellatedModel } from './meshCodec'
import { diffGeometry } from './geometryDiff'

/* ---- helpers ---- */

/** Triangulated axis-aligned box surface. */
function boxPart(
  name: string,
  [x0, y0, z0]: [number, number, number],
  [x1, y1, z1]: [number, number, number],
): MeshPart {
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ]
  const quads = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
    [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7],
  ]

  const positions: number[] = []
  const indices: number[] = []
  for (const quad of quads) {
    const base = positions.length / 3
    for (const corner of quad) positions.push(...corners[corner])
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  return {
    name,
    color: null,
    positions: new Float32Array(positions),
    normals: null,
    indices: new Uint32Array(indices),
    faces: [{ first: 0, last: indices.length / 3 - 1, color: null }],
  }
}

function model(parts: MeshPart[]): TessellatedModel {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  let triangleCount = 0

  for (const part of parts) {
    triangleCount += part.indices.length / 3
    for (let i = 0; i < part.positions.length; i += 3) {
      minX = Math.min(minX, part.positions[i])
      minY = Math.min(minY, part.positions[i + 1])
      minZ = Math.min(minZ, part.positions[i + 2])
      maxX = Math.max(maxX, part.positions[i])
      maxY = Math.max(maxY, part.positions[i + 1])
      maxZ = Math.max(maxZ, part.positions[i + 2])
    }
  }

  return { parts, unit: 'millimeter', triangleCount, bbox: [minX, minY, minZ, maxX, maxY, maxZ] }
}

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (error) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${(error as Error).message}`)
    process.exitCode = 1
  }
}

/* ---- fixtures ---- */

const PLATE: [[number, number, number], [number, number, number]] = [[0, 0, 0], [100, 60, 10]]
const BOSS: [[number, number, number], [number, number, number]] = [[40, 20, 10], [60, 40, 25]]
const RIB: [[number, number, number], [number, number, number]] = [[10, 5, 10], [16, 55, 18]]

const plate = model([boxPart('plate', ...PLATE)])
const plateWithBoss = model([boxPart('plate', ...PLATE), boxPart('boss', ...BOSS)])
const plateWithRib = model([boxPart('plate', ...PLATE), boxPart('rib', ...RIB)])
const tallerBoss = model([
  boxPart('plate', ...PLATE),
  boxPart('boss', [40, 20, 10], [60, 40, 40]),
])

/* ---- mesh codec ---- */

console.log('\nmeshCodec')

test('round-trips a single-part model', () => {
  const decoded = decodeModel(encodeModel(plate))
  assert.equal(decoded.parts.length, 1)
  assert.equal(decoded.unit, 'millimeter')
  assert.equal(decoded.triangleCount, plate.triangleCount)
  assert.deepEqual(Array.from(decoded.bbox), Array.from(plate.bbox))
  assert.deepEqual(
    Array.from(decoded.parts[0].positions),
    Array.from(plate.parts[0].positions),
  )
  assert.deepEqual(
    Array.from(decoded.parts[0].indices),
    Array.from(plate.parts[0].indices),
  )
})

test('round-trips a multi-part model with odd-length names', () => {
  const decoded = decodeModel(encodeModel(plateWithBoss))
  assert.equal(decoded.parts.length, 2)
  assert.deepEqual(decoded.parts.map((p) => p.name), ['plate', 'boss'])
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(
      Array.from(decoded.parts[i].positions),
      Array.from(plateWithBoss.parts[i].positions),
    )
  }
})

test('preserves b-rep face ranges', () => {
  const decoded = decodeModel(encodeModel(plateWithBoss))
  assert.deepEqual(decoded.parts[0].faces, plateWithBoss.parts[0].faces)
})

test('round-trips normals when present', () => {
  const withNormals = model([
    { ...boxPart('plate', ...PLATE), normals: new Float32Array(24 * 3).fill(0.5) },
  ])
  const decoded = decodeModel(encodeModel(withNormals))
  assert.ok(decoded.parts[0].normals)
  assert.equal(decoded.parts[0].normals!.length, 72)
  assert.equal(decoded.parts[0].normals![0], 0.5)
})

test('rejects a blob that is not a mesh', () => {
  assert.throws(() => decodeModel(new TextEncoder().encode('not a mesh at all').buffer as ArrayBuffer))
})

/* ---- geometry diff ---- */

console.log('\ngeometryDiff')

test('identical revisions produce no regions', () => {
  const diff = diffGeometry(plate, plate)
  assert.equal(diff.regions.length, 0)
  assert.equal(diff.addedVolume, 0)
  assert.equal(diff.removedVolume, 0)
})

test('a new boss reads as added', () => {
  const diff = diffGeometry(plate, plateWithBoss)
  assert.ok(diff.regions.length > 0, 'expected at least one region')
  assert.equal(diff.regions[0].kind, 'added')
  assert.ok(diff.addedVolume > 0)
  assert.equal(diff.removedVolume, 0)
})

test('a deleted boss reads as removed', () => {
  const diff = diffGeometry(plateWithBoss, plate)
  assert.ok(diff.regions.length > 0)
  assert.equal(diff.regions[0].kind, 'removed')
  assert.ok(diff.removedVolume > 0)
  assert.equal(diff.addedVolume, 0)
})

test('the diff is directional', () => {
  const forward = diffGeometry(plate, plateWithBoss)
  const backward = diffGeometry(plateWithBoss, plate)
  assert.equal(forward.regions[0].kind, 'added')
  assert.equal(backward.regions[0].kind, 'removed')
})

test('a region is located where the change is', () => {
  const diff = diffGeometry(plate, plateWithBoss)
  const [minX, minY, minZ, maxX, maxY, maxZ] = diff.regions[0].bbox
  // The boss occupies x 40-60, y 20-40, z 10-25. Allow a voxel of slack.
  const slack = diff.voxelSize * 2
  assert.ok(minX >= 40 - slack && maxX <= 60 + slack, `x out of range: ${minX}–${maxX}`)
  assert.ok(minY >= 20 - slack && maxY <= 40 + slack, `y out of range: ${minY}–${maxY}`)
  assert.ok(maxZ <= 25 + slack, `z too high: ${maxZ}`)
  assert.ok(minZ >= 10 - slack, `z too low: ${minZ}`)
})

test('resizing a feature in place reads as modified', () => {
  // The boss grows from 15 mm tall to 30 mm: its old top face disappears and a
  // new taller wall appears, interleaved in one contiguous region.
  const diff = diffGeometry(plateWithBoss, tallerBoss)
  const kinds = new Set(diff.regions.map((region) => region.kind))
  assert.ok(
    kinds.has('modified'),
    `expected a modified region, got: ${[...kinds].join(', ') || 'none'}`,
  )
})

test('two separate changes produce two regions', () => {
  const diff = diffGeometry(plate, model([
    boxPart('plate', ...PLATE),
    boxPart('boss', ...BOSS),
    boxPart('rib', ...RIB),
  ]))
  assert.ok(diff.regions.length >= 2, `expected 2+ regions, got ${diff.regions.length}`)
  assert.ok(diff.regions.every((region) => region.kind === 'added'))
})

test('regions are sorted largest first', () => {
  const diff = diffGeometry(plate, model([
    boxPart('plate', ...PLATE),
    boxPart('boss', ...BOSS),
    boxPart('rib', ...RIB),
  ]))
  for (let i = 1; i < diff.regions.length; i++) {
    assert.ok(
      diff.regions[i - 1].volume >= diff.regions[i].volume,
      'regions out of order',
    )
  }
})

test('a moved feature yields separate added and removed regions', () => {
  const moved = model([
    boxPart('plate', ...PLATE),
    boxPart('boss', [10, 20, 10], [30, 40, 25]),
  ])
  const diff = diffGeometry(plateWithBoss, moved)
  const kinds = diff.regions.map((region) => region.kind)
  assert.ok(kinds.includes('added'), 'expected an added region at the new location')
  assert.ok(kinds.includes('removed'), 'expected a removed region at the old location')
})

test('noise below the floor is discarded', () => {
  const coarse = diffGeometry(plate, plateWithRib, { minRegionVoxels: 1_000_000 })
  assert.equal(coarse.regions.length, 0)
})

test('resolution affects voxel size but not the verdict', () => {
  const coarse = diffGeometry(plate, plateWithBoss, { resolution: 32 })
  const fine = diffGeometry(plate, plateWithBoss, { resolution: 128 })
  assert.ok(coarse.voxelSize > fine.voxelSize)
  assert.equal(coarse.regions[0].kind, 'added')
  assert.equal(fine.regions[0].kind, 'added')
})

test('an empty model against a real one is all removed', () => {
  const empty: TessellatedModel = {
    parts: [], unit: 'millimeter', triangleCount: 0, bbox: [0, 0, 0, 0, 0, 0],
  }
  const diff = diffGeometry(plate, empty)
  assert.ok(diff.regions.length > 0)
  assert.ok(diff.regions.every((region) => region.kind === 'removed'))
})

console.log(`\n${passed} passed\n`)
