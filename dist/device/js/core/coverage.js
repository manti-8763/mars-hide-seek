// Reach maps on a cell grid.
//  · reach  (S.cov):     for every cell, can an astronaut standing there reach the lander through the network?
//  · preview (S.preview): what a relay set down at the astronaut's current spot would add.
// Either can cover the whole map or a window around the astronaut (S.ui.covWin, the helmet display uses this).
import { S, A, bus } from './store.js';
import { hOf, busy, link } from './util.js';
import { pool } from './data.js';

let timer = 0, seq = 0, pseq = 0;
export function scheduleCoverage() { clearTimeout(timer); timer = setTimeout(runCoverage, 250); }

/** Window in cell indices for half-size `half` (m) around (x, y), or the whole map. */
function cellWindow(stride, half, x, y) {
  const T = S.T, cwAll = Math.ceil(T.w / stride), chAll = Math.ceil(T.h / stride);
  if (!half) return { c0: 0, c1: cwAll, r0: 0, r1: chAll };
  const cell = stride * T.res, cl = (v, n) => Math.max(0, Math.min(n, v));
  return { c0: cl(Math.floor((x - half) / cell), cwAll), c1: cl(Math.ceil((x + half) / cell), cwAll), r0: cl(Math.floor((y - half) / cell), chAll), r1: cl(Math.ceil((y + half) / cell), chAll) };
}

/** Margins from each node {x,y,h} to every cell of a window → {stride, c0, r0, cw, ch, per: Float32Array[]}. */
export async function gridRun(nodes, stride, win, onProgress) {
  const cw = win.c1 - win.c0, ch = win.r1 - win.r0;
  const nChunks = Math.max(1, Math.min(ch, pool.workers.length * 2)), rowsPer = Math.ceil(ch / nChunks), msgs = [];
  for (let r0 = win.r0; r0 < win.r1; r0 += rowsPer) msgs.push({ type: 'coverage', radio: S.radio, nodes, stride, r0, r1: Math.min(win.r1, r0 + rowsPer), c0: win.c0, c1: win.c1, hRx: S.h.astro });
  const res = msgs.length ? await pool.run(msgs, onProgress) : [];
  const per = nodes.map(() => new Float32Array(cw * ch).fill(NaN));
  for (const r of res) {
    const rows = r.r1 - r.r0;
    for (let k = 0; k < nodes.length; k++) per[k].set(r.out.subarray(k * rows * cw, (k + 1) * rows * cw), (r.r0 - win.r0) * cw);
  }
  return { stride, c0: win.c0, r0: win.r0, cw, ch, per };
}

/** Grid value at map point (x, y), NaN outside. */
export function gridAt(g, arr, x, y) {
  if (!g) return NaN;
  const cell = g.stride * S.T.res, c = Math.floor(x / cell) - g.c0, r = Math.floor(y / cell) - g.r0;
  return c >= 0 && r >= 0 && c < g.cw && r < g.ch ? arr[r * g.cw + c] : NaN;
}

/** Which network the reach map uses: the full plan, or only the relays already set down. */
function reachNet() {
  const net = S.net;
  if (S.ui.covNet === 'now' && S.now) return { infra: net.infra, best: S.now.best, key: S.now.key };
  return { infra: net.infra, best: net.best, key: 'plan' };
}
const here = () => S.eva.samples[S.eva.idx] || S.nodes[0] || { x: S.W / 2, y: S.H / 2 };

export async function runCoverage() {
  const net = S.net; if (!net || !net.infra.length) return;
  const my = ++seq, stride = S.ui.covStride, rn = reachNet();
  const live = rn.infra.map((n, i) => ({ n, i })).filter(({ i }) => rn.best[i] >= 0);
  const nodes = live.map(({ n }) => ({ x: n.x, y: n.y, h: hOf(n) }));
  const p = here(), win = cellWindow(stride, S.ui.covWin, p.x, p.y);
  const quiet = S.device !== 'base';   // field devices recompute in the background without a progress bar
  if (!quiet) busy(true, 0, '통신 가능 영역 계산 중…');
  const t0 = performance.now();
  const g = await gridRun(nodes, stride, win, (f) => { if (my === seq && !quiet) busy(true, f, '통신 가능 영역 계산 중…'); });
  if (my !== seq) return;
  const comb = new Float32Array(g.cw * g.ch).fill(NaN);
  for (let c = 0; c < comb.length; c++) {
    let best = -Infinity, valid = false;
    for (let k = 0; k < nodes.length; k++) { const m = g.per[k][c]; if (m === m) { valid = true; best = Math.max(best, Math.min(rn.best[live[k].i], m)); } }
    if (valid) comb[c] = best;
  }
  S.cov = { ...g, perNode: g.per, comb, landerOnly: live[0]?.i === 0 ? g.per[0] : null, ms: performance.now() - t0, stale: false,
    net: rn.key, cx: p.x, cy: p.y, half: S.ui.covWin };
  if (!quiet) busy(false);
  covStats();
  if (S.preview) A.schedulePreview?.(true);
}

