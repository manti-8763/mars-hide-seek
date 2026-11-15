// three.js scene, one per page. Two camera modes:
//  · overview (tablet, base): orbit camera over the whole terrain
//  · first person (helmet display): eye height above the astronaut, looking along the route; drag to look around
// The terrain texture carries the overlay chosen in S.ui.display.overlay ('none' | 'reach' | 'relay').
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { S, A, PH, bus } from './store.js';
import { COL, colorOf, statusOf, hOf, ground, link, lonlat } from './util.js';
import { previewGain } from './coverage.js';

let renderer, scene, camera, controls, exGroup, flatGroup, linkGroup, terrainMesh, fresnelMesh, evaMarker, evaLine = null;
let texCanvas, texCtx, baseCanvas, texture, host = null, labelsEl = null, baseMode = null;
const markers = new Map(), labelEls = new Map();
const size = { w: 1, h: 1 };
let fp = null;                 // first-person state {yaw, pitch, look: {yaw, pitch}, heading}
let labelFn = null;            // optional (node) → {text, cls} for the label layer
let pois = [];                 // extra labelled points [{id, x, y, text, cls}]
const poiEls = new Map();

const toWorld = (x, y, z) => new THREE.Vector3(x - S.W / 2, (z - S.zRef) * S.ui.display.exag, y - S.H / 2);
const toTrue = (x, y, z) => new THREE.Vector3(x - S.W / 2, z - S.zRef, y - S.H / 2); // inside the exaggerated group
const antennaTrue = (n, hh) => toTrue(n.x, n.y, ground(n.x, n.y) + (hh ?? hOf(n)));

// ---------------------------------------------------------------- build
export function build(img, opts = {}) {
  renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: !!opts.firstPerson });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.className = 'three';
  scene = new THREE.Scene(); scene.background = new THREE.Color('#1b1310');
  camera = new THREE.PerspectiveCamera(45, 1, 10, 200000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495;
  if (opts.firstPerson) {
    fp = { yaw: 0, look: { yaw: 0, pitch: -0.12 }, heading: null };
    controls.enabled = false; camera.near = 0.5; camera.far = 60000; camera.fov = 60; camera.updateProjectionMatrix();
    scene.background = new THREE.Color('#c79b78'); scene.fog = new THREE.Fog('#c79b78', 4000, 30000);   // dusty butterscotch sky
    S.ui.display.exag = 1; S.ui.display.markerScale = 0.05;  // true scale: a 3 m mast, not a map pin
  }
  scene.add(new THREE.HemisphereLight('#ffe6d0', '#3a2418', 0.9));
  const sun = new THREE.DirectionalLight('#fff3e6', 1.6); sun.position.set(-1, 0.8, -0.6); scene.add(sun);
  exGroup = new THREE.Group(); flatGroup = new THREE.Group(); linkGroup = new THREE.Group();
  exGroup.add(linkGroup); scene.add(exGroup, flatGroup);

  // terrain mesh: 16 m vertices, only fully valid quads
  const T = S.T, st = 2, gw = Math.floor((T.w - 1) / st) + 1, gh = Math.floor((T.h - 1) / st) + 1;
  const pos = new Float32Array(gw * gh * 3), uv = new Float32Array(gw * gh * 2), ok = new Uint8Array(gw * gh);
  for (let i = 0; i < gh; i++) for (let j = 0; j < gw; j++) {
    const px = j * st, py = i * st, z = T.z[py * T.w + px], k = i * gw + j;
    ok[k] = z === z ? 1 : 0;
    pos[k * 3] = (px + 0.5) * T.res - S.W / 2; pos[k * 3 + 1] = ok[k] ? z - S.zRef : 0; pos[k * 3 + 2] = (py + 0.5) * T.res - S.H / 2;
    uv[k * 2] = (px + 0.5) / T.w; uv[k * 2 + 1] = 1 - (py + 0.5) / T.h;
  }
  const idx = [];
  for (let i = 0; i < gh - 1; i++) for (let j = 0; j < gw - 1; j++) {
    const a = i * gw + j, b = a + 1, c = a + gw, d = c + 1;
    if (ok[a] && ok[b] && ok[c] && ok[d]) idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeVertexNormals();

  baseCanvas = document.createElement('canvas'); baseCanvas.width = img.width; baseCanvas.height = img.height;
  baseCanvas.getContext('2d').drawImage(img, 0, 0);
  S.orthoGray = baseCanvas.getContext('2d').getImageData(0, 0, img.width, img.height);
  texCanvas = document.createElement('canvas'); texCanvas.width = img.width; texCanvas.height = img.height;
  texCtx = texCanvas.getContext('2d');
  texture = new THREE.CanvasTexture(texCanvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: texture }));
  exGroup.add(terrainMesh);

  fresnelMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24),
    new THREE.MeshBasicMaterial({ color: '#7cc4ff', transparent: true, opacity: 0.18, depthWrite: false }));
  fresnelMesh.visible = false; exGroup.add(fresnelMesh);
  evaMarker = makeMarker('eva'); evaMarker.visible = false; flatGroup.add(evaMarker);

  setExag(S.ui.display.exag);
  const c = S.route.length ? S.route[Math.floor(S.route.length / 2)] : { x: S.W / 2, y: S.H / 2 };
  const tgt = toWorld(c.x, c.y, ground(c.x, c.y));
  controls.target.copy(tgt); camera.position.set(tgt.x + 1500, tgt.y + 7000, tgt.z + 6500);

  setupInput();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.1, clock.getDelta());
    A.stepEva?.(dt);
    if (fp) updateFirstPerson(dt); else controls.update();
    if (follow) followStep();
    if (host) { renderer.render(scene, camera); updateLabels(); }
  });
  bus.on('net', () => { drawLinks(); updateLabels(true); });
  bus.on('cov', composeTexture);
  bus.on('eva', composeTexture);
  bus.on('preview', () => { if (S.ui.display.overlay === 'relay') composeTexture(); });
}

