// Auth hero (sign-in) — a globe built from latitude rings drawn as dashes of varying
// length, slowly rotating, tilted to echo the chorus logo. White lines on the dark panel.
import * as THREE from 'three';

const host = document.getElementById('authHero');
if (host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 16);
  camera.lookAt(0, 0.5, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(4, 5, 6); scene.add(key);

  const world = new THREE.Group();
  world.position.y = 1.15;
  world.rotation.z = -0.5;   // tilt to echo the chorus logo
  scene.add(world);

  const R = 2.05;
  const sp = (lat, lon) => new THREE.Vector3(R * Math.cos(lat) * Math.cos(lon), R * Math.sin(lat), R * Math.cos(lat) * Math.sin(lon));
  const ringMat = new THREE.LineBasicMaterial({ color: 0xeef2f2, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false });

  // ---- Globe built from latitude rings, drawn as dashes of varying length ----
  const globe = new THREE.Group();
  (() => {
    const verts = [], LATS = 30;
    for (let l = 0; l < LATS; l++) {
      const lat = (l / (LATS - 1) - 0.5) * Math.PI * 0.94;
      let ang = Math.random() * 0.6;
      while (ang < Math.PI * 2) {
        const len = 0.06 + Math.random() * 0.18, a2 = Math.min(Math.PI * 2, ang + len), k = 6;
        for (let s = 0; s < k; s++) {
          const p1 = sp(lat, ang + (a2 - ang) * s / k), p2 = sp(lat, ang + (a2 - ang) * (s + 1) / k);
          verts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        }
        ang = a2 + 0.045 + Math.random() * 0.06;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    globe.add(new THREE.LineSegments(g, ringMat));
  })();
  world.add(globe);

  // ---- Signal arcs: bigger/longer/slower trails that emanate, bow high & return (same as signup) ----
  const SEG = 140, TAIL = 0.6, RAD = 6, IPS = RAD * 6;
  const ARC_COLOR = 0xe6ecec;     // soft white-grey

  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.strokeStyle = '#ffffff'; x.lineWidth = 5;
    x.beginPath(); x.arc(32, 32, 20, 0, Math.PI*2); x.stroke();
    return new THREE.CanvasTexture(c);
  })();
  function randPt() {             // random point on the unit sphere → scaled to R
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return new THREE.Vector3(Math.cos(th) * s, u, Math.sin(th) * s).multiplyScalar(R);
  }
  function makeArc() {
    const o = { t: Math.random(), speed: 0.075 + Math.random() * 0.05 };   // slower cadence
    const setup = () => {
      let a = randPt(), b = randPt(), guard = 0;
      // wide spans so the arc travels far across the globe (more curvature)
      while (a.distanceTo(b) < R * 1.2 && guard++ < 80) b = randPt();
      o.a = a.clone(); const bEnd = b.clone();
      // big lift → arc bows high above the surface
      const ctrl = o.a.clone().add(bEnd).multiplyScalar(0.5).setLength(R + R * (0.9 + Math.random() * 0.7));
      o.curve = new THREE.QuadraticBezierCurve3(o.a, ctrl, bEnd);
      const g = new THREE.TubeGeometry(o.curve, SEG, 0.012, RAD, false);
      if (o.mesh) { o.mesh.geometry.dispose(); o.mesh.geometry = g; }
      else { o.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: ARC_COLOR,
        transparent: true, opacity: 0.5, depthWrite: false })); world.add(o.mesh); }
      o.mesh.geometry.setDrawRange(0, 0);
      if (!o.node) { o.node = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: ARC_COLOR,
        transparent: true, depthWrite: false, opacity: 0 })); o.node.scale.setScalar(0.16); world.add(o.node); }
      o.node.position.copy(o.a);
      if (!o.endNode) { o.endNode = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: ARC_COLOR,
        transparent: true, depthWrite: false, opacity: 0 })); o.endNode.scale.setScalar(0.16); world.add(o.endNode); }
      o.endNode.position.copy(bEnd);
    };
    setup(); o.respawn = setup;
    return o;
  }
  const arcs = [];   // satellites removed — globe only

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  let last = performance.now();
  (function animate() {
    requestAnimationFrame(animate);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    globe.rotation.y += 0.004;                 // slow globe spin

    arcs.forEach(o => {
      o.t += o.speed * dt;
      if (o.t >= 1 + TAIL) { o.t = 0; o.respawn(); }   // returned to surface → new arc
      const head = Math.min(1, o.t), tail = Math.max(0, o.t - TAIL);
      const start = Math.round(tail * SEG) * IPS;
      const count = Math.max(0, Math.round(head * SEG) * IPS - start);
      o.mesh.geometry.setDrawRange(start, count);
      const f = Math.sin(Math.min(1, o.t) * Math.PI);
      o.mesh.material.opacity = 0.5 * f;
      o.node.material.opacity = 0.7 * f * Math.max(0, 1 - o.t * 1.4);   // source fades as it leaves
      o.endNode.material.opacity = (o.t > 0.82) ? 0.7 * f : 0;          // destination on arrival
    });
    renderer.render(scene, camera);
  })();
}
