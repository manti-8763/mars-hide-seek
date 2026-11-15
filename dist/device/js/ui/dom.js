// Small DOM helpers shared by the three screens.
export { h } from '../core/util.js';
import { h } from '../core/util.js';

export const $ = (sel, root = document) => root.querySelector(sel);

/** Segmented buttons: one of `options` [[value, label]] is on. Returns {el, set(value)}. */
export function seg(options, value, onPick, cls = '') {
  const el = h(`div.seg${cls ? `.${cls}` : ''}`);
  const btns = options.map(([v, label]) => h('button', { type: 'button', 'data-v': v, onclick: () => { set(v); onPick(v); } }, label));
  el.append(...btns);
  const set = (v) => btns.forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  set(value);
  return { el, set };
}

/** On/off button. Returns {el, set(on)}. */
export function toggle(label, on, onFlip, labels = null) {
  const el = h('button.toggle', { type: 'button' });
  const set = (v) => { on = v; el.classList.toggle('on', v); el.textContent = labels ? labels[v ? 1 : 0] : label; el.setAttribute('aria-pressed', v); };
  el.onclick = () => { set(!on); onFlip(on); };
  set(on);
  return { el, set };
}

/** − value + stepper. Returns {el, set(v)}. */
export function stepper(value, min, max, onChange, fmt = (v) => v) {
  const val = h('span.step-val');
  const set = (v) => { value = Math.max(min, Math.min(max, v)); val.textContent = fmt(value); };
  const el = h('div.stepper', {},
    h('button', { type: 'button', 'aria-label': '줄이기', onclick: () => { set(value - 1); onChange(value); } }, '−'), val,
    h('button', { type: 'button', 'aria-label': '늘리기', onclick: () => { set(value + 1); onChange(value); } }, '+'));
  set(value);
  return { el, set };
}

/** Label + input row for settings forms (base screen). */
export function field(label, input, unit = '') {
  return h('label.field', {}, h('span.f-label', {}, label), input, unit ? h('span.f-unit', {}, unit) : null);
}
export function numInput(value, onChange, attrs = {}) {
  const i = h('input', { type: 'number', step: 'any', ...attrs }); i.value = value;
  i.onchange = () => onChange(+i.value);
  return i;
}
export function select(options, value, onChange) {
  const s = h('select', {}, ...options.map(([v, t]) => h('option', { value: v }, t))); s.value = value;
  s.onchange = () => onChange(s.value);
  return s;
}

/** Busy indicator bound to the 'busy' bus event. */
export function busyBar(bus, el) {
  const bar = h('div.bar', {}, h('div')), txt = h('span');
  el.append(bar, txt); el.hidden = true;
  bus.on('busy', ({ on, frac, text }) => { el.hidden = !on; bar.firstChild.style.width = `${Math.round(frac * 100)}%`; txt.textContent = text; });
}

export const km = (m, d = 2) => (Number.isFinite(m) ? `${(m / 1000).toFixed(d)} km` : '—');
export const dist = (m) => (!Number.isFinite(m) ? '—' : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
export const dB = (v, d = 1) => (Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)} dB` : v > 0 ? '∞' : '—');