/** Put the canvas + label layer into `el` (the viewport widget). Can be called again after a remount;
 *  the widget calls resize() whenever its box changes. */
export function attach(el) {
  host = el;
  el.appendChild(renderer.domElement);
  labelsEl ??= Object.assign(document.createElement('div'), { className: 'labels' });
  el.appendChild(labelsEl);
  resize();
}
export function resize() {
  if (!host) return;
  size.w = Math.max(1, host.clientWidth); size.h = Math.max(1, host.clientHeight);
  renderer.setSize(size.w, size.h, false);
  camera.aspect = size.w / size.h; camera.updateProjectionMatrix();
  linkGroup.children.forEach((l) => l.material.resolution?.set(size.w, size.h));
}

// ---------------------------------------------------------------- markers & labels
function makeMarker(type) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 });
  if (type === 'lander') {
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(30, 45, 25, 6), mat('#d6b25e')); legs.position.y = 12;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(22, 28, 35, 12), mat('#f0d48a')); body.position.y = 42;
    const dish = new THREE.Mesh(new THREE.ConeGeometry(16, 10, 16, 1, true), mat('#ffffff')); dish.position.y = 66; dish.rotation.x = Math.PI;
    g.add(legs, body, dish);
  } else if (type === 'relay') {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 70, 8), mat('#9fd8ff')); mast.position.y = 35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12), mat('#4fb3ff')); head.position.y = 74;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(16, 18, 6, 3), mat('#5d7a90')); base.position.y = 3;
    g.add(mast, head, base);
  } else {
    const c = type === 'eva' ? '#ffa94d' : '#ffffff';
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(11, 26, 4, 12), mat(c)); body.position.y = 24;
    const head = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), mat('#ffd9a8')); head.position.y = 52;
    g.add(body, head);
  }
  return g;
}
export function placeMarker(n) {
  let m = markers.get(n.id);
  if (!m) { m = makeMarker(n.type); markers.set(n.id, m); flatGroup.add(m); }
  m.position.copy(toWorld(n.x, n.y, ground(n.x, n.y)));
  m.scale.setScalar(S.ui.display.markerScale);
}
export function removeMarker(id) {
  const m = markers.get(id); if (m) { flatGroup.remove(m); markers.delete(id); }
  labelEls.get(id)?.remove(); labelEls.delete(id);
}
export function setLabelFn(fn) { labelFn = fn; updateLabels(true); }
export function setPois(list) {
  pois = list;
  for (const [id, el] of poiEls) if (!list.some((p) => p.id === id)) { el.remove(); poiEls.delete(id); }
  updateLabels(true);
}
const _v = new THREE.Vector3();
function placeLabel(el, pos, lift) {
  _v.copy(pos); _v.y += lift; _v.project(camera);
  const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
  el.style.display = vis ? '' : 'none';
  if (vis) { el.style.left = `${(_v.x + 1) / 2 * size.w}px`; el.style.top = `${(1 - _v.y) / 2 * size.h}px`; }
}
let labelT = 0;
export function updateLabels(rebuild = false) {
  if (!labelsEl) return;
  const now = performance.now(), text = rebuild || now - labelT > 250;   // label text at 4 Hz, positions every frame
  if (text) labelT = now;
  for (const n of S.nodes) {
    let el = labelEls.get(n.id);
    if (!el) { el = document.createElement('div'); el.className = 'lbl'; labelsEl.appendChild(el); labelEls.set(n.id, el); rebuild = true; }
    if (labelFn) { if (text || rebuild) { const L = labelFn(n); el.className = `lbl ${L.cls || ''}`; el.innerHTML = L.text; } }
    else if (rebuild && S.net) {
      let st = '';
      if (n.type === 'relay') st = statusOf(S.net.best[S.net.infra.indexOf(n)]);
      if (n.type === 'astro') st = statusOf(S.net.astro.get(n.id)?.m);
      el.className = 'lbl ' + st; el.textContent = n.name;
    }
    const mk = markers.get(n.id); if (!mk) continue;
    placeLabel(el, mk.position, fp ? hOf(n) + 1 : 80 * S.ui.display.markerScale);
  }
  for (const p of pois) {
    let el = poiEls.get(p.id);
    if (!el) { el = document.createElement('div'); labelsEl.appendChild(el); poiEls.set(p.id, el); }
    if (text || rebuild) { const t = typeof p.text === 'function' ? p.text() : p.text; el.className = `lbl poi ${p.cls || ''}`; el.innerHTML = t; }
    placeLabel(el, toWorld(p.x, p.y, ground(p.x, p.y)), fp ? 3 : 40);
  }
}
export function setGhost(id, ghost) {          // translucent marker (relay not yet deployed during the EVA)
  const m = markers.get(id); if (!m || m.userData.ghost === ghost) return;
  m.userData.ghost = ghost;
  m.traverse((o) => { if (o.material) { o.material.transparent = ghost; o.material.opacity = ghost ? 0.25 : 1; o.material.needsUpdate = true; } });
  const lb = labelEls.get(id); if (lb) lb.style.opacity = ghost ? 0.35 : '';
}
export function setExag(e) {
  S.ui.display.exag = e; exGroup.scale.y = e;
  for (const n of S.nodes) placeMarker(n);
  if (S.eva.samples.length && evaMarker.visible) A.moveEva?.(S.eva.idx, true);
}
export function setMarkerScale(s) {
  S.ui.display.markerScale = s;
  for (const n of S.nodes) placeMarker(n);
  evaMarker.scale.setScalar(s);
}

