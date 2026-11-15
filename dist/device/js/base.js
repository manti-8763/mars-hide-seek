// Base situation board: heavy computation and every setting. It hears from the field only while the astronaut
// has base sync on, and sends a plan only when asked to ("현장에 계획 보내기").
import { S, A, PH, bus } from './core/store.js';
import * as scene from './core/scene.js';
import { nodeStatus } from './core/model.js';
import { getPlan, planKey, applyPlan, applyWalk } from './core/plan.js';
import { colorOf, fmt, statusOf } from './core/util.js';
import { boot } from './ui/boot.js';
import { $, h, seg, field, numInput, select, busyBar, km, dB } from './ui/dom.js';
import { drawTimeline, drawProfile, drawCovHist } from './ui/charts.js';
import { modeName } from './ui/fieldview.js';

busyBar(bus, $('#busy'));

// ---------------------------------------------------------------- link: what the field last told us, what we sent
let sent = null, sentKey = '', incoming = null;
const crew = { walkAt: null, hud: null };
const link = await boot('base', {
  host: $('#view'),
  setup(S) {
    Object.assign(S.ui, { covStride: 6, covWin: 0, covNet: 'plan', covAlpha: 0.5 });
    Object.assign(S.ui.display, { overlay: 'reach', showCorridor: true });
  },
  link: {
    get: { plan: () => sent },
    apply(group, data) {
      if (group === 'plan') {
        if (planKey() === sentKey) { applyPlan(data); sent = getPlan(); sentKey = planKey(); incoming = null; }
        else incoming = data;                      // keep our unsent edits; offer to load the field's plan
        drawSend(); return true;
      }
      if (group === 'walk') { applyWalk(data); crew.walkAt = performance.now(); drawCrew(); return true; }
      if (group === 'hud') { crew.hud = data; drawCrew(); return true; }
      return false;
    },
  },
});
sent = getPlan(); sentKey = planKey();
$('#loading').remove();

function drawSend() {
  const dirty = planKey() !== sentKey;
  $('#send').disabled = !dirty;
  $('#pull').hidden = !incoming;
  const n = $('#sendNote');
  n.className = `send-note ${dirty || incoming ? 'warn' : ''}`;
  n.textContent = incoming ? '현장에서 계획이 바뀌었습니다' : dirty ? '보내지 않은 변경이 있습니다' : '마지막으로 보낸 계획과 같음';
}
$('#send').onclick = () => {
  sent = getPlan(); sentKey = planKey(); incoming = null; link.touch('plan'); drawSend();
  if (!link.peerUp('tablet')) $('#sendNote').textContent = '보냄 · 현장에서 기지 동기화를 켜면 전달됩니다';
};
$('#pull').onclick = () => { const d = incoming; incoming = null; applyPlan(d); sent = getPlan(); sentKey = planKey(); drawSend(); };
for (const ev of ['net', 'radio', 'eva', 'plan']) bus.on(ev, drawSend);

