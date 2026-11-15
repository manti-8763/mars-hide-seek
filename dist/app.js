const $ = id => document.getElementById(id);
let selected=null, installed=false, busy=false, level=1;
const candidates=window.marsAdapter.candidates;
$('markers').innerHTML=candidates.map(c=>`<circle cx="${c.x}" cy="${c.y}" r="18" fill="#342c27" stroke="#f4ac78"/><text x="${c.x}" y="${c.y+5}" text-anchor="middle" fill="#fff">${c.id}</text>`).join('');
for(const c of candidates){const b=document.createElement('button');b.className='candidate';b.textContent=`후보지 ${c.id}`;b.onclick=()=>{if(installed||busy)return;selected=c.id;drawProfiles();drawCoordinateMap();document.querySelectorAll('.candidate').forEach(x=>x.setAttribute('aria-pressed',x===b));$('install').disabled=false;$('install').textContent=`${c.id}에 중계소 설치`;};b.setAttribute('aria-pressed','false');$('candidates').append(b);}
$('start').onclick=()=>{$('brief').hidden=true;$('game').hidden=false;$('legacy-layout').hidden=true;$('coordinate-panel').hidden=true;$('profile-panel').hidden=true;};
window.addEventListener('message', e=>{if(e.source!==$('level1-frame').contentWindow || e.origin!==location.origin)return;if(e.data?.type==='level4-result')$('integrated-next5').hidden=!e.data.success;if(e.data?.type==='level3-result')$('integrated-next4').hidden=!e.data.success;if(e.data?.type==='level-result'){if(e.data.level===1)$('integrated-next').hidden=!e.data.success;if(e.data.level===2)$('integrated-next3').hidden=!e.data.success;}});
$('integrated-next').onclick=()=>{$('integrated-next').hidden=true;$('level1-frame').src='integration/index.html?level=2';$('level1-integrated').scrollIntoView({behavior:'smooth'});};
$('integrated-next3').onclick=()=>{$('integrated-next3').hidden=true;$('level1-frame').src='integration/level3.html';$('level1-integrated').scrollIntoView({behavior:'smooth'});};
$('integrated-next4').onclick=()=>{$('integrated-next4').hidden=true;$('level1-frame').src='integration/level4.html';$('level1-integrated').scrollIntoView({behavior:'smooth'});};
$('integrated-next5').onclick=()=>{$('integrated-next5').hidden=true;$('level1-frame').src='integration/level5.html';$('level1-integrated').scrollIntoView({behavior:'smooth'});};
$('install').onclick=async()=>{if(!selected||installed||busy)return;busy=true;$('install').disabled=true;$('install').textContent='분석 중…';try{const r=await window.marsAdapter.analyze(selected, level);if(typeof r.baseToRelay!=='boolean'||typeof r.relayToTarget!=='boolean')throw new Error('분석 결과 형식을 확인해 주세요.');installed=true;$('remaining').textContent='0';const success=r.baseToRelay&&r.relayToTarget&&(level===1 || r.targetB.clear);const c=candidates.find(c=>c.id===selected);$('paths').innerHTML=[[90,300,c.x,c.y,r.baseToRelay],[c.x,c.y,580,230,r.relayToTarget],...(level===2?[[c.x,c.y,545,150,r.targetB.clear]]:[])].map(([x1,y1,x2,y2,ok])=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ok?'#8cd7b0':'#ff876c'}" stroke-width="3" stroke-dasharray="${ok?'0':'7 7'}"/>`).join('');$('result').hidden=false;$('result').innerHTML=`<small>실제 CSV 표본 · 평면 단면 시험</small><h2>${r.uncertain ? '분석 보류 · 고도값 불일치' : success ? '통신 경로 복구 성공' : '통신 경로 확보 실패'}</h2><p>${r.uncertain ? '고도 자료가 일치하지 않아 결과를 판단할 수 없습니다.' : success ? '미션에서 통신 경로를 복구했습니다. 고도 표본상 기지에서 목표까지 가시선이 이어집니다.' : '고도 표본상 하나 이상의 구간이 지형에 가려져 경로가 끊겼습니다. 다른 후보지로 다시 도전하세요.'}</p><p>기지 → 중계소: ${r.baseToRelay?'표본상 가림 없음':'표본상 가림'} / 중계소 → 마지막 확인 위치: ${r.relayToTarget?'표본상 가림 없음':'표본상 가림'}</p><p>동일 좌표 높이 차이: 중계소 ${r.relayDifference.toFixed(2)}m, 목표 ${r.targetDifference.toFixed(2)}m. 1m 초과 시 전체 판정을 보류합니다.</p><p>후보지 ${c.id} · 위도 ${c.point.Latitude.toFixed(5)}°, 경도 ${c.point.Longitude.toFixed(5)}°</p><p>직접 경로: ${r.direct.clear?'표본상 가림 없음':'표본상 가림'} · 첫 구간의 최대 돌출 ${r.leg1.maxAbove.toFixed(2)}m · 둘째 구간의 최대 돌출 ${r.leg2.maxAbove.toFixed(2)}m</p><p>MOLA 전 지구 고도값 사용 (적도 부근 약 463m 격자, 비보간). 기지와 목표 안테나 2m, 중계소 안테나 12m 가정. 고도 단위는 m로 가정하며 메타데이터 확인 필요. 곡률·전파 특성·표본 사이 지형은 제외했습니다. 지도 위치는 실제 좌표가 아닙니다.</p>`;if(level===2) $('result').insertAdjacentHTML('beforeend', `<p>중계소 → 탐사 지점 B: ${r.targetB.clear ? '표본상 가림 없음' : '표본상 가림'}</p>`); if(success && !r.uncertain) $('result').insertAdjacentHTML('beforeend', level===1 ? '<p>마지막 확인 위치까지 가시선 경로를 확보했습니다. 새로운 탐사 지점 B가 추가됩니다.</p>' : '<h3>LEVEL 2 COMPLETE</h3><p>중계소 하나로 두 탐사 지점까지의 가시선 경로를 확보했습니다. 더 먼 탐사 지역까지 통신망을 확장할 준비를 하세요.</p><button id="replay-mission" type="button">LEVEL 2 다시 플레이</button>'); if(level===2 && success && !r.uncertain) { $('replay-mission').onclick=()=>{ $('reset').click(); }; $('next-level3').hidden=false; } $('next-level').hidden=!(level===1 && success && !r.uncertain); $('install').textContent='중계소 배치 완료';}catch(e){$('result').hidden=false;$('result').textContent=`분석 실패: ${e.message}`;$('install').disabled=false;$('install').textContent='분석 다시 시도';}finally{busy=false;}};
$('next-level').onclick=()=>{ level=2; $('target-b').hidden=false; $('target-b').removeAttribute('hidden'); $('next-level').hidden=true; $('reset').click(); $('level-label').textContent='LEVEL 2 · DOUBLE SIGNAL'; $('level-story').textContent='이 레벨은 기존 MOLA 지형 표본을 사용합니다.'; $('level-story').textContent='새로운 탐사 지점 B가 추가되었습니다. 중계소 하나로 두 탐사 지점까지의 가시선 경로를 확보하세요.'; document.querySelector('aside h2').textContent='두 탐사 지점을 연결하세요.'; $('mission-route').textContent='기지 → 중계소 → 탐사 지점 A와 B'; };
$('reset').onclick=()=>{if(busy)return;$('next-level3').hidden=true;selected=null;installed=false;$('next-level').hidden=true;drawProfiles();drawCoordinateMap();$('remaining').textContent='1';$('result').hidden=true;$('paths').innerHTML='';$('install').disabled=true;$('install').textContent='후보지를 선택하세요';document.querySelectorAll('.candidate').forEach(b=>b.setAttribute('aria-pressed','false'));};

// 사용자 CSV의 실제 단면을 보여주는 독립 패널. 원본 경로는 서로 다른 끝점을 유지합니다.
const profilePanel=document.createElement('section');
profilePanel.id='profile-panel';
profilePanel.innerHTML='<small>DATA INSPECTOR / 실제 고도 표본</small><h2>선택한 후보지의 고도 단면</h2><p>기지와 목표는 2m, 중계소는 12m로 가정합니다. 후보지를 선택하면 해당하는 두 구간의 고도 단면이 표시됩니다.</p><div id="profile-plots"></div>';
$('game').append(profilePanel);
function drawProfiles() {
 const target = $('profile-plots');
 const candidate = candidates.find(item => item.id === selected);
 if (!candidate) {
  target.textContent = '후보지를 선택하면 그래프를 볼 수 있습니다.';
  return;
 }
 const segments = window.candidateProfiles[candidate.id];
 const profiles = [
  {title: '기지 → 후보지 ' + candidate.id, rows: segments[0], start: 2, end: 12},
  {title: '후보지 ' + candidate.id + ' → 탐사 지점 A', rows: segments[1], start: 12, end: 2}, ...(level===2 ? [{title: '후보지 ' + candidate.id + ' → 탐사 지점 B', rows: window.level2Profiles[candidate.id], start: 12, end: 2}] : [])
 ];
 target.innerHTML = profiles.map(({title, rows, start, end}) => {
  const key = 'MGS MOLA: Global DEM';
  const d0 = rows[0].Distance, span = rows.at(-1).Distance - d0;
  const a = rows[0][key] + start, b = rows.at(-1)[key] + end;
  const low = Math.min(...rows.map(row => row[key])) - 10;
  const high = Math.max(a, b, ...rows.map(row => row[key])) + 10;
  const x = t => 55 + 650 * t, y = z => 180 - 145 * (z - low) / (high - low);
  const points = rows.map(row => `${x((row.Distance-d0)/span)},${y(row[key])}`).join(' ');
  const analysis = inspectProfile(rows, start, end);
  const blocked = rows.slice(1,-1).map(row => {
   const t = (row.Distance-d0)/span;
   return row[key] > a+(b-a)*t ? `<circle cx="${x(t)}" cy="${y(row[key])}" r="3" fill="#ff846c"/>` : '';
  }).join('');
  return `<article class="profile-card"><h3>${title}</h3><p>${analysis.clear ? '표본상 가림 없음' : '표본상 가림'} · 최대 지형 돌출 ${analysis.maxAbove.toFixed(2)}m</p><svg viewBox="0 0 740 220" role="img" aria-label="${title} 고도 단면"><polyline points="${points}" fill="none" stroke="#f4ac78" stroke-width="2"/><line x1="55" y1="${y(a)}" x2="705" y2="${y(b)}" stroke="#96dcb7" stroke-dasharray="6 4" stroke-width="2"/>${blocked}</svg><p class="caption">주황: 지형 · 초록 점선: 안테나 사이 직선 · 빨간 점: 가리는 표본</p></article>`;
 }).join('');
}
drawProfiles();

// 각 CSV의 실제 좌표를 그대로 표시한다. 끝점은 결합하거나 재계산하지 않는다.
const coordinatePanel=document.createElement('section');
coordinatePanel.id='coordinate-panel';
coordinatePanel.innerHTML='<small>COORDINATE CHECK / 좌표 확인</small><h2>세 경로의 실제 좌표</h2><p>Gale Crater의 CTX 표면 영상 위에 CSV 위도·경도를 표시했습니다. 끝점은 원본 좌표를 유지합니다.</p><div id="coordinate-map"></div><p class="caption">주황색 선은 기지와 탐사 지점을 잇는 경로입니다. 하늘색 선은 선택한 후보지를 경유하는 경로입니다.</p><div id="coordinate-table"></div>';
$('profile-panel').before(coordinatePanel);
const profileNames={'2':'직접','3':'기지 → 후보','4':'후보 → 목표'};
const colors={'2':'#f4ac78','3':'#8ed1ef','4':'#caafff'};
const all=[...Object.values(window.marsProfiles).flat(), ...Object.values(window.candidateProfiles).flat(2), ...Object.values(window.level2Profiles).flat()];
const minLon=Math.min(...all.map(r=>r.Longitude)),maxLon=Math.max(...all.map(r=>r.Longitude));
const minLat=Math.min(...all.map(r=>r.Latitude)),maxLat=Math.max(...all.map(r=>r.Latitude));
const px=lon=>55+600*(lon-minLon)/(maxLon-minLon),py=lat=>350-300*(lat-minLat)/(maxLat-minLat);
const tileDegrees=360/4096;
const galeTiles=[[1076, 3610], [1076, 3611], [1076, 3612], [1076, 3613], [1077, 3610], [1077, 3611], [1077, 3612], [1077, 3613]];
function drawCoordinateMap() {
 const rows = window.directProfile;
 const candidate = candidates.find(item => item.id === selected);
 const points = rows.map(row => `${px(row.Longitude)},${py(row.Latitude)}`).join(' ');
 const tiles = galeTiles.map(([row,col]) => {
  const west=-180+col*tileDegrees, north=90-row*tileDegrees;
  return `<image href="data/gale/${row}-${col}.png" x="${px(west)-55}" y="${py(north)-50}" width="${px(west+tileDegrees)-px(west)}" height="${py(north-tileDegrees)-py(north)}" preserveAspectRatio="none"/>`;
 }).join('');
 const candidatePath = candidate ? window.candidateProfiles[candidate.id].map(segment => `<polyline points="${segment.map(row => `${px(row.Longitude)},${py(row.Latitude)}`).join(' ')}" fill="none" stroke="#8ed1ef" stroke-width="3"/>`).join('') : '';
 const targetB = window.level2Profiles['A'].at(-1);
 const targetBMarker = level === 2 ? `<circle cx="${px(targetB.Longitude)}" cy="${py(targetB.Latitude)}" r="7" fill="#caaaff" stroke="#fff" stroke-width="2"/><text x="${px(targetB.Longitude)+10}" y="${py(targetB.Latitude)-10}" fill="white">탐사 B</text>` : '';
 const targetBPath = candidate && level===2 ? `<polyline points="${window.level2Profiles[candidate.id].map(row => `${px(row.Longitude)},${py(row.Latitude)}`).join(' ')}" fill="none" stroke="#caaaff" stroke-width="3"/><text x="${px(window.level2Profiles[candidate.id].at(-1).Longitude)+5}" y="${py(window.level2Profiles[candidate.id].at(-1).Latitude)}" fill="white">B</text>` : '';
 const marker = candidate ? `<circle cx="${px(candidate.point.Longitude)}" cy="${py(candidate.point.Latitude)}" r="8" fill="#f4ac78" stroke="#fff" stroke-width="2"/><text x="${px(candidate.point.Longitude)+10}" y="${py(candidate.point.Latitude)-10}" fill="#fff" font-size="16">${candidate.id}</text>` : '';
 $('coordinate-map').innerHTML = `<svg viewBox="0 0 710 400" role="img" aria-label="선택한 후보지와 실제 화성 표면"><svg x="55" y="50" width="600" height="300" overflow="hidden">${tiles}</svg><polyline points="${points}" fill="none" stroke="#f4ac78" stroke-width="3"/>${candidatePath}${targetBPath}${marker}${targetBMarker}</svg>`;
 $('coordinate-table').textContent = candidate ? `후보지 ${candidate.id} · 위도 ${candidate.point.Latitude.toFixed(6)}°, 경도 ${candidate.point.Longitude.toFixed(6)}°` : '후보지를 선택하면 위치와 좌표가 표시됩니다.';
}

drawCoordinateMap();



// Local testing shortcut: never displayed on the hosted website.
{
 const panel=document.createElement('section');
 panel.id='developer-levels';
 panel.style.cssText='margin:20px 0;padding:16px;background:#2c3228;border:1px solid #82946c';
 panel.innerHTML='<strong>테스트용 · 레벨 바로 이동</strong><p>레벨을 자유롭게 살펴볼 수 있습니다. 이동하면 현재 레벨의 진행 상태가 초기화됩니다. LEVEL 5는 LEVEL 4를 완료하지 않으면 테스트용 배치를 사용합니다.</p><div style="display:flex;gap:8px;flex-wrap:wrap"></div>';
 const paths=['integration/index.html','integration/index.html?level=2','integration/level3.html','integration/level4.html','integration/level5.html'];
 paths.forEach((path,i)=>{const button=document.createElement('button');button.type='button';button.className='candidate';button.textContent=`LEVEL ${i+1}`;button.onclick=()=>{document.getElementById('brief').hidden=true;const game=document.getElementById('game');game.hidden=false;for(const child of game.children)child.hidden=child.id!=='level1-integrated';const panel=document.getElementById('level1-integrated');panel.hidden=false;for(const id of ['integrated-next','integrated-next3','integrated-next4','integrated-next5'])document.getElementById(id).hidden=true;document.getElementById('level1-frame').src=path;panel.scrollIntoView({behavior:'smooth',block:'start'});};panel.querySelector('div').append(button)});
 document.getElementById('brief').before(panel);
}
