// What the astronaut needs to know right now — shared by the helmet display and the wrist/tablet screen.
import { S, A, PH, bus } from '../core/store.js';
import { hOf, link } from '../core/util.js';
import { pool } from '../core/data.js';

/** Current position, link and what lies ahead on the route. */
export function fieldStatus() {
  const E = S.eva, net = S.net, s = E.samples[E.idx];
  if (!s || !net) return null;
  const m = E.margins?.[E.idx], via = E.via?.[E.idx] ?? -1;
  const d = s.d, total = E.total;
  // next outage ahead (margin < 0) and its length
  let outAt = NaN, outLen = 0;
  for (let k = E.idx + 1; k < E.samples.length; k++) {
    if (E.margins[k] < 0) {
      outAt = E.samples[k].d - d;
      let j = k; while (j < E.samples.length - 1 && E.margins[j + 1] < 0) j++;
      outLen = E.samples[j].d - E.samples[k].d + 20;
      break;
    }
  }
  // next relay to set down
  let next = null;
  if (E.walk) net.infra.forEach((n, i) => { const dd = E.deployD[i]; if (dd > d && (!next || dd < next.d)) next = { n, d: dd }; });
  const relays = net.infra.filter((n) => n.type === 'relay');
  const placed = S.now ? S.now.count : relays.length;
  // share of the remaining route that keeps a link
  let ok = 0, rest = 0;
  for (let k = E.idx + 1; k < E.samples.length; k++) { const dl = E.samples[k].d - E.samples[k - 1].d; rest += dl; if (E.margins[k] >= 0) ok += dl; }
  return {
    s, d, total, left: total - d, m, via, viaNode: via >= 0 ? net.infra[via] : null, direct: E.lander?.[E.idx],
    outAhead: outAt, outLen, next: next ? { name: next.n.name, ahead: next.d - d } : null,
    placed, planned: relays.length, restOkPct: rest ? 100 * ok / rest : 100,
    target: E.samples.at(-1),
  };
}

// ---------------------------------------------------------------- cross-section strips
// From the astronaut to the lander, to each relay already set down, and to the EVA's end point:
// terrain along the line, the line of sight to that node, and the reach along the line (colour of the ground line).
const N = 48;
let busyStrips = false, again = false, lastAt = null;
export function stripTargets() {
  const net = S.net, E = S.eva, s = E.samples[E.idx]; if (!net || !s) return [];
  const out = [];
  net.infra.forEach((n, i) => { if (S.now?.on[i] ?? true) out.push({ key: n.id, name: n.name, x: n.x, y: n.y, node: n, kind: n.type }); });
  const relays = out.filter((t) => t.kind === 'relay').sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y)).slice(0, 2);
  const end = E.samples.at(-1);
  return [...out.filter((t) => t.kind === 'lander'), ...relays, ...(end ? [{ key: 'target', name: '목표', x: end.x, y: end.y, kind: 'target' }] : [])];
}
/** Compute strips (async, workers); emits 'strips'. Skips if the astronaut moved < 20 m since the last run. */
export async function updateStrips(force = false) {
  const s = S.eva.samples[S.eva.idx]; if (!s || !S.net) return;
  if (!force && lastAt && Math.hypot(s.x - lastAt.x, s.y - lastAt.y) < 20) return;
  if (busyStrips) { again = true; return; }
  busyStrips = true; lastAt = { x: s.x, y: s.y };
  const me = { x: s.x, y: s.y, type: 'astro' }, best = S.now?.best || S.net.best;
  const live = S.net.infra.map((n, i) => ({ n, i })).filter(({ i }) => best[i] >= 0);
  const strips = stripTargets().map((t) => {
    const D = Math.hypot(t.x - s.x, t.y - s.y);
    const pts = Array.from({ length: N + 1 }, (_, k) => ({ x: s.x + (t.x - s.x) * k / N, y: s.y + (t.y - s.y) * k / N, h: S.h.astro }));
    let prof = null;
    if (t.node && D > 1) prof = PH.linkProfile(S.T, S.R, s.x, s.y, S.h.astro, t.x, t.y, hOf(t.node), S.T.res);
    // ground raised by the curvature bulge d(D−d)/(2kR) so the line of sight stays straight (same frame as linkProfile's zFlat)
    const z = pts.map((p, k) => PH.groundAt(S.T, p.x, p.y) + (D * D * (k / N) * (1 - k / N)) / (2 * PH.K_FACTOR * PH.MARS_R));
    return { ...t, D, pts, z, prof, direct: t.node ? link(t.node, me) : NaN, reach: null };
  });
  // reach along every strip: best margin through the network at each point
  const targets = strips.flatMap((st) => st.pts);
  if (live.length && targets.length) {
    const res = await pool.run(live.map(({ n }) => ({ type: 'pairs', radio: S.radio, sources: [{ x: n.x, y: n.y, h: hOf(n) }], targets })));
    let o = 0;
    for (const st of strips) {
      st.reach = new Float32Array(st.pts.length);
      for (let p = 0; p < st.pts.length; p++) {
        let v = -Infinity;
        live.forEach(({ i }, k) => { v = Math.max(v, Math.min(best[i], res[k].out[o + p])); });
        st.reach[p] = v;
      }
      o += st.pts.length;
    }
  }
  S.strips = strips;
  busyStrips = false;
  bus.emit('strips');
  if (again) { again = false; updateStrips(); }
}
bus.on('now', () => updateStrips(true));
bus.on('net', () => updateStrips(true));
A.updateStrips = updateStrips;
