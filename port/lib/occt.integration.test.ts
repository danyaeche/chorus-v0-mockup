// End-to-end test against real STEP files, including CAx-IF interoperability
// fixtures. This is the test that proves the pipeline works on actual CAD
// rather than on synthetic boxes:
//
//   STEP bytes → OpenCascade → TessellatedModel → encode → decode → diff
//
// Runs OpenCascade under Node (same WASM the browser worker loads):
//
//   npx tsx port/lib/occt.integration.test.ts <path-to-occt-import-js/test/testfiles>

import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { occtResultToModel } from './occtResult'
import { encodeModel, decodeModel, type TessellatedModel } from './meshCodec'
import { diffGeometry } from './geometryDiff'

const require = createRequire(import.meta.url)

const FIXTURES =
  process.argv[2] ?? join(process.cwd(), 'node_modules/occt-import-js/test/testfiles')

if (!existsSync(FIXTURES)) {
  console.error(`No STEP fixtures at ${FIXTURES}`)
  console.error('Pass the path to occt-import-js/test/testfiles as an argument.')
  process.exit(2)
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

/** Translate a model — stands in for a revision that moved a feature. */
function translated(model: TessellatedModel, dx: number, dy: number, dz: number): TessellatedModel {
  const parts = model.parts.map((part) => {
    const positions = new Float32Array(part.positions)
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += dx
      positions[i + 1] += dy
      positions[i + 2] += dz
    }
    return { ...part, positions }
  })
  return {
    ...model,
    parts,
    bbox: [
      model.bbox[0] + dx, model.bbox[1] + dy, model.bbox[2] + dz,
      model.bbox[3] + dx, model.bbox[4] + dy, model.bbox[5] + dz,
    ],
  }
}

/** Drop the last solid — stands in for a revision that deleted a feature. */
function withoutLastPart(model: TessellatedModel): TessellatedModel {
  return { ...model, parts: model.parts.slice(0, -1) }
}

