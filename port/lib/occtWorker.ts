// Web Worker that runs OpenCascade (WASM) to tessellate a b-rep CAD file.
//
// This has to be off the main thread: the WASM binary is ~7 MB and tessellating
// a real part takes hundreds of milliseconds to seconds. Doing it inline would
// freeze the page every time a reviewer opened a revision.

import occtimportjs, { type Occt } from 'occt-import-js'
import { occtResultToModel } from './occtResult'
import type { TessellatedModel } from './meshCodec'

export type CadFormat = 'step' | 'iges' | 'brep'

export interface TessellateRequest {
  id: number
  format: CadFormat
  buffer: ArrayBuffer
  wasmUrl: string
  linearUnit: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot'
  /** Ratio of the average bounding box. Smaller = finer mesh, slower. */
  linearDeflection: number
  angularDeflection: number
}

export type TessellateResponse =
  | { id: number; ok: true; model: TessellatedModel }
  | { id: number; ok: false; error: string }

let occtPromise: Promise<Occt> | null = null

function loadOcct(wasmUrl: string): Promise<Occt> {
  // The module is instantiated once per worker and reused across requests —
  // re-instantiating would re-fetch and re-compile the WASM every time.
  if (!occtPromise) {
    occtPromise = occtimportjs({ locateFile: () => wasmUrl })
  }
  return occtPromise
}

self.onmessage = async (event: MessageEvent<TessellateRequest>) => {
  const req = event.data

  try {
    const occt = await loadOcct(req.wasmUrl)
    const bytes = new Uint8Array(req.buffer)
    const params = {
      linearUnit: req.linearUnit,
      linearDeflectionType: 'bounding_box_ratio' as const,
      linearDeflection: req.linearDeflection,
      angularDeflection: req.angularDeflection,
    }

    const result =
      req.format === 'iges'
        ? occt.ReadIgesFile(bytes, params)
        : req.format === 'brep'
          ? occt.ReadBrepFile(bytes, params)
          : occt.ReadStepFile(bytes, params)

    if (!result.success) {
      const response: TessellateResponse = {
        id: req.id,
        ok: false,
        error: 'OpenCascade could not read the file — it may be malformed or an unsupported schema.',
      }
      ;(self as unknown as Worker).postMessage(response)
      return
    }

    const model = occtResultToModel(result, req.linearUnit)

    // Transfer the payload rather than structured-cloning it — a large part is
    // tens of megabytes of vertex data.
    const transfer: ArrayBuffer[] = []
    for (const part of model.parts) {
      // These are always plain ArrayBuffers — they are allocated here, never
      // from a SharedArrayBuffer — but the typed-array `buffer` type is wider.
      transfer.push(part.positions.buffer as ArrayBuffer, part.indices.buffer as ArrayBuffer)
      if (part.normals) transfer.push(part.normals.buffer as ArrayBuffer)
    }

    const response: TessellateResponse = { id: req.id, ok: true, model }
    ;(self as unknown as Worker).postMessage(response, transfer)
  } catch (error) {
    const response: TessellateResponse = {
      id: req.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    ;(self as unknown as Worker).postMessage(response)
  }
}