// ---------------------------------------------------------------- field status (right)
function drawSync() {
  const up = link.peerUp('tablet'), seen = link.lastSeen('tablet');
  $('#sync .dot').className = `dot ${up ? 'up' : seen ? 'down' : 'off'}`;
  $('#syncText').textContent = up ? '현장 동기화 중' : seen ? `현장 연결 끊김 · 마지막 수신 ${ago(seen)}` : '현장 동기화 꺼짐 (우주비행사 기기에서 켬)';
}
const ago = (t) => { const s = (performance.now() - t) / 1000; return s < 60 ? `${Math.round(s)}초 전` : `${Math.round(s / 60)}분 전`; };
function drawCrew() {
  const up = link.peerUp('tablet'), body = $('#crewBody');
  $('#crewNote').textContent = up ? '실시간' : crew.walkAt ? `마지막 ${ago(crew.walkAt)}` : '';
  if (!crew.walkAt) {
    body.replaceChildren(h('div.crew-off', { html: '아직 현장 정보를 받지 못했습니다.<br>우주비행사가 손목 기기에서 <b>기지 동기화</b>를 켜면 위치와 설치 상황이 여기에 나옵니다.<br>그동안 아래 EVA 탭에서 경로를 직접 재생해 볼 수 있습니다.' }));
    return;
  }
  const E = S.eva, s = E.samples[E.idx], m = E.margins?.[E.idx], via = E.via?.[E.idx] ?? -1;
  const node = via >= 0 ? S.net.infra[via] : null;
  const row = (k, v) => h('div.crew-row', {}, h('span', {}, k), h('span', { html: v }));
  body.replaceChildren(
    h('div.crew-big', { class: `crew-big ${statusOf(m)}` }, m >= 0 ? dB(m) : '끊김'),
    row('연결', m >= 0 ? (node?.type === 'relay' ? `${node.name} 경유` : '착륙선 직결') : '끊김'),
    row('위치', `${km(s?.d)} / ${km(E.total)} · sol ${s?.sol ?? '—'}`),
    row('중계기', `설치 ${S.now?.count ?? 0} / 계획 ${S.net.infra.length - 1}대`),
    row('헬멧 표시', crew.hud ? `${modeName(crew.hud.mode)} · 단면 ${crew.hud.info ? '켬' : '끔'}` : '—'),
  );
}
link.onChange(() => { drawSync(); drawCrew(); });
setInterval(drawSync, 1000);
let lastCrew = 0;
bus.on('evaPos', () => { const t = performance.now(); if (crew.walkAt && t - lastCrew > 300) { lastCrew = t; drawCrew(); } });

// summary tiles
function tile(label) { const v = h('div.t-val'), el = h('div.tile', {}, v, h('div.t-lab', {}, label)); return { el, v }; }
const T = { area: tile('통신 가능 면적'), factor: tile('착륙선만일 때의'), ok: tile('EVA 통신 유지'), gap: tile('최장 끊김 구간') };
$('#tiles').append(...Object.values(T).map((t) => t.el));
function drawTiles() {
  const c = S.stats.cov, e = S.stats.eva;
  T.area.v.innerHTML = c ? `${c.netKm2.toFixed(1)}<small>km²</small>` : '—';
  T.factor.v.innerHTML = c && Number.isFinite(c.factor) ? `×${c.factor.toFixed(2)}` : '—';
  T.ok.v.innerHTML = e ? `${e.okPct.toFixed(1)}<small>%</small>` : '—';
  T.ok.v.className = `t-val ${e ? (e.okPct >= 95 ? 'ok' : e.okPct >= 80 ? 'warn' : 'bad') : ''}`;
  T.gap.v.innerHTML = e ? `${(e.longestKm * 1000).toFixed(0)}<small>m</small>` : '—';
}
bus.on('cov', drawTiles); bus.on('eva', drawTiles);

// node list
function drawNodes() {
  const list = $('#nodes'); list.replaceChildren();
  if (!S.net) return;
  for (const n of S.nodes) {
    const [m, txt] = nodeStatus(n);
    const c = n.type === 'lander' ? '#f0d48a' : m != null ? colorOf(m) : '#888';
    list.append(h(`div.node${S.selected === n.id ? '.sel' : ''}`, { onclick: (e) => { if (!e.target.closest('.x')) { A.select(n.id); showChart('profile'); } } },
      h('span.d', { style: `background:${c}` }), h('span', {}, n.name), h('span.m', {}, txt),
      n.type === 'lander' ? h('span') : h('button.x', { type: 'button', title: '삭제', onclick: () => A.removeNode(n.id) }, '✕')));
  }
}
bus.on('net', drawNodes);

