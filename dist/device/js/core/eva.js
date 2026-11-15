// EVA along Curiosity's real route: per-sample margins, deployment timing, playback.
import { S, A, PH, bus } from './store.js';
import { link } from './util.js';
import * as scene from './scene.js';

export const evaWaypoints = () => S.route.filter((p) => p.sol >= S.ui.eva.sol0 && p.sol <= S.ui.eva.sol1);

export function buildEvaSamples() {
  const wps = evaWaypoints(), out = []; let dist = 0;
  for (let i = 0; i < wps.length; i++) {
    if (i === 0) { out.push({ x: wps[0].x, y: wps[0].y, d: 0, sol: wps[0].sol }); continue; }
    const a = wps[i - 1], b = wps[i], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / 20));
    for (let k = 1; k <= n; k++) { const t = k / n; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, d: dist + L * t, sol: b.sol }); }
    dist += L;
  }
  return out;
}

/** Nearest route sample (≤ 20 m apart) → { dist, d }; bucketed ring search, gives up beyond maxDist. */
export function routeLocator(samples) {
  const B = 100, grid = new Map(), key = (i, j) => i * 100003 + j;
  samples.forEach((s, k) => { const kk = key(Math.floor(s.x / B), Math.floor(s.y / B)); (grid.get(kk) || grid.set(kk, []).get(kk)).push(k); });
  const rMax = Math.ceil((S.W + S.H) / B) + 1;
  return (x, y, maxDist = Infinity) => {
    let best = Infinity, bk = -1;
    const ci = Math.floor(x / B), cj = Math.floor(y / B);
    const cell = (i, j) => { for (const k of grid.get(key(i, j)) || []) { const dd = Math.hypot(samples[k].x - x, samples[k].y - y); if (dd < best) { best = dd; bk = k; } } };
    for (let r = 0; r <= rMax && samples.length; r++) {
      if (r === 0) cell(ci, cj);
      else {
        for (let i = ci - r; i <= ci + r; i++) { cell(i, cj - r); cell(i, cj + r); }
        for (let j = cj - r + 1; j <= cj + r - 1; j++) { cell(ci - r, j); cell(ci + r, j); }
      }
      if (best <= r * B || r * B > maxDist) break;
    }
    return bk >= 0 && best <= maxDist ? { dist: best, d: samples[bk].d } : { dist: Infinity, d: NaN };
  };
}

export function computeEva() {
  const E = S.eva, net = S.net;
  E.samples = buildEvaSamples(); E.total = E.samples.at(-1)?.d || 0;
  if (E.idx >= E.samples.length) E.idx = 0;
  E.pos = E.samples[E.idx]?.d ?? 0;
  E.margins = new Float32Array(E.samples.length); E.via = new Int16Array(E.samples.length); E.lander = new Float32Array(E.samples.length);
  // walk-and-drop: relay i exists only from route distance deployD[i] on; widest path solved once per step
  const walk = S.ui.eva.deploy === 'walk' && E.samples.length >= 2, near = routeLocator(E.samples);
  E.walk = walk;
  E.deployD = net.infra.map((n) => (walk && n.type === 'relay' ? near(n.x, n.y).d : -Infinity));
  const steps = [...new Set(E.deployD.filter(Number.isFinite))].sort((a, b) => a - b);
  const stageBest = [];
  for (let s = 0; s <= steps.length; s++) {
    if (!walk || net.infra[0]?.type !== 'lander') { stageBest.push(net.best); continue; }
    const lim = s ? steps[s - 1] : -Infinity, on = (i) => E.deployD[i] <= lim;
    stageBest.push(PH.widestPath(net.infra.length, 0, (i, j) => (on(i) && on(j) ? net.mat[i][j] : -Infinity)).best);
  }
  const probe = { type: 'astro' };
  E.samples.forEach((s, k) => {
    probe.x = s.x; probe.y = s.y;
    let st = 0; while (st < steps.length && steps[st] <= s.d) st++;
    const nb = stageBest[st];
    let best = -Infinity, via = -1;
    net.infra.forEach((n, i) => {
      if (!(nb[i] >= 0)) return;
      const m = link(n, probe), v = Math.min(nb[i], m);
      if (i === 0) E.lander[k] = m;
      if (v > best) { best = v; via = i; }
    });
    if (!net.infra.length) E.lander[k] = NaN;
    E.margins[k] = best; E.via[k] = best >= 0 ? via : -1;
  });
  let okLen = 0, stableLen = 0, landerLen = 0, longest = 0, run = 0;
  for (let k = 1; k < E.samples.length; k++) {
    const dl = E.samples[k].d - E.samples[k - 1].d, m = E.margins[k];
    if (m >= 0) { okLen += dl; run = 0; } else { run += dl; longest = Math.max(longest, run); }
    if (m >= S.req) stableLen += dl;
    if (E.lander[k] >= 0) landerLen += dl;
  }
  const p = (v) => (E.total ? `${(100 * v / E.total).toFixed(1)}%` : '—');
  const pc = (v) => (E.total ? 100 * v / E.total : NaN);
  S.stats.eva = E.samples.length < 2 ? null : {
    km: E.total / 1000, okPct: pc(okLen), stablePct: pc(stableLen), landerPct: pc(landerLen), longestKm: longest / 1000,
    sol0: E.samples[0].sol, sol1: E.samples.at(-1).sol, walk,
  };
  S.out.eva = E.samples.length < 2 ? '선택한 sol 범위에 경로가 없습니다.' :
    `EVA 경로 <b>${(E.total / 1000).toFixed(2)} km</b> (sol ${E.samples[0].sol}–${E.samples.at(-1).sol})<br>` +
    `통신 유지: <b>${p(okLen)}</b> · 안정 ${p(stableLen)} · 착륙선 단독이면 ${p(landerLen)}<br>` +
    `최장 끊김 구간: <b class="${longest > 0 ? 'bad' : 'ok'}">${(longest / 1000).toFixed(2)} km</b>` +
    (walk ? `<br>설치 지점: ${net.infra.map((n, i) => [n, E.deployD[i]]).filter(([, d]) => Number.isFinite(d)).sort((a, b) => a[1] - b[1])
      .map(([n, d]) => `${n.name} ${(d / 1000).toFixed(2)} km`).join(' → ') || '중계기 없음'}` : '');
  if (!E.playing) scene.evaMarkerVisible(E.samples.length > 0 && S.selected === 'eva');
  if (S.now) S.now.key = '';        // force the set-down relays to be re-evaluated against the new deploy points
  A.computeNow?.();
  bus.emit('eva'); updateGhosts();
}