/** Reach-map value (best margin through the network) at (x, y). */
export const reachAt = (x, y) => (S.cov ? gridAt(S.cov, S.cov.comb, x, y) : NaN);

/** A window coverage needs refreshing once the astronaut walks out of its inner part. */
export function coverageFollows() {
  const c = S.cov, p = S.eva.samples[S.eva.idx];
  if (!c || !c.half || !p) return;
  if (Math.hypot(p.x - c.cx, p.y - c.cy) > c.half * 0.4) scheduleCoverage();
}

// ---------------------------------------------------------------- "relay here" preview
let pTimer = 0, pBusy = false, pAgain = false;
export function schedulePreview(force = false) {
  const p = S.eva.samples[S.eva.idx]; if (!p) return;
  if (!force && S.preview && Math.hypot(p.x - S.preview.x, p.y - S.preview.y) < 25) return;
  clearTimeout(pTimer); pTimer = setTimeout(runPreview, force ? 0 : 150);
}
export async function runPreview() {
  if (pBusy) { pAgain = true; return; }
  const net = S.net, p = S.eva.samples[S.eva.idx]; if (!net || !p) return;
  pBusy = true; const my = ++pseq;
  const cand = { x: p.x, y: p.y, type: 'relay' }, best = S.now?.best || net.best;
  // backbone of the new relay = its best path to the lander through the relays already set down
  let bb = -Infinity;
  net.infra.forEach((n, i) => { if (best[i] >= 0) bb = Math.max(bb, Math.min(best[i], link(n, cand))); });
  const stride = S.ui.covWin ? S.ui.covStride : Math.max(3, S.ui.covStride);
  const win = cellWindow(stride, S.ui.covWin || 3500, p.x, p.y);
  const g = bb >= 0 ? await gridRun([{ x: p.x, y: p.y, h: S.h.relay }], stride, win) : { stride, c0: win.c0, r0: win.r0, cw: 0, ch: 0, per: [new Float32Array(0)] };
  pBusy = false;
  if (my === pseq) {
    const m = g.per[0];
    for (let k = 0; k < m.length; k++) if (m[k] === m[k]) m[k] = Math.min(bb, m[k]);
    S.preview = { ...g, m, bb, x: p.x, y: p.y };
    bus.emit('preview');
  }
  if (pAgain) { pAgain = false; schedulePreview(); }
}
export function clearPreview() { clearTimeout(pTimer); pseq++; S.preview = null; bus.emit('preview'); }

/** Preview cell class: 2 = newly reachable, 1 = becomes stable, 0 = no change. */
export function previewGain(k) {
  const P = S.preview, m = P.m[k]; if (!(m >= 0)) return 0;
  const cell = P.stride * S.T.res, c = k % P.cw, r = (k - c) / P.cw;
  const cur = reachAt((P.c0 + c + 0.5) * cell, (P.r0 + r + 0.5) * cell);
  const now = cur === cur ? cur : -Infinity;
  if (now < 0) return 2;
  if (now < S.req && m >= S.req) return 1;
  return 0;
}

export function covStats() {
  const c = S.cov;
  if (!c) { S.out.cov = ''; S.stats.cov = null; }
  else {
    const cell = (c.stride * S.T.res) ** 2 / 1e6;
    const count = (arr, th) => { let n = 0, v = 0; for (const m of arr) { if (m === m) { v++; if (m >= th) n++; } } return [n, v]; };
    const [nAll, valid] = count(c.comb, 0), [nOk] = count(c.comb, S.req), [nL] = c.landerOnly ? count(c.landerOnly, 0) : [0];
    S.stats.cov = {
      landerPct: 100 * nL / valid, netPct: 100 * nAll / valid, stablePct: 100 * nOk / valid,
      landerKm2: nL * cell, netKm2: nAll * cell, factor: nL ? nAll / nL : NaN, seconds: c.ms / 1000, stale: !!c.stale,
    };
    const pct = (n) => `${(100 * n / valid).toFixed(1)}%`;
    S.out.cov = `착륙선 단독: <b>${pct(nL)}</b> (${(nL * cell).toFixed(1)} km²)<br>` +
      `중계망 포함: <b>${pct(nAll)}</b> (${(nAll * cell).toFixed(1)} km²) · 안정 ${pct(nOk)}<br>` +
      `활동 범위 확장: <b>${nL ? `×${(nAll / nL).toFixed(2)}` : '—'}</b> · 계산 ${(c.ms / 1000).toFixed(1)} s` +
      (c.stale ? ' · <span class="warn">배치가 바뀜 — 다시 계산하세요</span>' : '');
  }
  bus.emit('cov');
}

Object.assign(A, { runCoverage, scheduleCoverage, covStats, schedulePreview, runPreview, clearPreview, coverageFollows });
