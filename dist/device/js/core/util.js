import { S, PH, bus } from './store.js';

const css = getComputedStyle(document.documentElement);
export const COL = { ok: css.getPropertyValue('--ok').trim(), warn: css.getPropertyValue('--warn').trim(), bad: css.getPropertyValue('--bad').trim() };
export const R_CRS = 3396190; // sphere radius of the DTM's equirectangular CRS (lon/lat readout only)

export const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : (v > 0 ? '∞' : '−∞'));
export const statusOf = (m) => (m >= S.req ? 'ok' : m >= 0 ? 'warn' : 'bad');
export const colorOf = (m) => COL[statusOf(m)];
export const hOf = (n) => S.h[n.type];
export const ground = (x, y) => PH.groundAt(S.T, x, y);
export const lonlat = (x, y) => [(S.meta.origin_proj_m[0] + x) / (R_CRS * Math.PI / 180), (S.meta.origin_proj_m[1] - y) / (R_CRS * Math.PI / 180)];
export const link = (a, b, out) => PH.evalLink(S.T, S.R, a.x, a.y, hOf(a), b.x, b.y, hOf(b), S.T.res, out);
export const busy = (on, frac = 0, text = '계산 중…') => bus.emit('busy', { on, frac, text });

/** 1·2·5 × 10ⁿ tick step giving at most `maxTicks` intervals over `range` (Infinity for an empty range). */
export function niceStep(range, maxTicks) {
  if (!(range > 0) || !Number.isFinite(range)) return Infinity;
  const raw = range / Math.max(1, maxTicks), p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

/** Size a canvas to its CSS box at device pixel ratio; returns [ctx, cssWidth, cssHeight]. */
export function setupCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [ctx, r.width, r.height];
}

/** Tiny DOM helper: h('div.cls', {attr}, ...children) */
export function h(tag, attrs = {}, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
}