export function moveEva(idx, keepPos = false) {
  const E = S.eva, s = E.samples[idx]; if (!s) return;
  if (!keepPos) E.pos = s.d;
  E.idx = idx;
  const via = E.via[idx], node = S.net.infra[via >= 0 ? via : 0];
  scene.setEva(s, node, E.margins[idx], via < 0);
  A.computeNow?.();
  updateGhosts();
  A.coverageFollows?.();
  bus.emit('evaPos');
}
let lastProf = 0;
export function stepEva(dt) {
  const E = S.eva; if (!E.playing || E.samples.length < 2) return;
  E.pos = (E.pos ?? E.samples[E.idx].d) + S.ui.eva.speed * dt;
  let i = E.idx; while (i < E.samples.length - 1 && E.samples[i + 1].d <= E.pos) i++;
  if (i >= E.samples.length - 1) { E.playing = false; bus.emit('evaState'); }
  moveEva(i, true);
  const now = performance.now();
  if (now - lastProf > 120 || !E.playing) { lastProf = now; A.updateProfile(); }
}
export function togglePlay() {
  const E = S.eva; if (E.samples.length < 2) return;
  E.playing = !E.playing; S.selected = 'eva';
  if (E.playing && E.idx >= E.samples.length - 1) moveEva(0); else E.pos = E.samples[E.idx].d;
  bus.emit('evaState'); bus.emit('net'); A.updateProfile();
}
export function resetEva() { S.eva.idx = 0; S.selected = 'eva'; moveEva(0); bus.emit('net'); A.updateProfile(); }
export function seekEva(d) {
  const E = S.eva; let i = 0; while (i < E.samples.length - 1 && E.samples[i].d < d) i++;
  S.selected = 'eva'; moveEva(i); bus.emit('net'); A.updateProfile();
}
// while the EVA is shown in walk mode, relays not reached yet are translucent
export function updateGhosts() {
  const E = S.eva, net = S.net; if (!net) return;
  const show = E.walk && S.selected === 'eva' && E.samples?.length > 1;
  const d = show ? E.samples[E.idx]?.d ?? 0 : 0;
  net.infra.forEach((n, i) => scene.setGhost(n.id, show && E.deployD?.[i] > d));
}

bus.on('net', updateGhosts);
Object.assign(A, { evaWaypoints, buildEvaSamples, routeLocator, computeEva, moveEva, stepEva, togglePlay, resetEva, seekEva });