// ---------------------------------------------------------------- links, Fresnel, EVA marker
function lineObj(pts, color, width = 3, dashed = false) {
  const g = new LineGeometry(); g.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
  const m = new LineMaterial({ color, linewidth: width, dashed, dashSize: 60, gapSize: 40, worldUnits: false, transparent: true, opacity: 0.95 });
  m.resolution.set(size.w, size.h);
  const l = new Line2(g, m); if (dashed) l.computeLineDistances();
  return l;
}
export function drawLinks() {
  linkGroup.children.filter((c) => c !== evaLine).forEach((c) => { c.geometry.dispose(); c.material.dispose(); linkGroup.remove(c); });
  const net = S.net; if (!net || fp) return;
  net.infra.forEach((n, i) => {
    const p = net.prev[i]; if (p < 0) return;
    linkGroup.add(lineObj([antennaTrue(net.infra[p]), antennaTrue(n)], colorOf(net.mat[p][i]), 4));
  });
  for (const n of S.nodes.filter((k) => k.type === 'astro')) {
    const a = net.astro.get(n.id);
    if (a.via < 0) { const L = net.infra[0]; if (L) linkGroup.add(lineObj([antennaTrue(L), antennaTrue(n)], COL.bad, 2, true)); continue; }
    linkGroup.add(lineObj([antennaTrue(net.infra[a.via]), antennaTrue(n)], colorOf(a.m), 3));
  }
}
/** Fresnel ellipsoid between nodes a and b (foci at the antennas), or hide it. */
export function setFresnel(a, b) {
  if (!a || !b || !S.ui.display.showFresnel) { fresnelMesh.visible = false; return; }
  const P = antennaTrue(a), Q = antennaTrue(b), D = P.distanceTo(Q), rmax = 0.5 * Math.sqrt(S.R.lam * D);
  fresnelMesh.position.copy(P).add(Q).multiplyScalar(0.5);
  fresnelMesh.scale.set(D / 2, rmax, rmax);
  fresnelMesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), Q.clone().sub(P).normalize());
  fresnelMesh.visible = rmax > 0.5;
}
/** EVA astronaut marker at sample s with its live link from `node` (null hides). */
export function setEva(s, node, margin, broken) {
  if (evaLine) { linkGroup.remove(evaLine); evaLine.geometry.dispose(); evaLine.material.dispose(); evaLine = null; }
  if (!s || fp) { evaMarker.visible = false; return; }
  evaMarker.visible = true; evaMarker.position.copy(toWorld(s.x, s.y, ground(s.x, s.y))); evaMarker.scale.setScalar(S.ui.display.markerScale);
  if (node) { evaLine = lineObj([antennaTrue(node), toTrue(s.x, s.y, ground(s.x, s.y) + S.h.astro)], colorOf(margin), 4, broken); linkGroup.add(evaLine); }
}
export const evaMarkerVisible = (v) => { evaMarker.visible = v && !fp; };