const main = async () => {
  const occtimportjs = require('occt-import-js')
  const occt = await occtimportjs()

  const read = (relative: string, deflection = 0.001): TessellatedModel => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, relative)))
    const result = occt.ReadStepFile(bytes, {
      linearUnit: 'millimeter',
      linearDeflectionType: 'bounding_box_ratio',
      linearDeflection: deflection,
      angularDeflection: 0.5,
    })
    assert.ok(result.success, `OpenCascade failed to read ${relative}`)
    return occtResultToModel(result, 'millimeter')
  }

  console.log('\nSTEP → tessellation')

  const cube = read('simple-basic-cube/cube.stp')
  const rounded = read('rounded-cube/rounded-cube.step')
  const assembly = read('cax-if/as1-tu-203.stp')

  test('reads a basic STEP cube', () => {
    assert.ok(cube.parts.length > 0, 'no meshes returned')
    assert.ok(cube.triangleCount >= 12, `only ${cube.triangleCount} triangles`)
    const [minX, , , maxX] = cube.bbox
    assert.ok(maxX > minX, 'degenerate bounding box')
    assert.ok(Number.isFinite(minX) && Number.isFinite(maxX), 'non-finite bounds')
  })

  test('reads a STEP with curved faces', () => {
    assert.ok(rounded.triangleCount > cube.triangleCount, 'rounding should add triangles')
  })

  test('reads a CAx-IF AP203 assembly with multiple solids', () => {
    assert.ok(assembly.parts.length > 1, `expected several solids, got ${assembly.parts.length}`)
    assert.ok(assembly.triangleCount > 100)
  })

  test('carries b-rep face ranges through', () => {
    const withFaces = cube.parts.filter((part) => part.faces.length > 0)
    assert.ok(withFaces.length > 0, 'no b-rep face ranges survived')
    for (const part of withFaces) {
      for (const face of part.faces) {
        assert.ok(face.last >= face.first, 'inverted face range')
        assert.ok(face.last < part.indices.length / 3, 'face range past the end of the mesh')
      }
    }
  })

  test('index buffer stays inside the vertex buffer', () => {
    for (const model of [cube, rounded, assembly]) {
      for (const part of model.parts) {
        const vertices = part.positions.length / 3
        for (let i = 0; i < part.indices.length; i++) {
          assert.ok(part.indices[i] < vertices, 'index out of range')
        }
      }
    }
  })

  test('deflection controls mesh density', () => {
    const coarse = read('rounded-cube/rounded-cube.step', 0.05)
    const fine = read('rounded-cube/rounded-cube.step', 0.0005)
    assert.ok(
      fine.triangleCount > coarse.triangleCount,
      `fine=${fine.triangleCount} coarse=${coarse.triangleCount}`,
    )
  })

  console.log('\nreal CAD → codec')

  test('round-trips a real tessellated STEP', () => {
    const decoded = decodeModel(encodeModel(assembly))
    assert.equal(decoded.parts.length, assembly.parts.length)
    assert.equal(decoded.triangleCount, assembly.triangleCount)
    assert.deepEqual(Array.from(decoded.bbox), Array.from(assembly.bbox))
    for (let i = 0; i < assembly.parts.length; i++) {
      assert.deepEqual(
        Array.from(decoded.parts[i].positions),
        Array.from(assembly.parts[i].positions),
      )
      assert.deepEqual(
        Array.from(decoded.parts[i].indices),
        Array.from(assembly.parts[i].indices),
      )
      assert.deepEqual(decoded.parts[i].faces, assembly.parts[i].faces)
    }
  })

  test('the cached blob is a usable size next to the source', () => {
    // Note the mesh is typically *larger* than the STEP — tessellation expands
    // analytic surfaces into triangles. The cache exists to save CPU and the
    // ~7 MB WASM download, not bytes. This guards against a pathological blow-up
    // that would make the fast path slower than re-parsing.
    const encoded = encodeModel(assembly)
    const source = readFileSync(join(FIXTURES, 'cax-if/as1-tu-203.stp')).byteLength
    console.log(
      `      STEP ${(source / 1024).toFixed(0)} KB → mesh ${(encoded.byteLength / 1024).toFixed(0)} KB ` +
        `(${assembly.triangleCount} triangles)`,
    )
    assert.ok(encoded.byteLength > 0)
    assert.ok(
      encoded.byteLength < source * 20,
      `mesh blew up to ${(encoded.byteLength / source).toFixed(1)}× the source`,
    )
  })

  console.log('\nreal CAD → diff')

  test('a real model against itself has no changes', () => {
    const diff = diffGeometry(assembly, assembly)
    assert.equal(diff.regions.length, 0, `expected no regions, got ${diff.regions.length}`)
  })

  test('deleting a solid from a real assembly reads as removed', () => {
    const diff = diffGeometry(assembly, withoutLastPart(assembly))
    assert.ok(diff.regions.length > 0, 'no change detected')
    assert.ok(diff.removedVolume > 0, 'nothing reported as removed')
    assert.equal(diff.addedVolume, 0, 'nothing was added')
  })

  test('adding a solid to a real assembly reads as added', () => {
    const diff = diffGeometry(withoutLastPart(assembly), assembly)
    assert.ok(diff.regions.length > 0)
    assert.ok(diff.addedVolume > 0)
    assert.equal(diff.removedVolume, 0)
  })

  test('a moved real part is reported at both locations', () => {
    const size = Math.max(
      assembly.bbox[3] - assembly.bbox[0],
      assembly.bbox[4] - assembly.bbox[1],
      assembly.bbox[5] - assembly.bbox[2],
    )
    const diff = diffGeometry(assembly, translated(assembly, size * 0.3, 0, 0))
    const kinds = new Set(diff.regions.map((region) => region.kind))
    assert.ok(diff.regions.length > 0, 'a shifted model should differ')
    assert.ok(
      kinds.has('added') || kinds.has('modified'),
      'expected new material where the part moved to',
    )
  })

  test('a sub-voxel nudge stays below the noise floor', () => {
    const diff = diffGeometry(cube, translated(cube, 1e-6, 0, 0))
    assert.equal(diff.regions.length, 0, 'a 1-nanometre shift should not register')
  })

  test('diffing two genuinely different parts terminates and classifies', () => {
    const diff = diffGeometry(cube, rounded)
    assert.ok(Number.isFinite(diff.addedVolume))
    assert.ok(Number.isFinite(diff.removedVolume))
    for (const region of diff.regions) {
      assert.ok(['added', 'removed', 'modified'].includes(region.kind))
      assert.ok(region.volume > 0)
      assert.equal(region.bbox.length, 6)
      assert.ok(region.bbox.every(Number.isFinite), 'non-finite region bounds')
    }
  })

  console.log(`\n${passed} passed\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
