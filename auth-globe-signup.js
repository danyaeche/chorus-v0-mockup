// Signup hero — Stripe-style dotted-Earth globe: dots placed only on the continents
// (sampled from a land/water mask), colored across a violet → pink → orange gradient by
// longitude, slowly rotating, overflowing the card, with colored signal arcs + ring nodes.
import * as THREE from 'three';

const host = document.getElementById('authHero');
if (host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Stripe framing: globe is huge and only partly shown — it emerges from the lower/back of
  // the panel, top curve in the upper area, the rest bleeding off the bottom & sides.
  // Stripe framing: camera level (so we never see over the top / the bottom rim), globe pushed
  // down so only its top portion shows — the apex sits around the vertical middle of the panel.
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 10.8);
  camera.lookAt(0, 0, 0);

  const world = new THREE.Group();
  world.position.set(0, -1.7, 0);   // show more of the upper hemisphere; top near panel middle
  world.rotation.z = 0.04;
  scene.add(world);

  const R = 3.2;                       // big → overflows / clipped by the card

  // ---- Silhouette outline: a billboarded great-circle ring, bright at the top, fading down
  // the sides — delineates the top edge of the globe against the dark panel. ----
  (() => {
    const N = 320, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const x = Math.cos(a) * R * 1.012, y = Math.sin(a) * R * 1.012;
      pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = 0;
      const top = Math.max(0, y / R);            // 0 at equator/below, 1 at the very top
      const b = Math.pow(top, 0.7);              // bright at the top, fade toward the sides
      col[i*3] = b; col[i*3+1] = b; col[i*3+2] = b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true,
      opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    world.add(new THREE.LineLoop(g, m));
    // a soft second ring just outside for a subtle glow/gradient halo at the top
    const pos2 = new Float32Array(N * 3), col2 = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const x = Math.cos(a) * R * 1.05, y = Math.sin(a) * R * 1.05;
      pos2[i*3] = x; pos2[i*3+1] = y; pos2[i*3+2] = 0;
      const top = Math.max(0, y / R);
      const b = 0.4 * Math.pow(top, 1.4);
      col2[i*3] = b; col2[i*3+1] = b; col2[i*3+2] = b;
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    g2.setAttribute('color', new THREE.BufferAttribute(col2, 3));
    world.add(new THREE.LineLoop(g2, new THREE.LineBasicMaterial({ vertexColors: true,
      transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })));
  })();

  // monochrome white → light-grey gradient (by longitude) — kept bright for contrast
  const STOPS = [0xffffff, 0xf2f4f4, 0xd6dcdc, 0xe8ecec, 0xffffff].map(h => new THREE.Color(h));
  const grad = t => { const x = Math.min(0.9999, Math.max(0, t)) * (STOPS.length - 1);
    const i = Math.floor(x); return STOPS[i].clone().lerp(STOPS[i + 1], x - i); };

  // local color lookup by world-space longitude for arcs (matches the dots)
  function colByLon(v) {
    const lon = (Math.atan2(v.z, v.x) + Math.PI) / (2 * Math.PI);
    return grad(lon);
  }

  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    // crisp, near-solid center → tiny bright points (high contrast against the dark ocean)
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(32, 32, 32, 0, Math.PI*2); x.fill();
    return new THREE.CanvasTexture(c);
  })();

  const dotMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: dotTex }, uSize: { value: 2.15 * Math.min(devicePixelRatio, 2) } },
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    vertexShader: `
      attribute float alpha; attribute float psize; attribute vec3 pcolor;
      varying float vA; varying vec3 vC; uniform float uSize;
      void main() {
        vA = alpha; vC = pcolor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // normal in view space → front-facing (nz>0) points read larger/sharper than receding ones
        vec3 nrm = normalize(mat3(modelViewMatrix) * normalize(position));
        float depth = 0.55 + 0.45 * smoothstep(-0.4, 1.0, nrm.z);
        gl_PointSize = uSize * psize * depth * (1.0 / -mv.z) * 10.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; varying float vA; varying vec3 vC;
      void main() { gl_FragColor = vec4(vC, texture2D(uTex, gl_PointCoord).a * vA); }`,
  });

  let dots, geo, base = [], COUNT = 0;
  const arcs = [];

  let baseA = [];   // per-point base opacity (multiplied by the depth/rim weighting each frame)

  function build(isLand) {
    // Organic point cloud: a lat/long grid decides continent membership (so landmasses stay
    // legible), but each point gets positional jitter, a size from a small-biased distribution,
    // a subtle base opacity, and occasional dropouts — so the cluster feels alive, not gridded.
    // ZOOM OUT the continents: tile the map MAPX times around the globe.
    const ROWS = 300;                    // dense latitude bands → fine pinprick cloud
    const BASE = 420;                    // max dots on the equator row
    const MAPX = 1.32;                   // continents large & recognizable (like the reference)
    const MAPY = 1.18;                   // mild vertical squeeze
    const dir = [], cArr = [], sArr = [];
    baseA = [];

    // small random unit-tangent jitter on the sphere, magnitude ~jit radians
    const jitter = (v, jit) => {
      const t1 = new THREE.Vector3(0, 1, 0).cross(v);
      if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0);
      t1.normalize();
      const t2 = v.clone().cross(t1).normalize();
      const a = Math.random() * Math.PI * 2, m = Math.random() * jit;
      return v.clone()
        .addScaledVector(t1, Math.cos(a) * m)
        .addScaledVector(t2, Math.sin(a) * m)
        .normalize();
    };

    for (let r = 0; r < ROWS; r++) {
      const lat = (r / (ROWS - 1) - 0.5) * Math.PI;
      const cosL = Math.cos(lat);
      const n = Math.max(1, Math.round(BASE * cosL));
      const cellLon = (Math.PI * 2) / n;                 // angular cell width at this row
      const cellLat = Math.PI / ROWS;
      const jit = Math.min(cellLon, cellLat) * 0.42;     // tighter jitter → crisp coastlines
      const y = Math.sin(lat), rr = cosL;
      for (let c = 0; c < n; c++) {
        const lon = (c / n) * Math.PI * 2;
        const trueU = 0.5 + lon / (2 * Math.PI);
        // membership decided on the CLEAN grid sample → continent shapes stay crisp
        const u = (trueU * MAPX) % 1;
        const vv = 0.5 + (0.5 - lat / Math.PI - 0.5) * MAPY;
        const onLand = vv >= 0 && vv <= 1 && isLand(u, vv);

        if (onLand) {
          if (Math.random() < 0.06) continue;            // light voids inside landmasses
          const v = jitter(new THREE.Vector3(Math.cos(lon) * rr, y, Math.sin(lon) * rr), jit);
          dir.push(v);
          const col = grad(trueU); cArr.push(col.r, col.g, col.b);
          // mostly tiny pinpricks, rare slightly-larger "hub" dots
          sArr.push(0.35 + Math.pow(Math.random(), 2.6) * 1.5);
          baseA.push(0.6 + Math.random() * 0.4);
        } else if (Math.random() < 0.012) {
          // sparse faint ocean scatter (atmospheric dots over water, like the reference)
          const v = jitter(new THREE.Vector3(Math.cos(lon) * rr, y, Math.sin(lon) * rr), jit * 2.2);
          dir.push(v);
          const col = grad(trueU); cArr.push(col.r, col.g, col.b);
          sArr.push(0.3 + Math.random() * 0.5);
          baseA.push(0.12 + Math.random() * 0.18);        // very faint
        }
      }
    }
    base = dir; COUNT = dir.length;
    const pos = new Float32Array(COUNT * 3);
    const alpha = new Float32Array(COUNT).fill(1);
    for (let i = 0; i < COUNT; i++) { pos[i*3]=dir[i].x*R; pos[i*3+1]=dir[i].y*R; pos[i*3+2]=dir[i].z*R; }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(new Float32Array(cArr), 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(new Float32Array(sArr), 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    dots = new THREE.Points(geo, dotMat);
    world.add(dots);
    // satellites (signal arcs + ring nodes) removed — globe only
  }

  // ---- colored signal arcs + ring nodes ----
  const SEG = 140, TAIL = 0.6, IPS = 6 * 6;   // longer lit tail, finer tube
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.strokeStyle = '#ffffff'; x.lineWidth = 5;
    x.beginPath(); x.arc(32, 32, 20, 0, Math.PI*2); x.stroke();
    return new THREE.CanvasTexture(c);
  })();
  function pick() { return base[(Math.random() * COUNT) | 0]; }
  function makeArc() {
    const o = { t: Math.random(), speed: 0.075 + Math.random() * 0.05 };   // slower cadence
    const setup = () => {
      let a = pick(), b = pick(), guard = 0;
      // favour very wide spans so the arc travels a long way across the globe (more curvature)
      while (a.distanceTo(b) < 2.4 && guard++ < 80) b = pick();
      o.a = a.clone().multiplyScalar(R); const bEnd = b.clone().multiplyScalar(R);
      // much bigger lift → arc bows high above the surface like the video
      const ctrl = o.a.clone().add(bEnd).multiplyScalar(0.5).setLength(R + R * (0.9 + Math.random() * 0.7));
      o.curve = new THREE.QuadraticBezierCurve3(o.a, ctrl, bEnd);
      o.color = colByLon(a.clone().add(b).multiplyScalar(0.5));
      const g = new THREE.TubeGeometry(o.curve, SEG, 0.011, 6, false);
      if (o.mesh) { o.mesh.geometry.dispose(); o.mesh.geometry = g; o.mesh.material.color = o.color; }
      else { o.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: o.color,
        transparent: true, opacity: 0.85, depthWrite: false })); world.add(o.mesh); }
      o.mesh.geometry.setDrawRange(0, 0);
      if (!o.node) { o.node = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex,
        transparent: true, depthWrite: false, opacity: 0 })); o.node.scale.setScalar(0.3); world.add(o.node); }
      o.node.material.color = o.color; o.node.position.copy(o.a);
      // destination ring node (where the trail lands & the label appears)
      if (!o.endNode) { o.endNode = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex,
        transparent: true, depthWrite: false, opacity: 0 })); o.endNode.scale.setScalar(0.3); world.add(o.endNode); }
      o.endNode.material.color = o.color; o.endNode.position.copy(bEnd);
      o.bEnd = bEnd.clone();
    };
    setup(); o.respawn = setup;
    return o;
  }

  // ---- load land mask, then build ----
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    const cw = 1024, ch = 512;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, cw, ch);
    const data = cx.getImageData(0, 0, cw, ch).data;
    const isLand = (u, v) => {            // earth-water.png: land = dark
      const px = Math.min(cw - 1, Math.max(0, (u * cw) | 0));
      const py = Math.min(ch - 1, Math.max(0, (v * ch) | 0));
      const idx = (py * cw + px) * 4;
      return (data[idx] + data[idx+1] + data[idx+2]) / 3 < 110;
    };
    build(isLand);
  };
  img.onerror = () => build(() => true);
  img.src = 'assets/earth-water.png';

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  const tmp = new THREE.Vector3();
  let last = performance.now(), frame = 0;
  (function animate() {
    requestAnimationFrame(animate);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (dots) {
      dots.rotation.y += 0.0013;
      if ((frame++ % 2) === 0) {
        const q = dots.quaternion, arr = geo.getAttribute('alpha').array;
        for (let i = 0; i < COUNT; i++) {
          tmp.copy(base[i]).applyQuaternion(q);
          const front = (tmp.z + 1) * 0.5;          // 0 back, 1 front
          const rim = 1 - Math.abs(tmp.z);          // 1 at the silhouette edge
          // bright high-contrast land dots; rim brighter, far side fades; × per-point base opacity
          arr[i] = baseA[i] * (0.7 + 0.3 * Math.pow(rim, 1.5)) * (0.45 + 0.55 * front);
        }
        geo.getAttribute('alpha').needsUpdate = true;
      }
      arcs.forEach(o => {
        o.t += o.speed * dt;
        if (o.t >= 1 + TAIL) { o.t = 0; o.respawn(); }
        const head = Math.min(1, o.t), tail = Math.max(0, o.t - TAIL);
        const start = Math.round(tail * SEG) * IPS;
        const count = Math.max(0, Math.round(head * SEG) * IPS - start);
        o.mesh.geometry.setDrawRange(start, count);
        const f = Math.sin(Math.min(1, o.t) * Math.PI);
        o.mesh.material.opacity = 0.8 * f;
        o.node.material.opacity = 0.95 * f * Math.max(0, 1 - o.t * 1.4);  // source fades as it leaves
        // destination node appears once the trail head arrives
        o.endNode.material.opacity = (o.t > 0.82) ? 0.95 * f : 0;
      });
    }
    renderer.render(scene, camera);
  })();
}