// ---------------------------------------------------------------- cameras
// mesh height (16 m vertices) — the eye must stay above the drawn surface, not just the 8 m DEM
function meshZ(x, y) {
  const T = S.T, gx = (x / T.res - 0.5) / 2, gy = (y / T.res - 0.5) / 2, j = Math.floor(gx), i = Math.floor(gy), fx = gx - j, fy = gy - i;
  const z = (ii, jj) => T.z[Math.min(T.h - 1, Math.max(0, ii * 2)) * T.w + Math.min(T.w - 1, Math.max(0, jj * 2))];
  const v = (1 - fy) * ((1 - fx) * z(i, j) + fx * z(i, j + 1)) + fy * ((1 - fx) * z(i + 1, j) + fx * z(i + 1, j + 1));
  return v === v ? v : ground(x, y);
}
/** Walking direction at the current EVA sample (looks ~60 m ahead along the route). */
export function routeHeading() {
  const E = S.eva, s = E.samples[E.idx]; if (!s) return 0;
  let k = E.idx; while (k < E.samples.length - 1 && E.samples[k].d - s.d < 60) k++;
  const a = E.samples[k];
  if (a === s) { let j = E.idx; while (j > 0 && s.d - E.samples[j].d < 60) j--; const b = E.samples[j]; return Math.atan2(s.y - b.y, s.x - b.x); }
  return Math.atan2(a.y - s.y, a.x - s.x);
}
function updateFirstPerson(dt) {
  const s = S.eva.samples[S.eva.idx] || S.nodes[0]; if (!s) return;
  const target = routeHeading();
  if (fp.heading === null) fp.heading = target;
  const dh = Math.atan2(Math.sin(target - fp.heading), Math.cos(target - fp.heading));
  fp.heading += dh * Math.min(1, dt * 2.5);                       // turn smoothly with the route
  const eye = Math.max(meshZ(s.x, s.y), ground(s.x, s.y)) + S.h.astro + 0.2;
  camera.position.set(s.x - S.W / 2, eye - S.zRef, s.y - S.H / 2);
  const yaw = fp.heading + fp.look.yaw, pitch = fp.look.pitch;
  camera.lookAt(camera.position.x + Math.cos(yaw) * Math.cos(pitch), camera.position.y + Math.sin(pitch), camera.position.z + Math.sin(yaw) * Math.cos(pitch));
}
export const isFirstPerson = () => !!fp;
export function resetLook() { if (fp) { fp.look.yaw = 0; fp.look.pitch = -0.12; } }
/** Bearing (rad, map frame) of the current view direction — for the compass. */
export const viewYaw = () => (fp ? fp.heading + fp.look.yaw : Math.atan2(controls.target.z - camera.position.z, controls.target.x - camera.position.x));

