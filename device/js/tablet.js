// Wrist / tablet device: the astronaut's one-screen companion.
// Runs on its own; sets what the helmet shows, and shows the helmet's content itself whenever the helmet is cut off.
// Base sync is off until the astronaut turns it on here.
import { S, A, PH, bus } from './core/store.js';
import * as scene from './core/scene.js';
import { boot } from './ui/boot.js';
import { $, h, seg, toggle, stepper, busyBar, km, dist } from './ui/dom.js';
import { MODES, statusView, legendHtml, setOverlay, fieldLabels, renderStrips } from './ui/fieldview.js';
import { updateStrips } from './ui/field.js';
import { drawTimeline } from './ui/charts.js';

busyBar(bus, $('#busy'));
const link = await boot('tablet', {
  host: $('#view'),
  setup(S) {
    Object.assign(S.ui, { covStride: 6, covWin: 0, covNet: 'now', covAlpha: 0.5 });
    Object.assign(S.ui.display, { overlay: 'reach', routeWidth: 5 });
  },
});
$('#loading').remove();
// LEVEL 1 comparison: read a snapshot, keep the simulation's walking route independent.
if (new URLSearchParams(location.search).get('level1trial') === '1') {
  let trial = null;
  try { trial = JSON.parse(localStorage.getItem('mars-level1-tablet-trial')); } catch {}
  const validPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && S.T && S.meta && p[0]>=0 && p[1]>=0 && p[0] < S.meta.width*S.meta.res_m && p[1] < S.meta.height*S.meta.res_m;
  const note = document.createElement('section'); note.className='card'; note.style.cssText='padding:12px;margin:8px;background:#27372e;color:white;';
  if (trial?.version === 1 && [trial.base,trial.target,trial.relay].every(validPoint)) {
    A.clearRelays(); A.addNode('lander',...trial.base); A.addNode('relay',...trial.relay); A.addNode('astro',...trial.target);
    const radio=PH.resolveRadio(PH.PRESETS.sband);
    const describe=(a,b,ha,hb,i)=>{const v=PH.linkProfile(S.T,radio,...a,ha,...b,hb,S.T.res);const gap=Math.max(...Array.from(v.d,(d,k)=>v.zFlat[k]-(v.za+(v.zb-v.za)*d/v.D)).slice(1,-1));const visible=Number.isFinite(gap)&&gap<=0;return `게임 ${trial.margin[i].toFixed(1)} dB / 태블릿 ${v.margin.toFixed(1)} dB · 가시선 ${visible?'확보':'가림'} · LEVEL 1 ${visible&&v.margin>=3?'기준 충족':'기준 미달'}`;};
    note.innerHTML=`<strong>LEVEL 1 좌표 비교 시험판</strong><p>기지·선택 중계소·탐사 A를 지도에 표시했습니다. 아래 두 구간은 LEVEL 1과 같은 조건(가시선과 3 dB 이상)으로 비교합니다.</p><p>기지 → 중계소: ${describe(trial.base,trial.relay,4,3,0)}<br>중계소 → 탐사 A: ${describe(trial.relay,trial.target,3,2,1)}</p><p>중요: 화면의 걷기 경로·현재 위치·기타 수치는 별도 시뮬레이션의 정보입니다. 게임 진행이나 설치 결과와 자동 동기화되지 않습니다. 다른 위치는 미션으로 돌아가 선택한 뒤 다시 열어주세요.</p>`;
  } else { note.textContent='LEVEL 1 선택 정보가 없습니다. 게임에서 지점을 선택하고 태블릿 비교 버튼을 눌러주세요.'; }
  document.querySelector('.app').before(note);
}

fieldLabels();

