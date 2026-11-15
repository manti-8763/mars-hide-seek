// Greedy relay auto-placement (docs/network-and-optimizer.md §3).
// During a walk-and-drop EVA the relays already set down stay where they are; only the route still ahead is planned.
import { S, A, PH, bus } from './store.js';
import { ground, busy } from './util.js';
import { pool } from './data.js';

const report = (html) => { S.out.opt = html; bus.emit('opt'); };

export async function autoPlace() {
  const L = S.nodes.find((n) => n.type === 'lander'); if (!L) return;
  const { K, spacing: sp, slope: maxSlope, target: mode, site, corridor } = S.ui.opt;
  const wMax = Math.max(0, +corridor || 0), t0 = performance.now();
  const T = S.T, hR = S.h.relay, hA = S.h.astro;
  if (!(sp >= 10)) return report('후보 간격은 10 m 이상이어야 합니다.');
  const tanMax = Math.tan(maxSlope * Math.PI / 180);
  const siteOk = (x, y) => {
    const z = ground(x, y); if (!(z === z)) return false;
    const dx = (ground(x + T.res, y) - ground(x - T.res, y)) / (2 * T.res), dy = (ground(x, y + T.res) - ground(x, y - T.res)) / (2 * T.res);
    return Math.hypot(dx, dy) <= tanMax;
  };
  const evaS = A.buildEvaSamples(), near = A.routeLocator(evaS);
  if (site === 'corridor' && evaS.length < 2) return report('EVA 경로가 없습니다. sol 범위를 지정하세요.');
  const cands = [];
  if (site === 'corridor') {
    for (let k = 0, next = 0; k < evaS.length; k++) if (evaS[k].d >= next) { next = evaS[k].d + sp; if (siteOk(evaS[k].x, evaS[k].y)) cands.push({ x: evaS[k].x, y: evaS[k].y, h: hR }); }
    if (wMax > 0) for (let y = sp / 2; y < S.H; y += sp) for (let x = sp / 2; x < S.W; x += sp) if (near(x, y, wMax).dist <= wMax && siteOk(x, y)) cands.push({ x, y, h: hR });
  } else {
    for (let y = sp / 2; y < S.H; y += sp) for (let x = sp / 2; x < S.W; x += sp) if (siteOk(x, y)) cands.push({ x, y, h: hR });
  }
  const walk = S.ui.eva.deploy === 'walk' && evaS.length >= 2;
  // relays already set down (walk-and-drop, EVA under way) are kept and become part of the set
  const pos = walk ? (S.eva.samples[S.eva.idx]?.d ?? 0) : -Infinity;
  const fixedNodes = walk && pos > 0 && S.now ? S.net.infra.filter((n, i) => n.type === 'relay' && S.now.on[i]) : [];
  const ahead = cands.filter((c) => !walk || near(c.x, c.y).d > pos);
  cands.length = 0; cands.push(...ahead);
  if (!cands.length) return report('조건을 만족하는 후보지가 없습니다 (경사·범위를 늘려 보세요).');
  const nNew = cands.length;
  cands.push(...fixedNodes.map((n) => ({ x: n.x, y: n.y, h: hR, fixed: n.id })));
  const targets = [];
  if (mode !== 'astro') { const every = Math.max(1, Math.round(evaS.length / 150)); targets.push(...evaS.filter((p, i) => i % every === 0 && p.d >= pos).map((p) => ({ x: p.x, y: p.y, h: hA, d: p.d }))); }
  if (mode !== 'route') targets.push(...S.nodes.filter((n) => n.type === 'astro').map((n) => ({ x: n.x, y: n.y, h: hA, d: Infinity })));
  if (!targets.length) return report('대상이 없습니다 (EVA 경로 sol 범위 또는 우주비행사를 지정하세요).');
  const nT = targets.length, nC = cands.length;
  busy(true, 0, `후보 ${nC}곳 × 대상 ${nT}점 링크 계산…`);
  const split = (arr, k) => { const out = [], per = Math.ceil(arr.length / k); for (let i = 0; i < arr.length; i += per) out.push(arr.slice(i, i + per)); return out; };
  const res = await pool.run(split(cands, pool.workers.length * 3).map((c) => ({ type: 'pairs', radio: S.radio, sources: c, targets })), (f) => busy(true, f * 0.9, `후보 ${nC}곳 × 대상 ${nT}점 링크 계산…`));
  const M = new Float32Array(nC * nT); let off = 0; for (const r of res) { M.set(r.out, off); off += r.out.length; }
  const linksFrom = async (src) => {
    const r = await pool.run(split(cands, pool.workers.length).map((c) => ({ type: 'pairs', radio: S.radio, sources: [src], targets: c })));
    const out = new Float32Array(nC); let o = 0; for (const x of r) { out.set(x.out, o); o += x.out.length; } return out;
  };
  const candD = Float64Array.from(cands, (c) => (walk ? near(c.x, c.y).d : -Infinity));
  const tgtD = Float64Array.from(targets, (t) => (walk ? t.d : Infinity));
  const direct = Float32Array.from(targets, (t) => PH.evalLink(T, S.R, L.x, L.y, S.h.lander, t.x, t.y, t.h, T.res));
  const candDirect = await linksFrom({ x: L.x, y: L.y, h: S.h.lander });
  const cover = Float64Array.from(direct);
  const before = cover.filter((m) => m >= 0).length;
  const chosen = [], LF = new Map();
  const rr = (a, b) => (LF.has(a) ? LF.get(a)[b] : LF.get(b)[a]);
  const tOrd = Array.from(targets, (_, t) => t).sort((a, b) => tgtD[a] - tgtD[b]);
  // exact evaluation of a relay set; returns the last relay's backbone at the moment it is set down
  const evaluate = (ids, out, minD = -Infinity) => {
    const ord = ids.slice().sort((a, b) => candD[a] - candD[b]), n = ord.length, W = new Array(n + 1);
    const stage = (s) => (W[s] ??= PH.widestPath(s + 1, 0, (i, j) => (i === 0 ? candDirect[ord[j - 1]] : j === 0 ? candDirect[ord[i - 1]] : rr(ord[i - 1], ord[j - 1]))).best);
    const last = ids[n - 1]; let sL = 0; while (sL < n && candD[ord[sL]] <= candD[last]) sL++;
    const installBB = n ? stage(sL)[ord.indexOf(last) + 1] : NaN;
    let s = 0;
    for (const t of tOrd) {
      if (tgtD[t] < minD) continue;
      while (s < n && candD[ord[s]] <= tgtD[t]) s++;
      const w = stage(s); let v = direct[t];
      for (let i = 0; i < s; i++) { const m = Math.min(w[i + 1], M[ord[i] * nT + t]); if (m > v) v = m; }
      out[t] = v;
    }
    return installBB;
  };
  for (let c = nNew; c < nC; c++) { chosen.push(c); LF.set(c, await linksFrom(cands[c])); }
  if (chosen.length) evaluate(chosen, cover);
  const nFixed = chosen.length, fixedCover = cover.filter((m) => m >= 0).length;
  const trial = new Float64Array(nT);
  let tScore = 0;
  for (let k = 0; k < K; k++) {
    const ts = performance.now();
    let bestC = -1, bestScore = -Infinity, bestGain = 0;
    for (let c = 0; c < nNew; c++) {
      if (LF.has(c)) continue;
      if (!(evaluate([...chosen, c], trial, candD[c]) >= S.req)) continue;
      let gain = 0, soft = 0;
      for (let t = 0; t < nT; t++) {
        if (tgtD[t] < candD[c]) continue;
        const nm = trial[t], cur = cover[t];
        if (nm >= 0 && cur < 0) gain++;
        soft += Math.min(30, Math.max(0, nm - Math.max(cur, -60)));
      }
      const score = gain * 1000 + soft;
      if (score > bestScore) { bestScore = score; bestC = c; bestGain = gain; }
    }
    tScore += performance.now() - ts;
    if (bestC < 0) break;
    chosen.push(bestC);
    busy(true, 0.9 + 0.1 * (k + 1) / K, `중계기 ${k + 1}/${K} 선택 (신규 연결 ${bestGain}점)`);
    LF.set(bestC, await linksFrom(cands[bestC]));
    evaluate(chosen, cover);
    if (cover.every((m) => m >= S.req)) break;
  }
  busy(false);
  A.clearRelays(new Set(fixedNodes.map((n) => n.id)));
  const placed = chosen.slice(nFixed).map((c) => ({ c, ...near(cands[c].x, cands[c].y) }));
  if (walk) placed.sort((a, b) => a.d - b.d);
  const nodes = placed.map((p) => ({ ...p, n: A.addNodeSilent('relay', cands[p.c].x, cands[p.c].y) }));
  A.recompute();
  const after = cover.filter((m) => m >= 0).length;
  S.stats.opt = { candidates: nNew, targets: nT, before, after, relays: chosen.length - nFixed, kept: nFixed, seconds: (performance.now() - t0) / 1000, walk };
  bus.emit('plan');
  const where = evaS.length < 2 ? '' : nodes.map((p) => `${p.n.name}: 경로 ${(p.d / 1000).toFixed(2)} km 지점` +
    (p.dist < 15 ? ' (경로 위)' : `에서 ${Math.round(p.dist)} m`) + (walk ? '에 설치' : '')).join('<br>');
  report(`후보 ${nNew}곳(${site === 'corridor' ? `경로에서 ${wMax} m 이내, ` : ''}경사 ≤ ${maxSlope}°) · 대상 ${nT}점 · ${((performance.now() - t0) / 1000).toFixed(1)} s (그중 후보 평가 ${(tScore / 1000).toFixed(2)} s)<br>` +
    `설치 시점: ${walk ? '걸으면서 설치 (지나가기 전에는 없는 것으로 계산)' : 'EVA 전에 모두 설치'}<br>` +
    (nFixed ? `이미 설치한 중계기 ${nFixed}대는 그대로 두고, 남은 경로(${(pos / 1000).toFixed(2)} km 이후)만 계획<br>` : '') +
    `대상 연결: 착륙선 단독 <b>${before}/${nT}</b>${nFixed ? ` · 설치된 중계기만 ${fixedCover}/${nT}` : ''} → 새 중계기 ${chosen.length - nFixed}대 <b>${after}/${nT}</b>` +
    (chosen.length - nFixed < K && !cover.every((m) => m >= S.req) ? `<br><span class="warn">착륙선과 안정적으로 이어지는 후보가 더 없어 ${chosen.length - nFixed}대만 배치했습니다.</span>` : '') +
    (where ? `<br>${where}` : ''));
}

Object.assign(A, { autoPlace });