// overview: smooth move of the orbit target (and optionally a closer camera)
let follow = null;
export function focus(x, y, dist = null) {
  const t = toWorld(x, y, ground(x, y));
  const off = camera.position.clone().sub(controls.target);
  if (dist) off.setLength(dist);
  follow = { t, off, k: 0 };
}
export function focusAll() {
  const c = S.route.length ? S.route[Math.floor(S.route.length / 2)] : { x: S.W / 2, y: S.H / 2 };
  const t = toWorld(c.x, c.y, ground(c.x, c.y));
  follow = { t, off: new THREE.Vector3(1500, 7000, 6500), k: 0 };
}
function followStep() {
  follow.k = Math.min(1, follow.k + 0.08);
  controls.target.lerp(follow.t, follow.k);
  camera.position.lerp(follow.t.clone().add(follow.off), follow.k);
  if (follow.k >= 1) follow = null;
}

// ---------------------------------------------------------------- texture
export function composeTexture() {
  if (!texCtx) return;
  const W = texCanvas.width, H = texCanvas.height, ctx = texCtx, D = S.ui.display;
  if (D.texMode !== baseMode) { buildBase(); baseMode = D.texMode; }
  ctx.globalAlpha = 1; ctx.drawImage(baseCanvas, 0, 0);
  const grid = (g, colorAt) => {        // draw a cell grid (with its window offset) onto the texture
    if (!g || !g.cw || !g.ch) return;
    const oc = document.createElement('canvas'); oc.width = g.cw; oc.height = g.ch;
    const octx = oc.getContext('2d'), im = octx.createImageData(g.cw, g.ch);
    for (let k = 0; k < g.cw * g.ch; k++) { const c = colorAt(k); if (c) im.data.set(c, k * 4); }
    octx.putImageData(im, 0, 0);
    const sx = W / S.T.w * g.stride, sy = H / S.T.h * g.stride;
    ctx.imageSmoothingEnabled = !!D.smooth; ctx.globalAlpha = S.ui.covAlpha;
    ctx.drawImage(oc, g.c0 * sx, g.r0 * sy, g.cw * sx, g.ch * sy);
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true;
  };
  if (D.overlay === 'reach' && S.cov && S.ui.covAlpha > 0) {
    const rgb = { ok: [63, 191, 106], warn: [233, 185, 73], bad: [229, 72, 77] };
    grid(S.cov, (k) => { const m = S.cov.comb[k]; return m === m ? [...rgb[statusOf(m)], m < 0 ? (D.badAlpha ?? 150) : 255] : null; });
  }
  if (D.overlay === 'relay' && S.preview && S.ui.covAlpha > 0) {
    grid(S.preview, (k) => { const g = previewGain(k); return g === 2 ? [70, 215, 255, 255] : g === 1 ? [70, 215, 255, 120] : null; });
  }
  const k = W / S.W;
  const path = (pts, style, lw) => { if (pts.length < 2) return; ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k))); ctx.stroke(); };
  if (!fp) path(S.route, 'rgba(255,170,90,.45)', 3);
  const wps = A.evaWaypoints?.() || [];
  if (D.showCorridor && S.ui.opt.site === 'corridor') {   // a stroke of width 2w around the route = points within w of it
    ctx.lineCap = 'round'; path(wps, 'rgba(110,190,255,.22)', Math.max(2, 2 * Math.max(0, S.ui.opt.corridor) * k)); ctx.lineCap = 'butt';
  }
  path(wps, fp ? 'rgba(255,190,120,.75)' : 'rgba(255,140,40,1)', D.routeWidth);
  texture.needsUpdate = true;
}
function buildBase() {
  const W = baseCanvas.width, H = baseCanvas.height, ctx = baseCanvas.getContext('2d');
  const src = S.orthoGray.data, im = ctx.createImageData(W, H), d = im.data;
  if (S.ui.display.texMode === 'ortho') {
    for (let i = 0; i < W * H; i++) { const g = src[i * 4]; d[i * 4] = Math.min(255, g * 1.05 + 18); d[i * 4 + 1] = g * 0.78 + 8; d[i * 4 + 2] = g * 0.58; d[i * 4 + 3] = 255; }
  } else {
    const T = S.T, zr = S.meta.z_max - S.meta.z_min, sx = T.w / W, sy = T.h / H;
    const ramp = [[0, [40, 60, 120]], [0.25, [60, 140, 160]], [0.5, [120, 170, 90]], [0.75, [210, 170, 90]], [1, [245, 240, 230]]];
    const col = (t) => { for (let r = 1; r < ramp.length; r++) if (t <= ramp[r][0]) { const [t0, a] = ramp[r - 1], [t1, b] = ramp[r], u = (t - t0) / (t1 - t0); return a.map((v, q) => v + (b[q] - v) * u); } return ramp[4][1]; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = Math.min(T.h - 2, Math.floor(y * sy)), j = Math.min(T.w - 2, Math.floor(x * sx)), z = T.z[i * T.w + j], o = (y * W + x) * 4;
      if (!(z === z)) { d[o + 3] = 255; continue; }
      const dzdx = (T.z[i * T.w + j + 1] - z) / T.res, dzdy = (T.z[(i + 1) * T.w + j] - z) / T.res;
      const shade = Number.isFinite(dzdx + dzdy) ? Math.max(0.25, Math.min(1.2, 0.85 - 0.9 * dzdx + 0.9 * dzdy)) : 0.85;
      const c = col((z - S.meta.z_min) / zr);
      d[o] = c[0] * shade; d[o + 1] = c[1] * shade; d[o + 2] = c[2] * shade; d[o + 3] = 255;
    }
  }
  ctx.putImageData(im, 0, 0);
}

