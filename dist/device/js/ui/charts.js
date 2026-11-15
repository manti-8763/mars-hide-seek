// Canvas charts: EVA margin timeline, link profile, coverage histogram, cross-section strip.
import { S } from '../core/store.js';
import { COL, colorOf, fmt, niceStep, setupCanvas } from '../core/util.js';

const C = { grid: 'rgba(255,255,255,.07)', axis: '#8f8073', text: '#d9cfc4', ground: '#5a4030', relay: '#7cc4ff', now: '#ffffff' };
const FONT = '11px system-ui, "Segoe UI", "Malgun Gothic", sans-serif';

// ---------------------------------------------------------------- EVA timeline
/** Link margin along the EVA route. o: {yMin, yMax, compact, showLander} → returns geometry for click-to-seek. */
export function drawTimeline(cv, o = {}) {
  const [ctx, w, hh] = setupCanvas(cv); ctx.clearRect(0, 0, w, hh);
  const E = S.eva; if (!E.margins || E.samples.length < 2) return null;
  const pad = { l: 44, r: 10, t: 16, b: o.compact ? 20 : 26 }, pw = w - pad.l - pad.r, ph = hh - pad.t - pad.b;
  const lo = o.yMin ?? -30, hi = o.yMax ?? 40;
  const X = (d) => pad.l + d / E.total * pw, Y = (m) => pad.t + (1 - (Math.max(lo, Math.min(hi, m)) - lo) / (hi - lo)) * ph;
  ctx.font = FONT; ctx.lineWidth = 1;
  // grid + y labels
  ctx.textAlign = 'right'; ctx.fillStyle = C.axis;
  const ys = niceStep(hi - lo, Math.max(2, Math.floor(ph / 26)));
  for (let m = Math.ceil(lo / ys) * ys; m <= hi; m += ys) { ctx.strokeStyle = m === 0 ? 'rgba(255,255,255,.25)' : C.grid; ctx.beginPath(); ctx.moveTo(pad.l, Y(m)); ctx.lineTo(pad.l + pw, Y(m)); ctx.stroke(); ctx.fillText(`${m}`, pad.l - 6, Y(m) + 4); }
  ctx.save(); ctx.translate(11, pad.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('마진 dB', 0, 0); ctx.restore();
  // x labels
  ctx.textAlign = 'center';
  const xs = niceStep(E.total / 1000, Math.max(2, Math.floor(pw / 70))) * 1000;
  for (let d = 0; d <= E.total + 1e-6; d += xs) ctx.fillText(`${(d / 1000).toFixed(xs < 1000 ? 1 : 0)}${d === 0 ? '' : ''}`, X(d), pad.t + ph + 14);
  if (!o.compact) { ctx.textAlign = 'right'; ctx.fillText('걸은 거리 km', pad.l + pw, hh - 2); }
  // required margin
  ctx.strokeStyle = COL.warn; ctx.globalAlpha = 0.6; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pad.l, Y(S.req)); ctx.lineTo(pad.l + pw, Y(S.req)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  // lander only
  if (o.showLander !== false) {
    ctx.strokeStyle = 'rgba(210,200,190,.4)'; ctx.beginPath();
    E.samples.forEach((s, k) => { const y = Y(Number.isFinite(E.lander[k]) ? E.lander[k] : lo); k ? ctx.lineTo(X(s.d), y) : ctx.moveTo(X(s.d), y); }); ctx.stroke();
  }
  // margin bars; the part already walked is dimmed
  const y0 = Y(Math.max(lo, Math.min(hi, 0))), here = E.samples[E.idx].d;
  for (let k = 1; k < E.samples.length; k++) {
    const m = E.margins[k], x0 = X(E.samples[k - 1].d), x1 = X(E.samples[k].d), y = Y(Number.isFinite(m) ? m : lo);
    ctx.globalAlpha = E.samples[k].d <= here && o.dimPast ? 0.4 : 1;
    ctx.fillStyle = colorOf(m); ctx.fillRect(x0, Math.min(y, y0), Math.max(1, x1 - x0), Math.abs(y0 - y) || 1);
  }
  ctx.globalAlpha = 1;
  // relay set-down points: solid = already set down, dashed = still to come
  if (E.walk) {
    ctx.fillStyle = C.relay; ctx.textAlign = 'center';
    S.net.infra.forEach((n, i) => {
      const d = E.deployD[i]; if (!Number.isFinite(d)) return;
      ctx.strokeStyle = C.relay; ctx.setLineDash(d <= here ? [] : [3, 3]); ctx.beginPath(); ctx.moveTo(X(d), pad.t); ctx.lineTo(X(d), pad.t + ph); ctx.stroke();
      ctx.fillText(n.name, X(d), pad.t - 4);
    });
    ctx.setLineDash([]);
  }
  // current position
  const px = X(here); ctx.strokeStyle = C.now; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, pad.t + ph); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = C.now; ctx.beginPath(); ctx.moveTo(px - 5, pad.t + ph + 1); ctx.lineTo(px + 5, pad.t + ph + 1); ctx.lineTo(px, pad.t + ph - 6); ctx.fill();
  return { pad, pw, total: E.total };
}

