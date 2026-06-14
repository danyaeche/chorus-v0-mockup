// CAD gallery — ONE WebGL context blitted to many 2D canvases (CADGenBench-style).
// Scans for <canvas class="cad-cell" data-cad-shape="..."> and renders a slowly
// rotating grey-CAD model into each. Drag a cell to orbit it.
// Exports buildShape() so the full-size part viewer can reuse the same geometry.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const GREY = 0xb9bfc4;
let SHARED_MAT = null;
function material() {
  if (!SHARED_MAT) SHARED_MAT = new THREE.MeshStandardMaterial({ color: GREY, metalness: 0.18, roughness: 0.5 });
  return SHARED_MAT;
}

// --- distinct CAD silhouettes ------------------------------------------------
export function buildShape(kind, mat) {
  mat = mat || material();
  const g = new THREE.Group();
  const add = (geo, x, y, z, rx, ry, rz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    g.add(m); return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h, s) => new THREE.CylinderGeometry(r, r, h, s || 40);

  switch (kind) {
    case 'cap': {                                   // charge-port cap
      add(cyl(1.15, 0.5, 48));
      add(cyl(0.95, 0.34, 48), 0, 0.36, 0);
      add(cyl(0.42, 0.5, 32), 0, 0.5, 0);
      add(new THREE.TorusGeometry(1.15, 0.08, 12, 48), 0, -0.18, 0, Math.PI / 2, 0, 0);
      break;
    }
    case 'bezel': {                                 // display bezel (frame w/ window)
      const s = new THREE.Shape();
      s.moveTo(-1.6, -1); s.lineTo(1.6, -1); s.lineTo(1.6, 1); s.lineTo(-1.6, 1); s.lineTo(-1.6, -1);
      const hole = new THREE.Path();
      hole.moveTo(-1.24, -0.64); hole.lineTo(1.24, -0.64); hole.lineTo(1.24, 0.64); hole.lineTo(-1.24, 0.64); hole.lineTo(-1.24, -0.64);
      s.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
      geo.center();
      add(geo, 0, 0, 0, -Math.PI / 2, 0, 0);
      break;
    }
    case 'housing': {                               // controller housing (ribbed)
      add(box(2.4, 0.7, 1.7));
      for (let i = 0; i < 4; i++) add(box(0.1, 0.5, 1.5), -0.9 + i * 0.6, 0.55, 0);
      add(cyl(0.32, 0.8, 28), 0.7, 0.5, 0.4);
      add(cyl(0.2, 0.9, 20), -0.8, 0.55, -0.5);
      break;
    }
    case 'lens': {                                  // light lens (dome)
      add(new THREE.SphereGeometry(1.2, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), 0, -0.2, 0).scale.set(1, 0.72, 1);
      add(new THREE.TorusGeometry(1.18, 0.1, 14, 48), 0, -0.2, 0, Math.PI / 2, 0, 0);
      break;
    }
    case 'tray': {                                  // battery tray (compartments)
      add(box(2.6, 0.4, 1.7));
      for (let i = 0; i < 3; i++) add(box(0.08, 0.5, 1.5), -0.7 + i * 0.7, 0.3, 0);
      add(box(2.4, 0.5, 0.08), 0, 0.3, 0.72);
      add(box(2.4, 0.5, 0.08), 0, 0.3, -0.72);
      break;
    }
    case 'frame': {                                 // mainframe (tube assembly)
      add(cyl(0.26, 3.2, 28), 0, 0, 0, 0, 0, Math.PI / 2);
      add(cyl(0.3, 0.4, 28), -1.6, 0, 0, 0, 0, Math.PI / 2);
      add(cyl(0.3, 0.4, 28), 1.6, 0, 0, 0, 0, Math.PI / 2);
      add(cyl(0.22, 1.7, 24), 1.4, 0.85, 0, 0, 0, -Math.PI / 7);
      add(cyl(0.22, 1.7, 24), -1.0, 0.85, 0, 0, 0, Math.PI / 6);
      break;
    }
    case 'enclosure':                               // battery enclosure (default)
    default: {
      add(box(2.5, 0.5, 1.7));
      add(box(2.5, 0.42, 0.12), 0, 0.36, 0.79);
      add(box(2.5, 0.42, 0.12), 0, 0.36, -0.79);
      add(box(0.12, 0.42, 1.7), 1.19, 0.36, 0);
      add(box(0.12, 0.42, 1.7), -1.19, 0.36, 0);
      add(cyl(0.16, 0.5, 20), 0.85, 0.34, 0.5);
      add(cyl(0.16, 0.5, 20), -0.85, 0.34, -0.5);
      add(cyl(0.16, 0.5, 20), 0.85, 0.34, -0.5);
      add(cyl(0.16, 0.5, 20), -0.85, 0.34, 0.5);
      break;
    }
  }
  return g;
}

