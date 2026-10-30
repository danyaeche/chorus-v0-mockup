// Binary container for a tessellated model.
//
// Tessellating a STEP file is expensive enough that we only ever want to do it
// once per revision (see port/README.md). This is the format the derived mesh is
// cached in — a glTF-style JSON header describing byte ranges, followed by the
// raw typed-array payload, so decoding is a few `subarray` calls rather than a
// parse.

export interface MeshFace {
  /** First triangle index of the source b-rep face. */
  first: number
  /** Last triangle index of the source b-rep face. */
  last: number
  color: [number, number, number] | null
}

export interface MeshPart {
  name: string
  color: [number, number, number] | null
  positions: Float32Array
  normals: Float32Array | null
  indices: Uint32Array
  /** Ranges back to the source b-rep faces — kept so a diff can report
   *  "which face changed" rather than only "which triangles changed". */
  faces: MeshFace[]
}

export interface TessellatedModel {
  parts: MeshPart[]
  /** Units the positions are expressed in. */
  unit: string
  triangleCount: number
  /** [minX, minY, minZ, maxX, maxY, maxZ] */
  bbox: [number, number, number, number, number, number]
}

const MAGIC = 'CHMESH01'
const MAGIC_BYTES = 8

interface HeaderPart {
  name: string
  color: [number, number, number] | null
  faces: MeshFace[]
  positions: [number, number]
  normals: [number, number] | null
  indices: [number, number]
}

interface Header {
  unit: string
  triangleCount: number
  bbox: [number, number, number, number, number, number]
  parts: HeaderPart[]
}

const align4 = (n: number) => (n + 3) & ~3

export function encodeModel(model: TessellatedModel): ArrayBuffer {
  const chunks: ArrayBufferView[] = []
  let offset = 0

  // Every chunk starts 4-byte aligned so the decoder can build typed array
  // views directly over the payload instead of copying.
  const push = (view: ArrayBufferView): [number, number] => {
    const start = offset
    chunks.push(view)
    offset += view.byteLength
    const pad = align4(offset) - offset
    if (pad > 0) {
      chunks.push(new Uint8Array(pad))
      offset += pad
    }
    return [start, view.byteLength]
  }

  const parts: HeaderPart[] = model.parts.map((part) => ({
    name: part.name,
    color: part.color,
    faces: part.faces,
    positions: push(part.positions),
    normals: part.normals ? push(part.normals) : null,
    indices: push(part.indices),
  }))

  const header: Header = {
    unit: model.unit,
    triangleCount: model.triangleCount,
    bbox: model.bbox,
    parts,
  }

  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const headerLen = align4(headerBytes.byteLength)
  const prefixLen = MAGIC_BYTES + 4 + headerLen

  const out = new Uint8Array(prefixLen + offset)
  const view = new DataView(out.buffer)

  for (let i = 0; i < MAGIC_BYTES; i++) out[i] = MAGIC.charCodeAt(i)
  view.setUint32(MAGIC_BYTES, headerBytes.byteLength, true)
  out.set(headerBytes, MAGIC_BYTES + 4)

  let cursor = prefixLen
  for (const chunk of chunks) {
    out.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength), cursor)
    cursor += chunk.byteLength
  }

  return out.buffer
}

export function decodeModel(buffer: ArrayBuffer): TessellatedModel {
  const bytes = new Uint8Array(buffer)

  for (let i = 0; i < MAGIC_BYTES; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) {
      throw new Error('Not a Chorus mesh blob — magic mismatch')
    }
  }

  const view = new DataView(buffer)
  const headerLen = view.getUint32(MAGIC_BYTES, true)
  const headerBytes = bytes.subarray(MAGIC_BYTES + 4, MAGIC_BYTES + 4 + headerLen)
  const header: Header = JSON.parse(new TextDecoder().decode(headerBytes))

  const payload = MAGIC_BYTES + 4 + align4(headerLen)

  const parts: MeshPart[] = header.parts.map((part) => ({
    name: part.name,
    color: part.color,
    faces: part.faces,
    positions: new Float32Array(buffer, payload + part.positions[0], part.positions[1] / 4),
    normals: part.normals
      ? new Float32Array(buffer, payload + part.normals[0], part.normals[1] / 4)
      : null,
    indices: new Uint32Array(buffer, payload + part.indices[0], part.indices[1] / 4),
  }))

  return {
    parts,
    unit: header.unit,
    triangleCount: header.triangleCount,
    bbox: header.bbox,
  }
}