// ---------------------------------------------------------------- helmet link: when it is down, this screen stands in
const hudUp = () => link.enabled('crew') && link.peerUp('hud');
function syncHudCard() {
  const up = hudUp();
  $('#hudCard').classList.toggle('alert', !up);
  $('#hudNote').textContent = up ? '헬멧에 바로 반영됩니다' : '헬멧 연결 끊김 — 이 화면에 표시';
  // map overlay: normally the reach map; mirrors the helmet's choice while the helmet is cut off
  const want = up ? 'reach' : S.hud.mode;
  if (S.ui.display.overlay !== want) setOverlay(want);
  $('#mapLegend').innerHTML = legendHtml(want);
  const showStrips = !up && S.hud.info;
  $('#stripsWrap').hidden = !showStrips;
  if (showStrips) updateStrips(true);
  drawTimelineNow();
}
const modeSeg = seg(MODES, S.hud.mode, (v) => { S.hud.mode = v; link.touch('hud'); syncHudCard(); });
$('#hudMode').append(modeSeg.el);
const infoTog = toggle('', S.hud.info, (on) => { S.hud.info = on; link.touch('hud'); syncHudCard(); }, ['단면 그래프 끔', '단면 그래프 켬']);
$('#hudInfo').append(infoTog.el);
bus.on('hud', () => { modeSeg.set(S.hud.mode); infoTog.set(S.hud.info); syncHudCard(); });
bus.on('preview', () => { if (S.ui.display.overlay === 'relay') $('#mapLegend').innerHTML = legendHtml('relay'); });
bus.on('strips', () => { if (!$('#stripsWrap').hidden) renderStrips($('#strips'), { fill: '#2a1e17' }); });

// ---------------------------------------------------------------- status bar + tiles
function tile(label) { const v = h('div.t-val'), el = h('div.tile', {}, v, h('div.t-lab', {}, label)); return { el, v }; }
const T = {
  rest: tile('남은 경로 통신 유지'), out: tile('다음 끊김'), next: tile('다음 중계기 설치'),
  relays: tile('설치한 중계기'), left: tile('남은 거리'), area: tile('지금 통신 가능 면적'),
};
$('#tiles').append(...Object.values(T).map((t) => t.el));
function drawStatus() {
  const v = statusView(); if (!v) return;
  const f = v.f;
  $('#linkNow').className = `link-now st-${v.cls}`;
  $('#nowDot').className = `dot ${f.m >= 0 ? 'up' : 'down'}`;
  $('#nowMargin').textContent = v.margin;
  $('#nowVia').textContent = v.via;
  $('#walk').innerHTML = `걸은 거리 <b>${(f.d / 1000).toFixed(2)}</b> / ${km(f.total)} · sol ${f.s.sol}`;
  const pct = (x) => `${x.toFixed(0)}<small>%</small>`;
  T.rest.v.innerHTML = pct(f.restOkPct); T.rest.v.className = `t-val ${f.restOkPct >= 95 ? 'ok' : f.restOkPct >= 80 ? 'warn' : 'bad'}`;
  T.out.v.innerHTML = f.m < 0 ? '<span class="bad">지금 끊김</span>' : Number.isFinite(f.outAhead) ? `${dist(f.outAhead)} <small>앞 · ${dist(f.outLen)}</small>` : '없음';
  T.next.v.innerHTML = f.next ? `${f.next.name} <small>${dist(f.next.ahead)} 앞</small>` : '<span class="muted">계획 없음</span>';
  T.relays.v.innerHTML = `${f.placed}<small> / ${f.planned}대</small>`;
  T.left.v.innerHTML = `${(f.left / 1000).toFixed(2)}<small> km</small>`;
  const c = S.stats.cov;
  T.area.v.innerHTML = c ? `${c.netKm2.toFixed(1)}<small> km² · 착륙선만의 ×${Number.isFinite(c.factor) ? c.factor.toFixed(1) : '—'}</small>` : '—';
  $('#relayNote').textContent = `설치 ${f.placed} · 계획 ${f.planned}`;
}
let lastDraw = 0;
bus.on('evaPos', () => {
  const now = performance.now();
  if (now - lastDraw > 200) { lastDraw = now; drawStatus(); drawTimelineNow(); }
  if (S.ui.display.overlay === 'relay') A.schedulePreview();
  if (!$('#stripsWrap').hidden) updateStrips();
});
for (const ev of ['eva', 'now', 'cov', 'net']) bus.on(ev, () => { drawStatus(); drawTimelineNow(); });