// ---------------------------------------------------------------- settings (left, one tab at a time)
const TABS = [['place', '배치'], ['radio', '무선'], ['eva', 'EVA'], ['view', '표시']];
let tab = 'place';
const tabSeg = seg(TABS, tab, (v) => { tab = v; drawPanel(); });
$('#tabs').append(tabSeg.el);
const note = (key, ev) => { const d = h('div.note', { html: S.out[key] }); const off = bus.on(ev, () => (d.innerHTML = S.out[key])); offs.push(off); return d; };
let offs = [];
function drawPanel() {
  offs.forEach((f) => f()); offs = [];
  const p = $('#panel'); p.replaceChildren(...PANELS[tab]());
}
const PANELS = {
  place() {
    const o = S.ui.opt;
    const corr = field('경로에서 최대 거리', numInput(o.corridor, (v) => { o.corridor = v; scene.composeTexture(); }, { min: 0, step: 25 }), 'm');
    corr.hidden = o.site !== 'corridor';
    return [
      h('h3', {}, '중계기 자동 배치'),
      field('새로 놓을 개수', numInput(o.K, (v) => (o.K = v), { min: 1, max: 8, step: 1 }), '대'),
      field('설치 위치', select([['corridor', 'EVA 경로 근처'], ['grid', '지형 전체']], o.site, (v) => { o.site = v; corr.hidden = v !== 'corridor'; scene.composeTexture(); })),
      corr,
      field('후보 간격', numInput(o.spacing, (v) => (o.spacing = v), { min: 10, step: 50 }), 'm'),
      field('최대 설치 경사', numInput(o.slope, (v) => (o.slope = v), { step: 1 }), '°'),
      h('button.primary', { type: 'button', onclick: () => A.autoPlace() }, '자동 배치 실행'),
      note('opt', 'opt'),
      h('h3', {}, '직접 놓기'),
      h('p.hint', {}, '지도 왼쪽 위 도구에서 착륙선·중계기·삭제를 고른 뒤 지형을 누릅니다. 바꾼 계획은 위의 "현장에 계획 보내기"를 눌러야 현장에 갑니다.'),
      h('div.btnrow', {}, h('button', { type: 'button', onclick: () => { A.clearRelays(); A.recompute(); } }, '중계기 모두 지우기')),
    ];
  },
  radio() {
    const params = Object.entries(S.radio).filter(([k]) => k !== 'label' && k !== 'kind').map(([k, v]) => {
      const [name, unit] = PH.PARAM_INFO[k] || [k, ''];
      return field(name, numInput(v, (x) => A.setRadioParam(k, x)), unit);
    });
    const hgt = (label, key) => field(label, numInput(S.h[key], (v) => { S.h[key] = v; A.recompute(); }, { step: 0.5 }), 'm');
    return [
      h('h3', {}, '무선 방식'),
      field('방식', select(Object.entries(PH.PRESETS).map(([k, q]) => [k, q.label]), S.presetKey, (v) => { A.setPreset(v); drawPanel(); })),
      ...params,
      h('h3', {}, '안테나와 요구 마진'),
      hgt('착륙선 안테나', 'lander'), hgt('중계기 마스트', 'relay'), hgt('우주비행사 안테나', 'astro'),
      field('요구 페이드 마진', numInput(S.req, (v) => { S.req = v; A.recompute(); scene.composeTexture(); }, { step: 1 }), 'dB'),
      note('radio', 'radio'),
    ];
  },
  eva() {
    const e = S.ui.eva, sols = S.route.map((q) => q.sol);
    const sol = (label, key) => field(label, numInput(e[key], (v) => { e[key] = v; S.eva.idx = 0; A.computeEva(); }, { min: sols[0], max: sols.at(-1), step: 1 }));
    const play = h('button', { type: 'button', onclick: () => { A.togglePlay(); syncPlay(); } });
    const syncPlay = () => { play.textContent = S.eva.playing ? '⏸ 멈춤' : '▶ 경로 재생'; play.disabled = link.peerUp('tablet'); };
    syncPlay(); offs.push(bus.on('evaState', syncPlay), link.onChange(syncPlay));
    return [
      h('h3', {}, 'EVA 경로 (Curiosity 실제 경로)'),
      sol('시작 sol', 'sol0'), sol('끝 sol', 'sol1'),
      field('중계기 설치 시점', select([['walk', '걸으면서 설치'], ['pre', 'EVA 전에 모두 설치']], e.deploy, (v) => { e.deploy = v; A.computeEva(); })),
      note('eva', 'eva'),
      h('h3', {}, '경로 재생 (현장 동기화가 없을 때)'),
      h('div.btnrow', {}, play, h('button', { type: 'button', onclick: () => A.resetEva() }, '⟲ 처음')),
      field('재생 속도', numInput(e.speed, (v) => (e.speed = v), { min: 10, step: 10 }), 'm/s'),
      h('p.hint', {}, '아래 타임라인을 누르면 그 지점으로 이동합니다. 현장과 동기화 중에는 현장 위치를 따라갑니다.'),
    ];
  },
  view() {
    const d = S.ui.display;
    const range = (min, max, step, val, on) => { const r = h('input', { type: 'range', min, max, step }); r.value = val; r.oninput = () => on(+r.value); return r; };
    return [
      h('h3', {}, '통신 가능 영역 지도'),
      field('격자', select([['4', '32 m (정밀)'], ['6', '49 m'], ['10', '81 m (빠름)']], String(S.ui.covStride), (v) => { S.ui.covStride = +v; A.runCoverage(); })),
      field('표시 투명도', range(0, 0.9, 0.05, S.ui.covAlpha, (v) => { S.ui.covAlpha = v; scene.composeTexture(); })),
      note('cov', 'cov'),
      h('h3', {}, '3D 지도'),
      field('수직 과장', range(1, 4, 0.1, d.exag, (v) => { scene.setExag(v); scene.drawLinks(); A.updateProfile(); })),
      field('지표 텍스처', select([['ortho', 'HiRISE 정사영상'], ['elev', '고도 색상 + 음영']], d.texMode, (v) => { d.texMode = v; scene.composeTexture(); })),
      field('선택 링크의 Fresnel 타원체', select([['1', '표시'], ['0', '숨김']], d.showFresnel ? '1' : '0', (v) => { d.showFresnel = v === '1'; A.updateProfile(); })),
      h('h3', {}, '출처 · 라이선스'),
      h('div.note', { html: S.meta.sources.map((s) => `${s.what}<br>${s.credit} · <b>${s.license}</b>`).join('<br><br>') + '<br><br>3D 엔진: three.js r160 (MIT)' }),
    ];
  },
};

