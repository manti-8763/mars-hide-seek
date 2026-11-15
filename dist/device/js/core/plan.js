// The three pieces of state the devices share, as plain JSON:
//   plan — lander, relays, radio, antenna heights, required margin, EVA sol range, deploy mode
//   walk — where the astronaut is on the route, playing or not, playback speed
//   hud  — what the helmet display shows
import { S, A, PH, bus } from './store.js';
import * as scene from './scene.js';

export function getPlan() {
  return {
    nodes: S.nodes.filter((n) => n.type !== 'astro').map(({ id, type, x, y, name }) => ({ id, type, x, y, name })),
    nextRelay: S.nextId.relay, presetKey: S.presetKey, radio: { ...S.radio }, h: { ...S.h }, req: S.req,
    sol0: S.ui.eva.sol0, sol1: S.ui.eva.sol1, deploy: S.ui.eva.deploy,
  };
}
export const planKey = (p = getPlan()) => JSON.stringify(p);

export function applyPlan(p) {
  for (const n of S.nodes) scene.removeMarker(n.id);
  S.nodes = p.nodes.map((n) => ({ ...n }));
  S.nodes.forEach(scene.placeMarker);
  S.nextId.relay = p.nextRelay;
  S.presetKey = PH.PRESETS[p.presetKey] ? p.presetKey : S.presetKey;
  S.radio = { ...p.radio }; S.h = { ...p.h }; S.req = p.req;
  Object.assign(S.ui.eva, { sol0: p.sol0, sol1: p.sol1, deploy: p.deploy });
  A.radioChanged(false);
  A.recompute();
  bus.emit('ui');
}

export function getWalk() {
  const E = S.eva;
  return { pos: E.playing ? E.pos : (E.samples[E.idx]?.d ?? 0), playing: E.playing, speed: S.ui.eva.speed };
}
export function applyWalk(w) {
  const E = S.eva;
  S.ui.eva.speed = w.speed;
  let i = 0; while (i < E.samples.length - 1 && E.samples[i + 1].d <= w.pos) i++;
  E.playing = !!w.playing && E.samples.length > 1;
  A.moveEva(i, true); E.pos = w.pos;
  bus.emit('evaState'); A.updateProfile();
}

export function getHud() { return { ...S.hud }; }
export function applyHud(h) { Object.assign(S.hud, h); bus.emit('hud'); }