// --- shared-renderer gallery -------------------------------------------------
(function () {
  const cells = [];
  let renderer, scene, camera, slot, curW = 0, curH = 0;

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(4, 6, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5); rim.position.set(-5, 2, -4); scene.add(rim);
    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(2.9, 2.0, 3.7); camera.lookAt(0, 0, 0);
    slot = new THREE.Group(); scene.add(slot);
  }

  function fit(model) {
    const b = new THREE.Box3().setFromObject(model);
    const c = b.getCenter(new THREE.Vector3());
    const r = b.getBoundingSphere(new THREE.Sphere()).radius || 1;
    model.position.sub(c);
    const wrap = new THREE.Group(); wrap.add(model); wrap.scale.setScalar(1.35 / r);
    return wrap;
  }

  function addCell(canvas) {
    const stat = canvas.hasAttribute('data-cad-static');
    const holder = fit(buildShape(canvas.getAttribute('data-cad-shape') || 'enclosure'));
    const cell = {
      canvas, ctx: canvas.getContext('2d'), holder, stat: stat, dirty: true,
      rotX: stat ? 0.36 : 0.18, rotY: stat ? -0.62 : (cells.length * 1.1) % (Math.PI * 2),
      speed: stat ? 0 : 0.005 + (cells.length % 3) * 0.0014, visible: true, dragging: false, W: 2, H: 2
    };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cell.size = function () {
      const r = canvas.getBoundingClientRect();
      cell.W = Math.max(2, Math.round(r.width * dpr));
      cell.H = Math.max(2, Math.round(r.height * dpr));
      canvas.width = cell.W; canvas.height = cell.H; cell.dirty = true;
    };
    cell.size();
    if (!stat) {
      canvas.style.touchAction = 'none';
      let px, py, down = false;
      canvas.addEventListener('pointerdown', e => { down = true; cell.dragging = true; px = e.clientX; py = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} });
      canvas.addEventListener('pointermove', e => { if (!down) return; cell.rotY += (e.clientX - px) * 0.01; cell.rotX += (e.clientY - py) * 0.01; px = e.clientX; py = e.clientY; cell.dirty = true; });
      const up = () => { down = false; cell.dragging = false; };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', up);
    }
    cells.push(cell);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!renderer) return;
    for (const c of cells) {
      if (!c.visible || !c.W) continue;
      if (!c.stat && !c.dragging) { c.rotY += c.speed; c.dirty = true; }
      if (!c.dirty) continue;
      if (c.W !== curW || c.H !== curH) { renderer.setSize(c.W, c.H, false); camera.aspect = c.W / c.H; camera.updateProjectionMatrix(); curW = c.W; curH = c.H; }
      slot.clear(); slot.add(c.holder);
      c.holder.rotation.set(c.rotX, c.rotY, 0);
      renderer.render(scene, camera);
      c.ctx.clearRect(0, 0, c.W, c.H);
      c.ctx.drawImage(renderer.domElement, 0, 0, c.W, c.H);
      c.dirty = false;
    }
  }

  function boot() {
    const canvases = document.querySelectorAll('canvas.cad-cell');
    if (!canvases.length) return;
    init();
    canvases.forEach(addCell);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        const c = cells.find(x => x.canvas === e.target); if (c) { c.visible = e.isIntersecting; if (c.visible) c.dirty = true; }
      }), { rootMargin: '120px' });
      canvases.forEach(cv => io.observe(cv));
    }
    window.addEventListener('resize', () => { curW = curH = 0; cells.forEach(c => c.size()); });
    setTimeout(() => { curW = curH = 0; cells.forEach(c => c.size()); }, 80); // re-measure after layout settles
    frame();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
