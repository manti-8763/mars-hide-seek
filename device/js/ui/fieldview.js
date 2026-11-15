// Pieces of the helmet view that the wrist/tablet screen also shows (it must stand in for the helmet when the two are cut off).
import { S, A, bus } from '../core/store.js';
import { statusOf } from '../core/util.js';
import * as scene from '../core/scene.js';
import { h, dist, dB } from './dom.js';
import { drawStrip } from './charts.js';
import { fieldStatus } from './field.js';

export const MODES = [['none', '없음'], ['reach', '전파도달도'], ['relay', '중계기 전파도']];
export const modeName = (m) => MODES.find((x) => x[0] === m)?.[1] || m;

/** Status line: link now, and what is coming up on the route. */
export function statusView() {
  const f = fieldStatus(); if (!f) return null;
  const cls = statusOf(f.m);
  const margin = f.m >= 0 ? dB(f.m) : '끊김';
  const via = f.m >= 0 ? (f.viaNode && f.viaNode.type === 'relay' ? `${f.viaNode.name} 경유` : '착륙선 직결') : `착륙선 직결 ${dB(f.direct)}`;
  const ahead = [];
  if (f.m >= 0 && f.outAhead < 600) ahead.push(`<span class="bad">${dist(f.outAhead)} 앞 끊김</span>`);
  if (f.next && f.next.ahead < 400) ahead.push(`${f.next.name} 설치 지점까지 ${dist(f.next.ahead)}`);
  if (f.left < 1) ahead.push('목표 도착');
  return { f, cls, margin, via, ahead: ahead.join(' · ') };
}

export function legendHtml(mode) {
  if (mode === 'reach') {
    return `<i style="background:var(--ok)"></i>안정<i style="background:var(--warn)"></i>불안정<i style="background:var(--bad)"></i>끊김` +
      `<br><span class="muted">지금 설치된 중계기 기준</span>`;
  }
  if (mode === 'relay') {
    const P = S.preview;
    const note = !P ? '계산 중…' : P.bb >= 0 ? `여기 중계기 → 착륙선 ${dB(P.bb)}` : '<span class="bad">여기서는 중계기가 착륙선과 이어지지 않음</span>';
    return `<i style="background:var(--new)"></i>새로 닿는 곳<i style="background:rgba(70,215,255,.45)"></i>안정해지는 곳<br>${note}`;
  }
  return '';
}

/** Turn the terrain overlay to `mode` ('none' | 'reach' | 'relay'); no transition animation. */
export function setOverlay(mode) {
  S.ui.display.overlay = mode;
  if (mode === 'relay') A.schedulePreview(true); else if (S.preview) A.clearPreview();
  scene.composeTexture();
}

/** Labels on lander / relays (distance from the astronaut) and the EVA's end point. */
export function fieldLabels() {
  const here = () => S.eva.samples[S.eva.idx];
  scene.setLabelFn((n) => {
    const s = here(), d = s ? Math.hypot(n.x - s.x, n.y - s.y) : NaN;
    if (n.type === 'lander') return { text: `착륙선<small>${dist(d)}</small>`, cls: '' };
    const i = S.net?.infra.indexOf(n) ?? -1, on = S.now ? S.now.on[i] : true;
    const st = on ? statusOf(S.now?.best[i] ?? S.net?.best[i]) : 'planned';
    return { text: `${n.name}${on ? '' : ' 예정'}<small>${dist(d)}</small>`, cls: st };
  });
  const end = S.eva.samples.at(-1);
  if (end) scene.setPois([{ id: 'target', x: end.x, y: end.y, text: () => { const s = here(); return `목표<small>${dist(s ? Math.hypot(end.x - s.x, end.y - s.y) : NaN)}</small>`; } }]);
}

/** Cross-section strips into `el` (one card per target). */
export function renderStrips(el, opts = {}) {
  const strips = S.strips || [];
  if (el.childElementCount !== strips.length || el.dataset.keys !== strips.map((s) => s.key).join()) {
    el.replaceChildren(...strips.map(() => h('div.strip', {}, h('div.strip-head', {}, h('b'), h('span.num')), h('canvas'))));
    el.dataset.keys = strips.map((s) => s.key).join();
  }
  strips.forEach((st, i) => {
    const card = el.children[i], [name, info] = card.firstChild.children;
    name.textContent = st.name;
    info.innerHTML = st.kind === 'target' ? dist(st.D) : `${dist(st.D)} · 직결 <span class="${statusOf(st.direct)}">${dB(st.direct, 0)}</span>`;
    drawStrip(card.lastChild, st, opts);
  });
}
