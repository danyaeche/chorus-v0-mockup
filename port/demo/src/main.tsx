import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CadViewer } from '../../components/CadViewer'
import { RevisionCompare3D } from '../../components/RevisionCompare3D'
import { inferFormat, tessellate, encodeModel, decodeCachedMesh, type TessellatedModel } from '../../lib/occt'
import './tokens.css'

// Real STEP fixtures, copied out of occt-import-js so the demo has something to
// show without the user finding a CAD file first.
const SAMPLES = {
  'Assembly (AP203)': '/samples/as1-tu-203.stp',
  'Rounded cube': '/samples/rounded-cube.step',
  'Basic cube': '/samples/cube.stp',
}

function useSample(url: string | null) {
  const [model, setModel] = useState<TessellatedModel | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timing, setTiming] = useState<string | null>(null)

  useEffect(() => {
    if (!url) {
      setModel(null)
      return
    }

    let cancelled = false
    const run = async () => {
      setError(null)
      setLoading('Reading CAD — this happens once per revision…')
      try {
        const started = performance.now()
        const response = await fetch(url)
        const buffer = await response.arrayBuffer()
        const bytes = buffer.byteLength
        const format = inferFormat(url) ?? 'step'
        const result = await tessellate(buffer, format)
        if (cancelled) return

        // Exercise the cache path too, so the demo proves the round-trip the
        // real app depends on rather than only the parse.
        const encoded = encodeModel(result)
        const decoded = decodeCachedMesh(encoded)

        setModel(decoded)
        setLoading(null)
        setTiming(
          `${(bytes / 1024).toFixed(0)} KB STEP → ${decoded.triangleCount.toLocaleString()} triangles ` +
            `→ ${(encoded.byteLength / 1024).toFixed(0)} KB cached · ${Math.round(performance.now() - started)} ms`,
        )
      } catch (caught) {
        if (cancelled) return
        setLoading(null)
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [url])

  return { model, loading, error, timing }
}

function App() {
  const [sampleUrl, setSampleUrl] = useState<string | null>(SAMPLES['Assembly (AP203)'])
  const [dark, setDark] = useState(false)
  const { model, loading, error, timing } = useSample(sampleUrl)

  const [dropped, setDropped] = useState<TessellatedModel | null>(null)
  const [dropError, setDropError] = useState<string | null>(null)
  const [dropLoading, setDropLoading] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  const handleFile = useCallback(async (file: File) => {
    const format = inferFormat(file.name)
    if (!format) {
      setDropError(`Not a CAD file this build reads: ${file.name}`)
      return
    }
    setDropError(null)
    setDropLoading(`Reading ${file.name}…`)
    try {
      const result = await tessellate(await file.arrayBuffer(), format)
      setDropped(result)
      setDropLoading(null)
    } catch (caught) {
      setDropLoading(null)
      setDropError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [])

  // A stand-in "next revision": the same solid, shifted, so the diff has
  // something real to find without needing two versions of one part on disk.
  const [revised, setRevised] = useState<TessellatedModel | null>(null)
  useEffect(() => {
    if (!model) {
      setRevised(null)
      return
    }
    const span = Math.max(
      model.bbox[3] - model.bbox[0],
      model.bbox[4] - model.bbox[1],
      model.bbox[5] - model.bbox[2],
    )
    const shift = span * 0.12
    setRevised({
      ...model,
      parts: model.parts.map((part, index) => {
        if (index !== model.parts.length - 1) return part
        const positions = new Float32Array(part.positions)
        for (let i = 0; i < positions.length; i += 3) positions[i + 2] += shift
        return { ...part, positions }
      }),
      bbox: [
        model.bbox[0], model.bbox[1], model.bbox[2],
        model.bbox[3], model.bbox[4], model.bbox[5] + shift,
      ],
    })
  }, [model])

  return (
    <div className="demo-shell">
      <h1>CAD viewer + revision compare</h1>
      <p className="demo-sub">
        The mockup's geometry flows, ported to run on real STEP via OpenCascade (WASM),
        styled with the deployed app's design tokens.
      </p>

      <div className="demo-bar">
        {Object.entries(SAMPLES).map(([label, url]) => (
          <button
            key={url}
            className="demo-btn"
            data-primary={sampleUrl === url}
            onClick={() => setSampleUrl(url)}
          >
            {label}
          </button>
        ))}
        <span className="demo-spacer" />
        <button className="demo-btn" onClick={() => setDark((value) => !value)}>
          {dark ? 'Light theme' : 'Dark theme'}
        </button>
      </div>

      {timing && <p className="demo-sub">{timing}</p>}

      <section className="demo-section">
        <h2 className="demo-h2">Viewer — part detail</h2>
        <CadViewer
          model={dropped ?? model}
          caption={dropped ? 'your file' : sampleUrl?.split('/').pop()}
          loading={dropLoading ?? loading}
          error={dropError ?? error}
          height={420}
          onFileDrop={handleFile}
        />
        <p className="demo-sub" style={{ marginTop: '0.5rem' }}>
          Drag a STEP, IGES or BREP file onto the viewer to load your own.
        </p>
      </section>

      <section className="demo-section">
        <h2 className="demo-h2">Revision compare — synced, with geometric diff</h2>
        <RevisionCompare3D
          fromModel={model}
          toModel={revised}
          fromLabel="Rev A"
          toLabel="Rev B"
          fromCaption="baseline geometry"
          toCaption="revised geometry"
          loading={loading}
          error={error}
          height={400}
        />
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
