// Main-thread API for CAD tessellation and three.js conversion.

import * as THREE from 'three'
import type { CadFormat, TessellateRequest, TessellateResponse } from './occtWorker'
import { decodeModel, type MeshPart, type TessellatedModel } from './meshCodec'

export type { CadFormat }
export { encodeModel, decodeModel } from './meshCodec'
export type { TessellatedModel, MeshPart } from './meshCodec'

export interface TessellateOptions {
  /** Where the OpenCascade WASM is served from. See port/README.md for Vite setup. */
  wasmUrl?: string
  linearUnit?: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot'
  /** Ratio of the average bounding box. 0.001 is a good default for review. */
  linearDeflection?: number
  angularDeflection?: number
  signal?: AbortSignal
}

const DEFAULT_WASM_URL = '/occt/occt-import-js.wasm'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<
  number,
  { resolve: (model: TessellatedModel) => void; reject: (error: Error) => void }
>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./occtWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<TessellateResponse>) => {
      const entry = pending.get(event.data.id)
      if (!entry) return
      pending.delete(event.data.id)
      if (event.data.ok) entry.resolve(event.data.model)
      else entry.reject(new Error(event.data.error))
    }
    worker.onerror = (event) => {
      // A worker-level failure kills every request in flight; failing them
      // individually leaves callers hanging forever.
      const error = new Error(event.message || 'CAD worker failed')
      for (const [, entry] of pending) entry.reject(error)
      pending.clear()
      worker?.terminate()
      worker = null
    }
  }
  return worker
}

export function inferFormat(filename: string): CadFormat | null {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (ext === 'step' || ext === 'stp') return 'step'
  if (ext === 'iges' || ext === 'igs') return 'iges'
  if (ext === 'brep') return 'brep'
  return null
}

/**
 * Tessellate a b-rep CAD file into renderable geometry.
 *
 * Expensive — a real part takes hundreds of ms to seconds and pulls a ~7 MB
 * WASM binary on first call. Callers should cache the result (see
 * `convex/geometry.ts`) rather than calling this on every view.
 */
export function tessellate(
  buffer: ArrayBuffer,
  format: CadFormat,
  options: TessellateOptions = {},
): Promise<TessellatedModel> {
  const id = nextId++

  return new Promise<TessellatedModel>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    pending.set(id, { resolve, reject })

    options.signal?.addEventListener('abort', () => {
      // The worker keeps grinding — OpenCascade has no cancellation hook — but
      // the caller stops waiting and the result is dropped on arrival.
      if (pending.delete(id)) {
        reject(new DOMException('Aborted', 'AbortError'))
      }
    })

    const request: TessellateRequest = {
      id,
      format,
      buffer,
      wasmUrl: options.wasmUrl ?? DEFAULT_WASM_URL,
      linearUnit: options.linearUnit ?? 'millimeter',
      linearDeflection: options.linearDeflection ?? 0.001,
      angularDeflection: options.angularDeflection ?? 0.5,
    }

    getWorker().postMessage(request, [buffer])
  })
}

/** Decode a cached mesh blob — the fast path that skips OpenCascade entirely. */
export function decodeCachedMesh(buffer: ArrayBuffer): TessellatedModel {
  return decodeModel(buffer)
}

function toBufferGeometry(part: MeshPart): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3))
  if (part.normals) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3))
  }
  geometry.setIndex(new THREE.BufferAttribute(part.indices, 1))
  if (!part.normals) geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export interface BuildOptions {
  /** Overrides any per-mesh colour carried in the CAD file. */
  color?: THREE.ColorRepresentation
  opacity?: number
  /** Renders as a translucent shell so a second model can be seen through it. */
  ghost?: boolean
}

/** Build a three.js group from a tessellated model. */
export function buildObject(
  model: TessellatedModel,
  options: BuildOptions = {},
): THREE.Group {
  const group = new THREE.Group()
  const ghost = options.ghost ?? false
  const opacity = options.opacity ?? (ghost ? 0.18 : 1)

  for (const part of model.parts) {
    const geometry = toBufferGeometry(part)
    const color =
      options.color ??
      (part.color
        ? new THREE.Color(part.color[0], part.color[1], part.color[2])
        : new THREE.Color(0xc8ccd0))

    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.05,
      roughness: 0.62,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: opacity >= 1,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = part.name
    group.add(mesh)
  }

  // Centre on the origin so orbit controls rotate about the part rather than
  // about wherever the CAD file happened to put its origin.
  const box = new THREE.Box3(
    new THREE.Vector3(model.bbox[0], model.bbox[1], model.bbox[2]),
    new THREE.Vector3(model.bbox[3], model.bbox[4], model.bbox[5]),
  )
  const center = box.getCenter(new THREE.Vector3())
  group.position.set(-center.x, -center.y, -center.z)

  return group
}

/** Longest bounding-box edge — used to frame the camera. */
export function modelSize(model: TessellatedModel): number {
  const dx = model.bbox[3] - model.bbox[0]
  const dy = model.bbox[4] - model.bbox[1]
  const dz = model.bbox[5] - model.bbox[2]
  return Math.max(dx, dy, dz) || 1
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material.dispose()
    }
  })
}
