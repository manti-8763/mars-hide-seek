// Nodes, relay network (widest path from the lander), selected link profile and radio settings.
import { S, A, PH, bus } from './store.js';
import { hOf, link, fmt } from './util.js';
import * as scene from './scene.js';

// ---------------------------------------------------------------- nodes
export function addNode(type, x, y) {
  if (!PH.inside(S.T, x, y)) return;
  if (type === 'lander') {
    const L = S.nodes.find((n) => n.type === 'lander');
    if (L) { L.x = x; L.y = y; scene.placeMarker(L); recompute(); return; }
  }
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const name = type === 'lander' ? '착륙선' : type === 'relay' ? `R${S.nextId.relay++}` : `A${S.nextId.astro++}`;
  const n = { id, type, x, y, name };
  if (type === 'lander') S.nodes.unshift(n); else S.nodes.push(n);
  scene.placeMarker(n);
  if (type !== 'lander') S.selected = id;
  recompute();
}
export function addNodeSilent(type, x, y) {
  const n = { id: `${type}-${Math.random().toString(36).slice(2, 9)}`, type, x, y, name: type === 'relay' ? `R${S.nextId.relay++}` : `A${S.nextId.astro++}` };
  S.nodes.push(n); scene.placeMarker(n);
  return n;
}
export function removeNode(id) {
  const n = S.nodes.find((k) => k.id === id); if (!n || n.type === 'lander') return;
  S.nodes = S.nodes.filter((k) => k.id !== id);
  scene.removeMarker(id);
  if (S.selected === id) S.selected = null;
  recompute();
}
/** Remove relays (except the ids in `keep`); numbering continues after the kept ones. */
export function clearRelays(keep = new Set()) {
  for (const n of S.nodes.filter((k) => k.type === 'relay' && !keep.has(k.id))) scene.removeMarker(n.id);
  S.nodes = S.nodes.filter((k) => k.type !== 'relay' || keep.has(k.id));
  S.nextId.relay = 1 + Math.max(0, ...S.nodes.filter((k) => k.type === 'relay').map((k) => +k.name.slice(1) || 0));
}
export function select(id) { S.selected = id; bus.emit('net'); updateProfile(); }

// ---------------------------------------------------------------- network
export function recompute({ coverage = true } = {}) {
  S.R = PH.resolveRadio(S.radio);
  const infra = [...S.nodes.filter((n) => n.type === 'lander'), ...S.nodes.filter((n) => n.type === 'relay')];
  const hasLander = infra.length && infra[0].type === 'lander';
  const mat = infra.map(() => new Float64Array(infra.length));
  for (let i = 0; i < infra.length; i++) for (let j = i + 1; j < infra.length; j++) mat[i][j] = mat[j][i] = link(infra[i], infra[j]);
  const wp = hasLander ? PH.widestPath(infra.length, 0, (i, j) => mat[i][j]) : { best: new Float64Array(infra.length).fill(-Infinity), prev: new Int32Array(infra.length).fill(-1) };
  const astro = new Map();
  for (const a of S.nodes.filter((n) => n.type === 'astro')) {
    let best = -Infinity, via = -1, direct = -Infinity;
    infra.forEach((n, i) => {
      if (!(wp.best[i] >= 0)) return;
      const m = link(n, a), v = Math.min(wp.best[i], m);
      if (i === 0) direct = m;
      if (v > best) { best = v; via = i; }
    });
    if (via >= 0 && best < 0) via = -1;
    astro.set(a.id, { m: via >= 0 ? best : direct, via, direct });
  }
  S.net = { infra, mat, best: wp.best, prev: wp.prev, astro };
  bus.emit('net');
  A.computeEva();
  computeNow();
  updateProfile();
  if (coverage && S.ui.covAuto) A.scheduleCoverage();
  else if (S.cov) { S.cov.stale = true; A.covStats(); }
  if (S.preview) A.schedulePreview(true);
}

/** Relays already set down at the current EVA position (walk-and-drop), and the network they form.
 *  Emits 'now' and refreshes a 'now' reach map whenever that set changes. */
export function computeNow() {
  const net = S.net, E = S.eva; if (!net) return;
  const d = E.samples[E.idx]?.d ?? 0;
  const on = net.infra.map((n, i) => i === 0 || !E.walk || !(E.deployD[i] > d));
  const key = on.map((v) => (v ? 1 : 0)).join('');
  if (S.now && S.now.key === key) return;
  const wp = net.infra[0]?.type === 'lander' ? PH.widestPath(net.infra.length, 0, (i, j) => (on[i] && on[j] ? net.mat[i][j] : -Infinity)) : net;
  S.now = { on, best: wp.best, prev: wp.prev, key, count: on.filter(Boolean).length - 1 };
  bus.emit('now');
  if (S.ui.covNet === 'now' && S.ui.covAuto && S.cov) A.scheduleCoverage();   // debounced, merges with recompute's
}
/** Set a relay down at the astronaut's current position. */
export function addRelayHere() {
  const s = S.eva.samples[S.eva.idx]; if (!s) return null;
  const n = addNodeSilent('relay', s.x, s.y);
  recompute();
  bus.emit('plan');
  return n;
}