// ---------------------------------------------------------------- link profile (base)
export function drawProfile(cv) {
  const [ctx, w, hh] = setupCanvas(cv); ctx.clearRect(0, 0, w, hh);
  const P = S.profile; ctx.font = FONT; ctx.fillStyle = C.axis;
  if (!P) { ctx.fillText('노드 목록에서 중계기를 고르거나 EVA를 재생하면 그 링크의 단면이 나옵니다.', 14, 24); return; }
  if (!(P.D >= 1)) { ctx.fillText(`${P.names[0]} · ${P.names[1]} 위치가 같습니다.`, 14, 24); return; }
  const tw = Math.min(200, w * 0.36), pad = { l: 52, r: tw + 14, t: 24, b: 26 };
  const pw = w - pad.l - pad.r, ph = hh - pad.t - pad.b, ant = [P.za, P.zb];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= P.n; i++) { const z = P.zFlat[i]; if (Number.isFinite(z)) { lo = Math.min(lo, z); hi = Math.max(hi, z); } }
  const losAt = (i) => ant[0] + (ant[1] - ant[0]) * P.d[i] / P.D;
  for (let i = 0; i <= P.n; i++) { hi = Math.max(hi, losAt(i) + P.r1[i]); lo = Math.min(lo, losAt(i) - P.r1[i]); }
  const span = Math.max(hi - lo, 20); lo -= span * 0.05; hi += span * 0.08;
  const X = (d) => pad.l + d / P.D * pw, Y = (z) => pad.t + (1 - (z - lo) / (hi - lo)) * ph;
  ctx.textAlign = 'right';
  const zs = niceStep(hi - lo, Math.max(2, Math.floor(ph / 28)));
  for (let z = Math.ceil(lo / zs) * zs; z <= hi; z += zs) { ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(pad.l, Y(z)); ctx.lineTo(pad.l + pw, Y(z)); ctx.stroke(); ctx.fillText(`${z.toFixed(0)}`, pad.l - 6, Y(z) + 4); }
  ctx.textAlign = 'center';
  const xs = niceStep(P.D / 1000, Math.max(2, Math.floor(pw / 70))) * 1000;
  for (let d = 0; d <= P.D + 1e-6; d += xs) ctx.fillText(`${(d / 1000).toFixed(xs < 1000 ? 1 : 0)}`, X(d), pad.t + ph + 14);
  ctx.textAlign = 'right'; ctx.fillText('거리 km', pad.l + pw, hh - 2);
  ctx.textAlign = 'left'; ctx.fillText('고도 m (곡률 보정)', pad.l, 12);
  ctx.beginPath(); ctx.moveTo(X(0), Y(lo));
  for (let i = 0; i <= P.n; i++) { const z = P.zFlat[i]; ctx.lineTo(X(P.d[i]), Y(Number.isFinite(z) ? z : lo)); }
  ctx.lineTo(X(P.D), Y(lo)); ctx.closePath(); ctx.fillStyle = C.ground; ctx.fill();
  const band = (f, style, dash) => {
    ctx.strokeStyle = style; ctx.setLineDash(dash); ctx.beginPath();
    for (const sgn of [1, -1]) for (let i = 0; i <= P.n; i++) { const x = X(P.d[i]), y = Y(losAt(i) + sgn * f * P.r1[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
  };
  band(1, 'rgba(124,196,255,.75)', [4, 3]); band(0.6, 'rgba(124,196,255,.4)', [2, 4]);
  ctx.strokeStyle = colorOf(P.margin); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(0), Y(ant[0])); ctx.lineTo(X(P.D), Y(ant[1])); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = COL.bad; for (const e of P.edges) { ctx.beginPath(); ctx.arc(X(P.d[e]), Y(P.zFlat[e]), 3.5, 0, 7); ctx.fill(); }
  // numbers
  const rows = [
    ['링크', `${P.names[0]} → ${P.names[1]}`], ['거리', `${(P.D / 1000).toFixed(2)} km`],
    [S.R.kind === 'optical' ? '확산 손실' : '자유공간 손실', `${fmt(P.Lfs)} dB`], ['회절 손실', `${fmt(P.Ld)} dB`],
    ['수신 전력', `${fmt(P.pr)} dBm`], ['링크 마진', `${fmt(P.margin)} dB`],
    ['가시선', P.clr > 0 ? (P.clr >= 0.6 ? 'Fresnel 60 % 확보' : '확보') : '차단'],
  ];
  const x0 = w - tw;
  rows.forEach(([k, v], i) => {
    const y = 26 + i * 17;
    ctx.textAlign = 'left'; ctx.fillStyle = C.axis; ctx.fillText(k, x0, y);
    ctx.textAlign = 'right'; ctx.fillStyle = k === '링크 마진' ? colorOf(P.margin) : C.text; ctx.fillText(v, w - 10, y);
  });
  ctx.textAlign = 'left'; ctx.fillStyle = C.axis;
  ctx.fillText('점선: Fresnel 1차 · 60 % · 빨간 점: 회절 능선', x0, 26 + rows.length * 17 + 4);
}

// ---------------------------------------------------------------- coverage histogram (base)
export function drawCovHist(cv) {
  const [ctx, w, hh] = setupCanvas(cv); ctx.clearRect(0, 0, w, hh);
  const c = S.cov; ctx.font = FONT; ctx.fillStyle = C.axis;
  if (!c) { ctx.fillText('통신 가능 영역을 계산하면 칸별 마진 분포가 나옵니다.', 14, 24); return; }
  const bin = 5, lo = -40, hi = 60, nb = (hi - lo) / bin;
  const hist = (arr) => {
    const out = new Float64Array(nb); let v = 0;
    for (const m of arr) { if (!(m === m)) continue; v++; out[Math.min(nb - 1, Math.max(0, Math.floor((Math.max(lo, Math.min(hi - 1e-9, m)) - lo) / bin)))]++; }
    return out.map((x) => (v ? 100 * x / v : 0));
  };
  const hn = hist(c.comb), hl = c.landerOnly ? hist(c.landerOnly) : null;
  const top = Math.max(5, ...hn, ...(hl || [0])) * 1.1;
  const pad = { l: 44, r: 12, t: 20, b: 26 }, pw = w - pad.l - pad.r, ph = hh - pad.t - pad.b;
  const X = (m) => pad.l + (m - lo) / (hi - lo) * pw, Y = (p) => pad.t + (1 - p / top) * ph;
  ctx.textAlign = 'right';
  const ys = niceStep(top, 4);
  for (let p = 0; p <= top; p += ys) { ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(pad.l, Y(p)); ctx.lineTo(pad.l + pw, Y(p)); ctx.stroke(); ctx.fillText(`${p.toFixed(0)}%`, pad.l - 6, Y(p) + 4); }
  ctx.textAlign = 'center';
  for (let m = lo; m <= hi; m += 20) ctx.fillText(`${m}`, X(m), pad.t + ph + 14);
  ctx.textAlign = 'right'; ctx.fillText('칸의 링크 마진 dB', pad.l + pw, hh - 2);
  ctx.textAlign = 'left'; ctx.fillText('막대: 중계망 · 회색 선: 착륙선 단독 · 세로: 칸 비율', pad.l, 12);
  for (let k = 0; k < nb; k++) { const m0 = lo + k * bin; ctx.fillStyle = colorOf(m0 + bin / 2); ctx.fillRect(X(m0) + 1, Y(hn[k]), Math.max(1, X(m0 + bin) - X(m0) - 2), Y(0) - Y(hn[k])); }
  if (hl) {
    ctx.strokeStyle = 'rgba(220,210,200,.8)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let k = 0; k < nb; k++) { const x0 = X(lo + k * bin), x1 = X(lo + (k + 1) * bin), y = Y(hl[k]); k ? ctx.lineTo(x0, y) : ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke(); ctx.lineWidth = 1;
  }
}

// ---------------------------------------------------------------- cross-section strip (helmet / tablet)
/** One strip: terrain from me (left) to a target (right), line of sight to it, ground line coloured by reach. */
export function drawStrip(cv, st, o = {}) {
  const [ctx, w, hh] = setupCanvas(cv); ctx.clearRect(0, 0, w, hh);
  if (!st) return;
  const pad = { l: 4, r: 4, t: 4, b: 4 }, pw = w - pad.l - pad.r, ph = hh - pad.t - pad.b;
  const P = st.prof, D = Math.max(1, st.D);
  // terrain samples: dense profile for nodes, the 49 strip points for the target
  const tx = P ? Array.from(P.d) : st.pts.map((_, k) => k / (st.pts.length - 1) * D);
  const tz = P ? Array.from(P.zFlat) : st.z;
  const ant = P ? [P.za, P.zb] : null;
  let lo = Infinity, hi = -Infinity;
  for (const z of tz) if (Number.isFinite(z)) { lo = Math.min(lo, z); hi = Math.max(hi, z); }
  if (ant) { lo = Math.min(lo, ...ant); hi = Math.max(hi, ...ant); }
  const span = Math.max(hi - lo, 15); lo -= span * 0.15; hi += span * 0.2;
  const X = (d) => pad.l + d / D * pw, Y = (z) => pad.t + (1 - (z - lo) / (hi - lo)) * ph;
  ctx.beginPath(); ctx.moveTo(X(0), hh);
  tx.forEach((d, i) => ctx.lineTo(X(d), Y(Number.isFinite(tz[i]) ? tz[i] : lo)));
  ctx.lineTo(X(D), hh); ctx.closePath(); ctx.fillStyle = o.fill || 'rgba(20,14,10,.55)'; ctx.fill();
  // reach along the line, drawn on the ground surface
  if (st.reach) {
    const n = st.pts.length - 1, zAt = (d) => { let i = 0; while (i < tx.length - 1 && tx[i + 1] < d) i++; const u = (d - tx[i]) / Math.max(1e-9, (tx[i + 1] ?? tx[i]) - tx[i]); return tz[i] + ((tz[i + 1] ?? tz[i]) - tz[i]) * Math.max(0, Math.min(1, u)); };
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const d0 = k / n * D, d1 = (k + 1) / n * D;
      ctx.strokeStyle = colorOf(st.reach[k]); ctx.beginPath(); ctx.moveTo(X(d0), Y(zAt(d0))); ctx.lineTo(X(d1), Y(zAt(d1))); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  // line of sight from my antenna to the node's antenna
  if (ant) {
    ctx.strokeStyle = colorOf(st.direct); ctx.lineWidth = 1.5; ctx.setLineDash(P.clr > 0 ? [] : [4, 3]);
    ctx.beginPath(); ctx.moveTo(X(0), Y(ant[0])); ctx.lineTo(X(D), Y(ant[1])); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(D), Y(ant[1]), 2.5, 0, 7); ctx.fill();
  }
  ctx.lineWidth = 1;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(0), Y(ant ? ant[0] : tz[0] + 2), 3, 0, 7); ctx.fill();
}