// ---------------------------------------------------------------- map tools + hover
const tools = seg([['view', '보기'], ['lander', '착륙선'], ['relay', '중계기'], ['delete', '삭제']], 'view', (v) => { S.mode = v; });
$('#tools').append(tools.el);
bus.on('hover', (p) => {
  $('#hover').innerHTML = p ? `${p.lat.toFixed(4)}°, ${p.lon.toFixed(4)}°E · 고도 ${p.z.toFixed(0)} m · 착륙선 직결 <span class="${statusOf(p.m)}">${fmt(p.m)} dB</span>` : '';
});

// ---------------------------------------------------------------- bottom chart
const CHARTS = [['timeline', 'EVA 마진 타임라인'], ['profile', '링크 단면'], ['covhist', '커버리지 분포']];
let chart = 'timeline', geo = null;
const chartSeg = seg(CHARTS, chart, (v) => showChart(v));
$('#chartTabs').append(chartSeg.el);
const cv = $('#chart');
function showChart(v) { chart = v; chartSeg.set(v); drawChart(); }
function drawChart() {
  $('#chartNote').textContent = chart === 'timeline' ? '색 막대: 중계망 · 회색 선: 착륙선 직결 · 흰 선: 현재 위치 · 파란 선: 설치 지점 (점선은 아직) · 누르면 이동' : '';
  if (chart === 'timeline') geo = drawTimeline(cv, {});
  else if (chart === 'profile') drawProfile(cv);
  else drawCovHist(cv);
}
cv.onclick = (e) => { if (chart !== 'timeline' || !geo) return; const r = cv.getBoundingClientRect(); A.seekEva((e.clientX - r.left - geo.pad.l) / geo.pw * geo.total); };
let lastChart = 0;
bus.on('evaPos', () => { const t = performance.now(); if (t - lastChart > 150 || !S.eva.playing) { lastChart = t; if (chart !== 'covhist') drawChart(); } });
for (const ev of ['eva', 'profile', 'cov', 'now']) bus.on(ev, drawChart);
new ResizeObserver(drawChart).observe(cv);

bus.on('ui', () => { if (!document.activeElement?.closest('#panel')) drawPanel(); });   // plan taken from the field
drawPanel(); drawNodes(); drawTiles(); drawSync(); drawCrew(); drawSend();
{ const w = A.evaWaypoints(), c = w[Math.floor(w.length / 2)]; if (c) scene.focus(c.x, c.y, 9000); }
window.__sim = { S, A, bus, link };