/** Text for a node row: [margin or null, description]. */
export function nodeStatus(n) {
  const net = S.net;
  if (n.type === 'lander') return [null, '루트'];
  if (n.type === 'relay') {
    const i = net.infra.indexOf(n), m = net.best[i];
    return [m, m >= 0 ? `${net.prev[i] === 0 ? '착륙선에 직결' : `${net.infra[net.prev[i]].name}에 연결`} · ${fmt(m)} dB` : '고립 (착륙선과 연결 안 됨)'];
  }
  const a = net.astro.get(n.id);
  return [a.m, a.via >= 0 ? (a.via === 0 ? `착륙선에 직결 · ${fmt(a.m)} dB` : `${net.infra[a.via].name} 경유 · ${fmt(a.m)} dB`) : `끊김 · 착륙선 직결 ${fmt(a.direct)} dB`];
}

// ---------------------------------------------------------------- selected link → profile + Fresnel ellipsoid
function selectedPair() {
  const net = S.net; if (!net) return null;
  if (S.eva.playing || (S.eva.samples.length && S.selected === 'eva')) {
    const s = S.eva.samples[S.eva.idx]; const via = S.eva.via?.[S.eva.idx] ?? -1;
    const node = via >= 0 ? net.infra[via] : net.infra[0];
    if (!node || !s) return null;
    return [node, { x: s.x, y: s.y, type: 'astro', name: 'EVA' }, via < 0 ? '연결 끊김: 착륙선 직결 경로' : ''];
  }
  const n = S.nodes.find((k) => k.id === S.selected); if (!n) return null;
  if (n.type === 'astro') { const a = net.astro.get(n.id); const via = a.via >= 0 ? a.via : 0; return net.infra[via] ? [net.infra[via], n, a.via < 0 ? '연결 끊김: 착륙선 직결 경로' : ''] : null; }
  if (n.type === 'relay') { const i = net.infra.indexOf(n); const p = net.prev[i] >= 0 ? net.prev[i] : 0; return p !== i ? [net.infra[p], n, net.prev[i] < 0 ? '고립: 착륙선 직결 경로' : ''] : null; }
  return null;
}
export function updateProfile() {
  const pair = selectedPair();
  if (!pair) { S.profile = null; scene.setFresnel(null); bus.emit('profile'); return; }
  const [a, b, note] = pair;
  S.profile = PH.linkProfile(S.T, S.R, a.x, a.y, hOf(a), b.x, b.y, hOf(b), S.T.res);
  S.profile.names = [a.name, b.name]; S.profile.note = note;
  scene.setFresnel(a, b);
  bus.emit('profile');
}

// ---------------------------------------------------------------- radio
export function setPreset(key) { S.presetKey = key; S.radio = { ...PH.PRESETS[key] }; radioChanged(); }
export function setRadioParam(k, v) { S.radio[k] = v; radioChanged(); }
export function radioChanged(re = true) {
  S.R = PH.resolveRadio(S.radio);
  const R = S.R;
  if (R.kind === 'rf') {
    const fsRange = (d) => R.base - PH.fspl(d, R.lam) - R.req;
    let lo = 1, hi = 1e7; for (let k = 0; k < 60; k++) { const m = Math.sqrt(lo * hi); if (fsRange(m) > 0) lo = m; else hi = m; }
    S.stats.radio = { lamCm: R.lam * 100, freeSpaceKm: lo > 1e6 ? Infinity : lo / 1000, reqDbm: R.req };
    S.out.radio = `파장 λ = <b>${(R.lam * 100).toFixed(1)} cm</b> · 잡음 ${fmt(R.noise)} dBm · 요구 수신 ${fmt(R.req)} dBm<br>` +
      `지형이 없다면(자유공간) 최대 <b>${lo > 1e6 ? '>1000' : (lo / 1000).toFixed(1)} km</b> — 실제 한계는 지형 회절과 가시선`;
  } else {
    S.stats.radio = { lamCm: R.lam * 100, freeSpaceKm: NaN, reqDbm: R.req };
    S.out.radio = `λ =${(R.lam * 1e9).toFixed(0)} nm · 먼지 τ(λ) = ${R.tauLam.toFixed(2)} · 소산계수 β = ${(R.beta * 1000).toFixed(3)} /km ` +
      `→ 1 km당 ${(4.343 * R.beta * 1000).toFixed(2)} dB<br>광통신은 회절이 거의 없어 가시선이 조금만 막혀도 끊깁니다.`;
  }
  bus.emit('radio');
  if (re) recompute();
}

// ---------------------------------------------------------------- default scenario
export function defaultScenario() {
  // lander at the start of Curiosity's climb into lower Mount Sharp; the EVA follows the route from there
  const sols = S.route.map((p) => p.sol);
  const s0 = sols.find((s) => s >= 2690) ?? sols[0], s1 = sols.find((s) => s >= 4290) ?? sols.at(-1);
  S.ui.eva.sol0 = s0; S.ui.eva.sol1 = s1;
  const start = S.route.find((p) => p.sol >= s0);
  S.nodes.push({ id: 'lander', type: 'lander', x: start.x, y: start.y, name: '착륙선' });
  S.nodes.forEach(scene.placeMarker);
  S.selected = 'eva';
}

Object.assign(A, { computeNow, addRelayHere, addNode, addNodeSilent, removeNode, clearRelays, select, recompute, updateProfile, setPreset, setRadioParam, radioChanged });
