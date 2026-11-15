// Helmet heads-up display.
// Works on its own with three suit buttons: 1 cycles the terrain overlay, 2 turns the strips on/off, 3 sets a relay
// down here (press twice — the first press only shows what it would do). The wrist device can set the overlay and
// strips remotely, and the walk (simulated position) runs locally when the wrist device is not there.
import { S, A, bus } from './core/store.js';
import { link as linkMargin } from './core/util.js';
import { boot } from './ui/boot.js';
import { $, seg, toggle, busyBar, dB } from './ui/dom.js';
import { MODES, modeName, statusView, legendHtml, setOverlay, fieldLabels, renderStrips } from './ui/fieldview.js';
import { updateStrips } from './ui/field.js';

const view = $('#view'), stripsEl = $('#strips');
busyBar(bus, $('#busy'));

const link = await boot('hud', {
  host: view, firstPerson: true,
  setup(S) {
    Object.assign(S.ui, { covStride: 3, covWin: 3000, covNet: 'now', covAlpha: 0.5 });
    Object.assign(S.ui.display, { smooth: true, routeWidth: 1.5, badAlpha: 255, overlay: S.hud.mode });
  },
});
$('#loading').remove();
fieldLabels();
setOverlay(S.hud.mode);
A.runCoverage();

// ---------------------------------------------------------------- HUD state (overlay mode, strips on/off)
function applyHudState() {
  if (S.ui.display.overlay !== S.hud.mode) setOverlay(S.hud.mode);
  $('#modeName').textContent = `지형: ${modeName(S.hud.mode)}`;
  $('#legend').innerHTML = legendHtml(S.hud.mode);
  stripsEl.hidden = !S.hud.info;
  if (S.hud.info) updateStrips(true);
  layoutStrips();
}
function layoutStrips() { document.documentElement.style.setProperty('--strip-h', S.hud.info && S.strips?.length ? `${stripsEl.offsetHeight}px` : '0px'); }
bus.on('hud', applyHudState);
bus.on('preview', () => { if (S.hud.mode === 'relay') $('#legend').innerHTML = legendHtml('relay'); });

const press = {
  overlay() { const i = MODES.findIndex((m) => m[0] === S.hud.mode); S.hud.mode = MODES[(i + 1) % MODES.length][0]; applyHudState(); link.touch('hud'); },
  info() { S.hud.info = !S.hud.info; applyHudState(); link.touch('hud'); },
};
$('#key1').onclick = press.overlay;
$('#key2').onclick = press.info;

// ---------------------------------------------------------------- button 3: set a relay down here (two presses)
// First press arms it and says what the relay would reach back to; a second press within 4 s sets it down.
let armed = 0, msgTimer = 0;
function say(html, cls = '') {
  const m = $('#hudMsg'); m.innerHTML = html; m.className = `hud-msg ${cls}`; m.hidden = false;
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { m.hidden = true; disarm(); }, 4000);
}
function disarm() { armed = 0; $('#key3').classList.remove('armed'); }
/** Best path from a relay at the astronaut's spot back to the lander through the relays already set down. */
function backboneHere() {
  const s = S.eva.samples[S.eva.idx], net = S.net, best = S.now?.best || net.best, here = { x: s.x, y: s.y, type: 'relay' };
  let bb = -Infinity;
  net.infra.forEach((n, i) => { if (best[i] >= 0) bb = Math.max(bb, Math.min(best[i], linkMargin(n, here))); });
  return bb;
}
press.drop = () => {
  if (!S.eva.samples[S.eva.idx] || !S.net) return;
  if (armed && performance.now() - armed < 4000) {
    disarm();
    const bb = backboneHere(), n = A.addRelayHere();
    if (n) say(`<b>${n.name}</b> 설치함 · 착륙선까지 ${bb >= 0 ? dB(bb) : '연결 안 됨'}`, bb >= 0 ? 'done' : 'warn');
    return;
  }
  armed = performance.now(); $('#key3').classList.add('armed');
  const bb = backboneHere();
  say(bb >= 0
    ? `여기에 중계기를 놓으면 착륙선까지 <b>${dB(bb)}</b><br><kbd>3</kbd>을 한 번 더 누르면 설치합니다`
    : `여기서는 중계기가 착륙선과 이어지지 않습니다<br>그래도 놓으려면 <kbd>3</kbd>을 한 번 더 누르세요`, bb >= S.req ? '' : 'warn');
};
$('#key3').onclick = press.drop;

// ---------------------------------------------------------------- status line + strips, following the walk
let lastStatus = 0;
function drawStatus() {
  const v = statusView(); if (!v) return;
  const st = $('#status');
  st.className = `hud-status st-${v.cls}`;
  $('#stDot').className = `dot ${v.f.m >= 0 ? 'up' : 'down'}`;
  $('#stMargin').textContent = v.margin;
  $('#stVia').textContent = v.via;
  $('#stAhead').innerHTML = v.ahead;
}
bus.on('evaPos', () => {
  const now = performance.now();
  if (now - lastStatus > 150) { lastStatus = now; drawStatus(); }
  if (S.hud.info) updateStrips();
  if (S.hud.mode === 'relay') A.schedulePreview();
});
bus.on('eva', drawStatus);
bus.on('now', drawStatus);
bus.on('strips', () => { if (S.hud.info) { renderStrips(stripsEl); layoutStrips(); } });
new ResizeObserver(() => { if (S.hud.info) renderStrips(stripsEl); layoutStrips(); }).observe(stripsEl);

// ---------------------------------------------------------------- simulation panel (stands in for really walking)
const simPanel = $('#simPanel');
$('#simBtn').onclick = () => { simPanel.hidden = !simPanel.hidden; };
const play = $('#simPlay');
const syncPlay = () => { play.textContent = S.eva.playing ? '⏸ 멈춤' : '▶ 걷기'; };
play.onclick = () => { A.togglePlay(); syncPlay(); link.touch('walk'); };
$('#simReset').onclick = () => { S.eva.playing = false; A.resetEva(); syncPlay(); link.touch('walk'); };
bus.on('evaState', syncPlay);
const SPEEDS = [['20', '×20'], ['60', '×60'], ['200', '×200']];
const speed = seg(SPEEDS, String(S.ui.eva.speed), (v) => { S.ui.eva.speed = +v; link.touch('walk'); });
$('#simSpeed').replaceWith(speed.el);
bus.on('evaState', () => speed.set(String(S.ui.eva.speed)));
const wrist = toggle('', false, (cut) => link.setEnabled('crew', !cut), ['손목 기기 연결 끊어 보기 (시험)', '연결 끊김 (시험 중) — 다시 연결']);
$('#simLink').append(wrist.el);

window.addEventListener('keydown', (e) => {
  if (e.target?.closest?.('input, select, textarea') || e.repeat) return;
  if (e.key === '1') press.overlay();
  else if (e.key === '2') press.info();
  else if (e.key === '3') press.drop();
  else if (e.code === 'Space') { e.preventDefault(); play.click(); }
});

// ---------------------------------------------------------------- wrist link indicator
const drawLink = () => {
  const on = link.enabled('crew'), up = link.peerUp('tablet');
  $('#wristDot').className = `dot ${!on ? 'off' : up ? 'up' : 'down'}`;
  $('#wristDot').parentElement.title = !on ? '연결 꺼짐 (시험)' : up ? '손목 기기와 연결됨' : '손목 기기 응답 없음 — 헬멧 단독으로 동작 중';
};
link.onChange(drawLink); drawLink();

applyHudState(); drawStatus();
window.__sim = { S, A, bus, link };
