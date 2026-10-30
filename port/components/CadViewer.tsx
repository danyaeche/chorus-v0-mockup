import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildObject, disposeObject, modelSize, type TessellatedModel } from '../lib/occt'
import type { ChangeKind, DiffRegion } from '../lib/geometryDiff'
import './cad.css'

export interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
}

export interface CadViewerHandle {
  fit(): void
  focusRegion(region: DiffRegion): void
  getCamera(): CameraState | null
  applyCamera(state: CameraState): void
}

export interface CadViewerProps {
  model: TessellatedModel | null
  /** Shown top-left, e.g. "enclosure-lower.step · Rev C". */
  caption?: string
  /** Status text while the model is being fetched or tessellated. */
  loading?: string | null
  error?: string | null
  height?: number | string
  /** Renders the body translucent so overlays read through it. */
  ghost?: boolean
  /** Change regions to draw as coloured boxes over the body. */
  overlays?: DiffRegion[]
  showOverlays?: boolean
  /** Region to frame — pass the same object identity to avoid re-framing. */
  focused?: DiffRegion | null
  autoRotate?: boolean
  /** Enables drag-a-CAD-file-to-replace. */
  onFileDrop?: (file: File) => void
  onCameraChange?: (state: CameraState) => void
  className?: string
}

const TONE_VAR: Record<ChangeKind, string> = {
  added: '--tone-ok',
  modified: '--tone-warn',
  removed: '--tone-danger',
}

/** Read a `R G B` design token off the document and turn it into a THREE.Color. */
function tokenColor(name: string, fallback: number): THREE.Color {
  if (typeof window === 'undefined') return new THREE.Color(fallback)
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const parts = raw.split(/[\s,]+/).map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return new THREE.Color(fallback)
  return new THREE.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255)
}

