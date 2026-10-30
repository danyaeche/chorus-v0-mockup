import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CadViewer, type CadViewerHandle, type CameraState } from './CadViewer'
import { diffGeometry, type DiffRegion, type GeometryDiff } from '../lib/geometryDiff'
import type { TessellatedModel } from '../lib/occt'
import './cad.css'

export interface RevisionCompare3DProps {
  fromModel: TessellatedModel | null
  toModel: TessellatedModel | null
  fromLabel: string
  toLabel: string
  fromCaption?: string
  toCaption?: string
  /** Precomputed diff from `graph.geometry.getCachedDiff`. Computed locally when absent. */
  diff?: GeometryDiff | null
  loading?: string | null
  error?: string | null
  height?: number
}

const KIND_LABEL: Record<DiffRegion['kind'], string> = {
  added: 'Added',
  modified: 'Modified',
  removed: 'Removed',
}

function formatVolume(mm3: number): string {
  if (mm3 >= 1000) return `${(mm3 / 1000).toFixed(1)} cm³`
  if (mm3 >= 1) return `${mm3.toFixed(1)} mm³`
  return `${mm3.toFixed(2)} mm³`
}

export function RevisionCompare3D({
  fromModel,
  toModel,
  fromLabel,
  toLabel,
  fromCaption,
  toCaption,
  diff: providedDiff,
  loading,
  error,
  height = 420,
}: RevisionCompare3DProps) {
  const leftRef = useRef<CadViewerHandle | null>(null)
  const rightRef = useRef<CadViewerHandle | null>(null)

  // Guards the two-way camera binding — without it, applying a camera to one
  // viewer fires its change event, which applies back to the other, forever.
  const syncingRef = useRef(false)

  const [ghost, setGhost] = useState(false)
  const [highlight, setHighlight] = useState(true)
  const [autoRotate, setAutoRotate] = useState(false)
  const [focused, setFocused] = useState<DiffRegion | null>(null)
  const [localDiff, setLocalDiff] = useState<GeometryDiff | null>(null)
  const [diffing, setDiffing] = useState(false)

  const diff = providedDiff ?? localDiff

  useEffect(() => {
    if (providedDiff || !fromModel || !toModel) return

    let cancelled = false
    setDiffing(true)

    // Yield a frame first so the two viewers paint before the main thread is
    // taken by the diff. Large parts should use the cached server-side diff
    // instead — see `graph.geometry.getCachedDiff`.
    const handle = requestAnimationFrame(() => {
      const result = diffGeometry(fromModel, toModel)
      if (cancelled) return
      setLocalDiff(result)
      setDiffing(false)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(handle)
    }
  }, [providedDiff, fromModel, toModel])

  const syncFrom = useCallback((source: 'left' | 'right', state: CameraState) => {
    if (syncingRef.current) return
    syncingRef.current = true
    const target = source === 'left' ? rightRef.current : leftRef.current
    target?.applyCamera(state)
    // Release on the next frame: applyCamera fires a change event synchronously
    // and that event must find the guard still closed.
    requestAnimationFrame(() => {
      syncingRef.current = false
    })
  }, [])

  const regions = useMemo(() => diff?.regions ?? [], [diff])
  const overlays = useMemo(
    () => (focused ? regions.filter((region) => region === focused) : regions),
    [regions, focused],
  )

  const status = diffing ? 'Comparing geometry…' : null

  return (
    <div>
      <div className="cad-pane-head" style={{ marginBottom: '0.75rem' }}>
        <div>
          <p className="cad-pane-meta">Revision compare · geometry</p>
          <p className="cad-pane-label">
            {fromLabel} → {toLabel}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <Toggle pressed={ghost} onClick={() => setGhost((v) => !v)}>
            Ghost body
          </Toggle>
          <Toggle pressed={highlight} onClick={() => setHighlight((v) => !v)}>
            Highlight changes
          </Toggle>
          <Toggle pressed={autoRotate} onClick={() => setAutoRotate((v) => !v)}>
            Auto-rotate
          </Toggle>
        </div>
      </div>

      <div className="cad-compare">
        <div className="cad-pane">
          <div className="cad-pane-head">
            <span className="cad-pane-label">{fromLabel}</span>
            <span className="cad-pane-meta">previous</span>
          </div>
          <CadViewer
            ref={leftRef}
            model={fromModel}
            caption={fromCaption}
            loading={loading}
            error={error}
            height={height}
            autoRotate={autoRotate}
            onCameraChange={(state) => syncFrom('left', state)}
          />
        </div>

        <div className="cad-pane" data-current="true">
          <div className="cad-pane-head">
            <span className="cad-pane-label">{toLabel}</span>
            <span className="cad-pane-meta">current</span>
          </div>
          <div style={{ position: 'relative' }}>
            <CadViewer
              ref={rightRef}
              model={toModel}
              caption={toCaption}
              loading={loading ?? status}
              error={error}
              height={height}
              ghost={ghost}
              overlays={overlays}
              showOverlays={highlight}
              focused={focused}
              autoRotate={autoRotate}
              onCameraChange={(state) => syncFrom('right', state)}
            />
            {highlight && regions.length > 0 && (
              <div className="cad-legend">
                {(['modified', 'added', 'removed'] as const).map((kind) => (
                  <span className="cad-legend-row" key={kind}>
                    <span className="cad-swatch" data-kind={kind} />
                    {KIND_LABEL[kind]}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="cad-pane-meta" style={{ textAlign: 'center', margin: '0.625rem 0' }}>
        Drag either model — both stay in sync
      </p>

      {diff && (
        <div className="cad-changes">
          {regions.length === 0 ? (
            <p className="cad-note">
              No geometric difference detected between {fromLabel} and {toLabel}. Declared
              attributes may still have changed — see the attribute diff above.
            </p>
          ) : (
            regions.slice(0, 12).map((region, index) => (
              <button
                type="button"
                key={index}
                className="cad-change"
                aria-current={focused === region}
                onClick={() => {
                  const next = focused === region ? null : region
                  setFocused(next)
                  if (next) {
                    leftRef.current?.focusRegion(next)
                    rightRef.current?.focusRegion(next)
                  } else {
                    leftRef.current?.fit()
                    rightRef.current?.fit()
                  }
                }}
              >
                <span className="cad-swatch" data-kind={region.kind} />
                <span className="cad-change-kind">{KIND_LABEL[region.kind]}</span>
                <span className="cad-change-size">{formatVolume(region.volume)}</span>
              </button>
            ))
          )}

          {regions.length > 12 && (
            <p className="cad-note">
              Showing the 12 largest of {regions.length} changed regions.
            </p>
          )}

          {diff.clamped && (
            <p className="cad-note">
              This part exceeded the diff grid limit, so the comparison ran at reduced
              resolution — small features may be missed.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Toggle({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      style={{
        padding: '0.25rem 0.625rem',
        fontSize: '0.75rem',
        borderRadius: '0.375rem',
        border: '1px solid rgb(var(--line))',
        background: pressed ? 'rgb(var(--accent))' : 'rgb(var(--surface-1))',
        color: pressed ? 'rgb(var(--accent-ink))' : 'rgb(var(--ink-subtle))',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