// ---------------------------------------------------------------- timeline
const tl = $('#timeline');
function drawTimelineNow() { drawTimeline(tl, { dimPast: true, compact: true }); }
new ResizeObserver(drawTimelineNow).observe(tl);

// ---------------------------------------------------------------- relays: auto placement, set one down here
const kStep = stepper(S.ui.opt.K, 1, 6, (v) => { S.ui.opt.K = v; }, (v) => `${v}대`);
$('#kStep').replaceWith(kStep.el);
$('#autoPlace').onclick = async () => {
  $('#autoPlace').disabled = true;
  try { await A.autoPlace(); } finally { $('#autoPlace').disabled = false; }
  const o = S.stats.opt;
  $('#optResult').innerHTML = !o ? S.out.opt :
    `${o.kept ? `설치한 ${o.kept}대는 그대로, ` : ''}새 중계기 <b>${o.relays}대</b> 계획 · 남은 경로 연결 <b>${o.after}/${o.targets}</b>점 (착륙선만 ${o.before}) · ${o.seconds.toFixed(1)} s` +
    (o.relays < S.ui.opt.K && o.after < o.targets ? `<br><span class="warn">요구 마진 ${S.req} dB로 착륙선과 이어지는 자리가 부족해 ${o.relays}대만 계획했습니다.</span>` : '');
};
$('#dropHere').onclick = () => {
  const n = A.addRelayHere();
  if (n) $('#optResult').innerHTML = `<b>${n.name}</b>를 ${km(S.eva.samples[S.eva.idx].d)} 지점에 설치했습니다.`;
};

// ---------------------------------------------------------------- base sync (off until the astronaut turns it on)
const baseTog = toggle('', false, (on) => { link.setEnabled('base', on); drawPeers(); }, ['기지 동기화 켜기', '기지 동기화 끄기']);
$('#baseToggle').append(baseTog.el);
function drawPeers() {
  const crew = link.enabled('crew'), hu = link.peerUp('hud');
  $('#peerHud .dot').className = `dot ${!crew ? 'off' : hu ? 'up' : 'down'}`;
  const bOn = link.enabled('base'), bUp = link.peerUp('base');
  $('#peerBase .dot').className = `dot ${!bOn ? 'off' : bUp ? 'up' : 'down'}`;
  $('#baseNote').textContent = !bOn ? '꺼짐 · 기지와 주고받지 않음' : bUp ? '켜짐 · 기지와 연결됨' : '켜짐 · 기지 응답 기다리는 중';
  syncHudCard();
}
link.onChange(drawPeers);

// ---------------------------------------------------------------- simulation controls
const play = $('#play');
const syncPlay = () => { play.textContent = S.eva.playing ? '⏸ 멈춤' : '▶ 걷기'; };
play.onclick = () => { A.togglePlay(); syncPlay(); link.touch('walk'); };
$('#reset').onclick = () => { S.eva.playing = false; A.resetEva(); syncPlay(); link.touch('walk'); };
bus.on('evaState', syncPlay);
const speed = seg([['20', '×20'], ['60', '×60'], ['200', '×200']], String(S.ui.eva.speed), (v) => { S.ui.eva.speed = +v; link.touch('walk'); });
$('#speed').replaceWith(speed.el);
bus.on('evaState', () => speed.set(String(S.ui.eva.speed)));
const hudLink = toggle('', false, (cut) => { link.setEnabled('crew', !cut); drawPeers(); }, ['헬멧 연결 끊어 보기 (시험)', '헬멧 연결 끊김 (시험 중) — 다시 연결']);
$('#hudLinkToggle').append(hudLink.el);

// ---------------------------------------------------------------- map buttons
$('#viewMe').onclick = () => { const s = S.eva.samples[S.eva.idx]; if (s) scene.focus(s.x, s.y, 3000); };
$('#viewAll').onclick = () => scene.focusAll();

drawPeers(); drawStatus();
setTimeout(() => $('#viewMe').click(), 200);
window.__sim = { S, A, bus, link };
