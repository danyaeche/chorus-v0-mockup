// Converts an OpenCascade import result into our tessellated model.
//
// Split out of the worker so it can be exercised against real STEP files in
// Node (see occt.integration.test.ts) without spinning up a browser worker.

import type { OcctResult } from 'occt-import-js'
import type { MeshFace, MeshPart, TessellatedModel } from './meshCodec'

export function occtResultToModel(result: OcctResult, unit: string): TessellatedModel {
  const parts: MeshPart[] = []
  let triangleCount = 0

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (const mesh of result.meshes) {
    const positions = new Float32Array(mesh.attributes.position.array)
    const normals = mesh.attributes.normal
      ? new Float32Array(mesh.attributes.normal.array)
      : null
    const indices = new Uint32Array(mesh.index.array)

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const y = positions[i + 1]
      const z = positions[i + 2]
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (z > maxZ) maxZ = z
    }

    const faces: MeshFace[] = (mesh.brep_faces ?? []).map((face) => ({
      first: face.first,
      last: face.last,
      color: face.color,
    }))

    triangleCount += indices.length / 3
    parts.push({
      name: mesh.name || 'solid',
      color: mesh.color ?? null,
      positions,
      normals,
      indices,
      faces,
    })
  }

  if (!parts.length) {
    // An empty result still needs a coherent bbox — an infinite one would
    // propagate NaN into every camera-framing calculation downstream.
    minX = minY = minZ = maxX = maxY = maxZ = 0
  }

  return {
    parts,
    unit,
    triangleCount,
    bbox: [minX, minY, minZ, maxX, maxY, maxZ],
  }
}