export const CadViewer = forwardRef<CadViewerHandle, CadViewerProps>(function CadViewer(
  {
    model,
    caption,
    loading,
    error,
    height = 380,
    ghost = false,
    overlays,
    showOverlays = true,
    focused,
    autoRotate = false,
    onFileDrop,
    onCameraChange,
    className,
  },
  ref,
) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const bodyRef = useRef<THREE.Group | null>(null)
  const overlayRef = useRef<THREE.Group | null>(null)
  const gridRef = useRef<THREE.GridHelper | null>(null)
  const sizeRef = useRef(1)

  // Render-on-demand: the loop only draws when something actually changed,
  // so an idle viewer costs nothing. Damping and auto-rotate flip it back on.
  const dirtyRef = useRef(true)
  const invalidate = useCallback(() => {
    dirtyRef.current = true
  }, [])

  const [dropping, setDropping] = useState(false)
  const [grid, setGrid] = useState(true)
  const [wireframe, setWireframe] = useState(false)
  const [webglFailed, setWebglFailed] = useState(false)

  const onCameraChangeRef = useRef(onCameraChange)
  onCameraChangeRef.current = onCameraChange

  /* ---- one-time scene setup ---- */
  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch {
      setWebglFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10_000)
    camera.position.set(1, 0.8, 1.4)
    cameraRef.current = camera

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.addEventListener('change', () => {
      invalidate()
      const state = getCameraState()
      if (state) onCameraChangeRef.current?.(state)
    })
    controlsRef.current = controls

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xffffff, 2.1)
    key.position.set(2.5, 4, 3)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.7)
    fill.position.set(-3, -1, -2)
    scene.add(fill)

    const overlayGroup = new THREE.Group()
    scene.add(overlayGroup)
    overlayRef.current = overlayGroup

    const resize = () => {
      const { clientWidth, clientHeight } = stage
      if (!clientWidth || !clientHeight) return
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
      invalidate()
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(stage)

    let frame = 0
    const loop = () => {
      frame = requestAnimationFrame(loop)
      const moved = controls.update()
      if (moved || dirtyRef.current) {
        dirtyRef.current = false
        renderer.render(scene, camera)
      }
    }
    loop()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      if (bodyRef.current) disposeObject(bodyRef.current)
      disposeObject(overlayGroup)
      if (gridRef.current) {
        gridRef.current.geometry.dispose()
        ;(gridRef.current.material as THREE.Material).dispose()
      }
      renderer.dispose()
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      bodyRef.current = null
      overlayRef.current = null
      gridRef.current = null
    }
  }, [invalidate])

  /* ---- auto-rotate ---- */
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 1.2
    invalidate()
  }, [autoRotate, invalidate])

  const frameAll = useCallback(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return

    const size = sizeRef.current
    const distance = size * 2.1
    const direction = new THREE.Vector3(0.72, 0.5, 1).normalize()

    controls.target.set(0, 0, 0)
    camera.position.copy(direction.multiplyScalar(distance))
    camera.near = Math.max(size / 1000, 0.01)
    camera.far = size * 100
    camera.updateProjectionMatrix()
    controls.update()
    invalidate()
  }, [invalidate])

  /* ---- swap the model ---- */
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (bodyRef.current) {
      scene.remove(bodyRef.current)
      disposeObject(bodyRef.current)
      bodyRef.current = null
    }

    if (!model) {
      invalidate()
      return
    }

    const size = modelSize(model)
    sizeRef.current = size

    const body = buildObject(model, {
      ghost,
      color: tokenColor('--ink-faint', 0xc8ccd0).multiplyScalar(1.6),
    })
    scene.add(body)
    bodyRef.current = body

    if (gridRef.current) {
      scene.remove(gridRef.current)
      gridRef.current.geometry.dispose()
      ;(gridRef.current.material as THREE.Material).dispose()
      gridRef.current = null
    }
    const helper = new THREE.GridHelper(size * 4, 20, 0x888888, 0x888888)
    helper.position.y = -size * 0.62
    const gridMaterial = helper.material as THREE.Material
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.16
    helper.visible = grid
    scene.add(helper)
    gridRef.current = helper

    frameAll()
    // `grid` is applied here on first build and kept in sync by its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, ghost, frameAll, invalidate])

  /* ---- grid + wireframe toggles ---- */
  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = grid
    invalidate()
  }, [grid, invalidate])

  useEffect(() => {
    bodyRef.current?.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial
        material.wireframe = wireframe
      }
    })
    invalidate()
  }, [wireframe, invalidate])

  /* ---- diff overlays ---- */
  useEffect(() => {
    const group = overlayRef.current
    const body = bodyRef.current
    if (!group) return

    disposeObject(group)
    group.clear()

    if (!overlays?.length || !showOverlays || !body) {
      invalidate()
      return
    }

    // Overlays are computed in the model's own coordinates; the body is recentred
    // on the origin, so they need the same offset to line up.
    group.position.copy(body.position)

    for (const region of overlays) {
      const [minX, minY, minZ, maxX, maxY, maxZ] = region.bbox
      const geometry = new THREE.BoxGeometry(
        Math.max(maxX - minX, 1e-6),
        Math.max(maxY - minY, 1e-6),
        Math.max(maxZ - minZ, 1e-6),
      )
      const color = tokenColor(TONE_VAR[region.kind], 0xff9900)
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      })
      const box = new THREE.Mesh(geometry, material)
      box.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
      group.add(box)

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color }),
      )
      edges.position.copy(box.position)
      group.add(edges)
    }

    invalidate()
  }, [overlays, showOverlays, model, invalidate])

  const getCameraState = useCallback((): CameraState | null => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return null
    return {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    }
  }, [])

  const focusOn = useCallback(
    (region: DiffRegion) => {
      const camera = cameraRef.current
      const controls = controlsRef.current
      const body = bodyRef.current
      if (!camera || !controls || !body) return

      const [minX, minY, minZ, maxX, maxY, maxZ] = region.bbox
      const center = new THREE.Vector3(
        (minX + maxX) / 2 + body.position.x,
        (minY + maxY) / 2 + body.position.y,
        (minZ + maxZ) / 2 + body.position.z,
      )
      const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, sizeRef.current * 0.08)
      const direction = camera.position.clone().sub(controls.target).normalize()

      controls.target.copy(center)
      camera.position.copy(center.clone().add(direction.multiplyScalar(span * 4)))
      controls.update()
      invalidate()
    },
    [invalidate],
  )

  useEffect(() => {
    if (focused) focusOn(focused)
  }, [focused, focusOn])

  useImperativeHandle(
    ref,
    () => ({
      fit: frameAll,
      focusRegion: focusOn,
      getCamera: getCameraState,
      applyCamera(state: CameraState) {
        const camera = cameraRef.current
        const controls = controlsRef.current
        if (!camera || !controls) return
        camera.position.set(...state.position)
        controls.target.set(...state.target)
        controls.update()
        invalidate()
      },
    }),
    [frameAll, focusOn, getCameraState, invalidate],
  )

  const zoom = useCallback(
    (factor: number) => {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera || !controls) return
      const offset = camera.position.clone().sub(controls.target)
      const length = THREE.MathUtils.clamp(
        offset.length() * factor,
        sizeRef.current * 0.15,
        sizeRef.current * 40,
      )
      camera.position.copy(controls.target.clone().add(offset.setLength(length)))
      controls.update()
      invalidate()
    },
    [invalidate],
  )

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDropping(false)
    const file = event.dataTransfer.files?.[0]
    if (file && onFileDrop) onFileDrop(file)
  }

  const status = webglFailed
    ? { tone: 'danger', text: 'This browser could not start WebGL, so the 3D view is unavailable.' }
    : error
      ? { tone: 'danger', text: error }
      : loading
        ? { tone: 'default', text: loading }
        : !model
          ? { tone: 'default', text: 'No CAD attached to this revision.' }
          : null

  return (
    <div
      className={className ? `cad ${className}` : 'cad'}
      style={{ height }}
      data-dropping={dropping}
      onDragOver={
        onFileDrop
          ? (event) => {
              event.preventDefault()
              setDropping(true)
            }
          : undefined
      }
      onDragLeave={onFileDrop ? () => setDropping(false) : undefined}
      onDrop={onFileDrop ? handleDrop : undefined}
    >
      <div className="cad-stage" ref={stageRef}>
        <canvas className="cad-canvas" ref={canvasRef} tabIndex={0} aria-label={caption ?? 'CAD model'} />

        {caption && !status && <span className="cad-caption">{caption}</span>}

        {status && (
          <div className="cad-status" data-tone={status.tone} role={status.tone === 'danger' ? 'alert' : 'status'}>
            {loading && !error && !webglFailed && (
              <div className="cad-progress"><span /></div>
            )}
            <p>{status.text}</p>
            {onFileDrop && !model && !loading && !error && !webglFailed && (
              <p>Drag a STEP, IGES or BREP file here to attach one.</p>
            )}
          </div>
        )}

        {model && !status && (
          <div className="cad-toolbar" role="toolbar" aria-label="CAD view controls">
            <button type="button" className="cad-tool" onClick={() => zoom(0.8)} title="Zoom in" aria-label="Zoom in">
              <Icon d="M7 1v12M1 7h12" />
            </button>
            <button type="button" className="cad-tool" onClick={() => zoom(1.25)} title="Zoom out" aria-label="Zoom out">
              <Icon d="M1 7h12" />
            </button>
            <button type="button" className="cad-tool" onClick={frameAll} title="Fit to view" aria-label="Fit to view">
              <Icon d="M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9" />
            </button>
            <button
              type="button"
              className="cad-tool"
              onClick={() => setGrid((value) => !value)}
              aria-pressed={grid}
              title="Toggle grid"
              aria-label="Toggle grid"
            >
              <Icon d="M1 5h12M1 9h12M5 1v12M9 1v12" />
            </button>
            <button
              type="button"
              className="cad-tool"
              onClick={() => setWireframe((value) => !value)}
              aria-pressed={wireframe}
              title="Toggle wireframe"
              aria-label="Toggle wireframe"
            >
              <Icon d="M7 1l6 3.5v5L7 13 1 9.5v-5L7 1zM1 4.5l6 3.5 6-3.5M7 8v5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

function Icon({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
