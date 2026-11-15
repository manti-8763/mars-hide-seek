// Shared state, event bus and action registry (one copy per page / device).
// Core modules register their functions on `A` so they can call each other without import cycles;
// pages read `S`, call `A.*` and listen on `bus`.
import * as PH from '../physics.js';

export { PH };

export const S = {
  device: '',         // 'hud' | 'tablet' | 'base'
  meta: null, T: null, route: [], W: 0, H: 0, zRef: 0, orthoGray: null,
  nodes: [], nextId: { relay: 1, astro: 1 },
  presetKey: 'sband', radio: { ...PH.PRESETS.sband }, R: null,
  h: { lander: 4, relay: 3, astro: 2 }, req: 3,
  mode: 'view',
  net: null,          // planned network (all relays): {infra, mat, best, prev, astro}
  now: null,          // relays already set down at the current EVA position: {on[], best, prev, key}
  selected: 'eva',    // node id (or 'eva') whose link is shown
  profile: null,      // linkProfile(...) + names/note
  cov: null,          // reach grid {stride, c0, r0, cw, ch, perNode[], comb, landerOnly, ms, stale, net}
  preview: null,      // "relay here" grid {stride, c0, r0, cw, ch, m, bb, x, y}
  eva: { samples: [], margins: null, via: null, lander: null, idx: 0, pos: 0, playing: false, total: 0, walk: false, deployD: [] },
  hud: { mode: 'reach', info: true },   // helmet display: overlay 'none' | 'reach' | 'relay', cross-section strips on/off
  ui: {
    covStride: 6, covAuto: true, covAlpha: 0.5,
    covNet: 'plan',   // which relays the reach map uses: 'plan' (all) | 'now' (already set down)
    covWin: 0,        // 0 = whole map, else half-size (m) of a window centred on the astronaut
    opt: { K: 3, spacing: 200, slope: 15, target: 'route', site: 'corridor', corridor: 150 },
    eva: { sol0: 0, sol1: 0, speed: 60, deploy: 'walk' },
    display: { exag: 1.5, markerScale: 1, texMode: 'ortho', showFresnel: true, overlay: 'reach', smooth: false, routeWidth: 6 },
  },
  out: { cov: '', opt: '', eva: '', radio: '' },
  stats: { cov: null, eva: null, opt: null, radio: null },
};

/** Actions registered by core modules (A.recompute, A.addNode, …). */
export const A = {};

const handlers = new Map();
export const bus = {
  on(type, fn) { (handlers.get(type) || handlers.set(type, new Set()).get(type)).add(fn); return () => handlers.get(type).delete(fn); },
  emit(type, data) { for (const fn of handlers.get(type) || []) { try { fn(data); } catch (e) { console.error(`[bus:${type}]`, e); } } },
};
// Events: 'ui' · 'net' (plan recomputed) · 'now' (set-down relays changed) · 'profile' · 'cov' · 'preview'
//         'eva' (recomputed) · 'evaPos' · 'evaState' (play/pause) · 'opt' · 'radio' · 'hud' · 'plan' (plan edited) · 'busy'