// ---------------------------------------------------------------- picking & input
const raycaster = new THREE.Raycaster();
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction, p = new THREE.Vector3();
  const above = (t) => { p.copy(d).multiplyScalar(t).add(o); const x = p.x + S.W / 2, y = p.z + S.H / 2; const g = ground(x, y); if (!(g === g) || x < 0 || y < 0 || x > S.W || y > S.H) return null; return p.y - (g - S.zRef) * S.ui.display.exag; };
  let prev = 0, step = 12;
  for (let t = 0; t < 120000; t += step) {
    const a = above(t);
    if (a !== null && a < 0) {
      let lo = prev, hi = t;
      for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; const v = above(m); if (v !== null && v < 0) hi = m; else lo = m; }
      p.copy(d).multiplyScalar(hi).add(o);
      return { x: p.x + S.W / 2, y: p.z + S.H / 2 };
    }
    prev = t; step = Math.max(6, t * 0.002);
  }
  return null;
}
function setupInput() {
  const cv = renderer.domElement; let down = null;
  cv.addEventListener('pointerdown', (e) => {
    down = [e.clientX, e.clientY];
    if (fp) { try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic events */ } fp.drag = [e.clientX, e.clientY]; }
  });
  cv.addEventListener('pointermove', (e) => {
    if (fp && fp.drag) {        // look around (stands in for turning the head)
      fp.look.yaw += (e.clientX - fp.drag[0]) * 0.004; fp.look.pitch = Math.max(-1.2, Math.min(0.8, fp.look.pitch - (e.clientY - fp.drag[1]) * 0.004));
      fp.drag = [e.clientX, e.clientY];
    }
  });
  cv.addEventListener('pointerup', (e) => {
    if (fp) { fp.drag = null; return; }
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || e.button !== 0 || S.mode === 'view') return;
    const hit = pick(e); if (!hit) return;
    if (S.mode === 'delete') {
      let best = null, bd = Infinity;
      for (const n of S.nodes) { const dd = Math.hypot(n.x - hit.x, n.y - hit.y); if (dd < bd && n.type !== 'lander') { bd = dd; best = n; } }
      if (best && bd < 400 * S.ui.display.markerScale) A.removeNode(best.id);
      return;
    }
    A.addNode(S.mode, hit.x, hit.y);
  });
  cv.addEventListener('dblclick', () => resetLook());
  let hoverT = 0;
  cv.addEventListener('pointermove', (e) => {
    if (fp) return;
    const now = performance.now(); if (now - hoverT < 60) return; hoverT = now;
    const hit = pick(e); if (!hit) { bus.emit('hover', null); return; }
    const z = ground(hit.x, hit.y), [lon, lat] = lonlat(hit.x, hit.y);
    const L = S.nodes.find((n) => n.type === 'lander');
    const m = L ? link(L, { x: hit.x, y: hit.y, type: 'astro' }) : NaN;
    bus.emit('hover', { x: hit.x, y: hit.y, z, lon, lat, m });
  });
}
