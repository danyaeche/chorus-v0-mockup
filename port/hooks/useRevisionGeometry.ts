// Loads renderable geometry for one part revision.
//
// This is where the tessellate-once strategy from port/README.md is enforced:
//
//   mesh cached  → download it, decode, render. OpenCascade never loads.
//   not cached   → download the STEP, tessellate in a worker, render, then
//                  upload the mesh so nobody pays that cost again.
//
// ASSUMPTION: `api.graph.geometry.*` is where port/convex/geometry.ts landed.

import { useEffect, useRef, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import {
  decodeCachedMesh,
  encodeModel,
  inferFormat,
  tessellate,
  type TessellatedModel,
} from '../lib/occt'

export interface RevisionGeometry {
  model: TessellatedModel | null
  loading: string | null
  error: string | null
}

const LINEAR_DEFLECTION = 0.001

export function useRevisionGeometry(
  partVersionId: Id<'partVersions'> | null,
): RevisionGeometry {
  const geometry = useQuery(
    api.graph.geometry.getGeometry,
    partVersionId ? { partVersionId } : 'skip',
  )

  const generateUploadUrl = useMutation(api.graph.geometry.generateCadUploadUrl)
  const recordTessellation = useMutation(api.graph.geometry.recordTessellation)
  const recordFailure = useMutation(api.graph.geometry.recordTessellationFailure)

  const [model, setModel] = useState<TessellatedModel | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Keyed on the blob actually being rendered, so switching revisions reloads
  // but an unrelated re-render does not.
  const loadedKey = useRef<string | null>(null)

  useEffect(() => {
    if (geometry === undefined) {
      setLoading('Loading revision…')
      return
    }

    if (geometry === null) {
      loadedKey.current = null
      setModel(null)
      setLoading(null)
      setError(null)
      return
    }

    if (geometry.tessellationStatus === 'failed') {
      setModel(null)
      setLoading(null)
      setError(
        geometry.tessellationError ??
          'This CAD file could not be read. Re-export it as AP203 or AP214 STEP and upload again.',
      )
      return
    }

    const key = geometry.meshStorageId ?? geometry.sourceStorageId
    if (loadedKey.current === key) return

    const controller = new AbortController()
    let cancelled = false

    const run = async () => {
      setError(null)

      try {
        // Fast path — a previous viewer already tessellated this revision.
        if (geometry.meshUrl) {
          setLoading('Loading geometry…')
          const response = await fetch(geometry.meshUrl, { signal: controller.signal })
          const buffer = await response.arrayBuffer()
          if (cancelled) return
          const decoded = decodeCachedMesh(buffer)
          loadedKey.current = key
          setModel(decoded)
          setLoading(null)
          return
        }

        if (!geometry.sourceUrl) {
          setLoading(null)
          return
        }

        const format = inferFormat(geometry.sourceFilename)
        if (!format) {
          setLoading(null)
          setError(`Unsupported CAD format: ${geometry.sourceFilename}`)
          return
        }

        setLoading('Reading CAD — this happens once per revision…')
        const response = await fetch(geometry.sourceUrl, { signal: controller.signal })
        const buffer = await response.arrayBuffer()
        if (cancelled) return

        const tessellated = await tessellate(buffer, format, {
          linearDeflection: LINEAR_DEFLECTION,
          signal: controller.signal,
        })
        if (cancelled) return

        loadedKey.current = key
        setModel(tessellated)
        setLoading(null)

        // Publish the derived mesh so every later view — anyone's — skips OCCT.
        // Failure here is not surfaced: the user already has their render, and
        // the only cost is that the next viewer tessellates again.
        try {
          const encoded = encodeModel(tessellated)
          const uploadUrl = await generateUploadUrl()
          const upload = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: encoded,
          })
          const { storageId } = await upload.json()

          await recordTessellation({
            partVersionId: geometry.partVersionId,
            meshStorageId: storageId,
            unit: tessellated.unit,
            bbox: tessellated.bbox,
            triangleCount: tessellated.triangleCount,
            linearDeflection: LINEAR_DEFLECTION,
          })
        } catch {
          /* cache write is best-effort */
        }
      } catch (caught) {
        if (cancelled || (caught as Error).name === 'AbortError') return

        const message =
          caught instanceof Error ? caught.message : 'Could not load this revision’s CAD.'
        setLoading(null)
        setError(message)

        if (geometry.tessellationStatus === 'pending') {
          void recordFailure({ partVersionId: geometry.partVersionId, error: message })
        }
      }
    }

    void run()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [geometry, generateUploadUrl, recordTessellation, recordFailure])

  return { model, loading, error }
}
