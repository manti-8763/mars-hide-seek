const $ = id => document.getElementById(id);
let selected=null, installed=false, busy=false;
const candidates=window.marsAdapter.candidates;
$('markers').innerHTML=candidates.map(c=>`<circle cx="${c.x}" cy="${c.y}" r="18" fill="#342c27" stroke="#f4ac78"/><text x="${c.x}" y="${c.y+5}" text-anchor="middle" fill="#fff">${c.id}</text>`).join('');
for(const c of candidates){const b=document.createElement('button');b.className='candidate';b.textContent=`후보지 ${c.id}`;b.onclick=()=>{if(installed||busy)return;selected=c.id;drawProfiles();drawCoordinateMap();document.querySelectorAll('.candidate').forEach(x=>x.setAttribute('aria-pressed',x===b));$('install').disabled=false;$('install').textContent=`${c.id}에 중계소 설치`;};b.setAttribute('aria-pressed','false');$('candidates').append(b);}
$('start').onclick=()=>{$('brief').hidden=true;$('game').hidden=false;};
$('install').onclick=async()=>{if(!selected||installed||busy)return;busy=true;$('install').disabled=true;$('install').textContent='분석 중…';try{const r=await window.marsAdapter.analyze(selected);if(typeof r.baseToRelay!=='boolean'||typeof r.relayToTarget!=='boolean')throw new Error('분석 결과 형식을 확인해 주세요.');installed=true;$('remaining').textContent='0';const success=r.baseToRelay&&r.relayToTarget;const c=candidates.find(c=>c.id===selected);$('paths').innerHTML=[[90,300,c.x,c.y,r.baseToRelay],[c.x,c.y,580,230,r.relayToTarget]].map(([x1,y1,x2,y2,ok])=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ok?'#8cd7b0':'#ff876c'}" stroke-width="3" stroke-dasharray="${ok?'0':'7 7'}"/>`).join('');$('result').hidden=false;$('result').innerHTML=`<small>실제 CSV 표본 · 평면 단면 시험</small><h2>${success?'미션 성공 · 중계 경로 확보':'미션 실패 · 지형에 가려짐'}</h2><p>기지 → 중계소: ${r.baseToRelay?'표본상 가림 없음':'표본상 가림'} / 중계소 → 마지막 확인 위치: ${r.relayToTarget?'표본상 가림 없음':'표본상 가림'}</p><p>후보지 ${c.id} · 위도 ${c.point.Latitude.toFixed(5)}°, 경도 ${c.point.Longitude.toFixed(5)}°</p><p>직접 경로: ${r.direct.clear?'표본상 가림 없음':'표본상 가림'} · 첫 구간의 최대 돌출 ${r.leg1.maxAbove.toFixed(2)}m · 둘째 구간의 최대 돌출 ${r.leg2.maxAbove.toFixed(2)}m</p><p>MOLA 전 지구 고도값 사용 (적도 부근 약 463m 격자). 기지와 목표 안테나 2m, 중계소 안테나 12m 가정. 고도 단위는 m로 가정하며 메타데이터 확인 필요. 곡률·전파 특성·표본 사이 지형은 제외했습니다. 지도 위치는 실제 좌표가 아닙니다.</p>`;$('install').textContent='중계소 배치 완료';}catch(e){$('result').hidden=false;$('result').textContent=`분석 실패: ${e.message}`;$('install').disabled=false;$('install').textContent='분석 다시 시도';}finally{busy=false;}};
$('reset').onclick=()=>{if(busy)return;selected=null;installed=false;drawProfiles();drawCoordinateMap();$('remaining').textContent='1';$('result').hidden=true;$('paths').innerHTML='';$('install').disabled=true;$('install').textContent='후보지를 선택하세요';document.querySelectorAll('.candidate').forEach(b=>b.setAttribute('aria-pressed','false'));};

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
  {title: '후보지 ' + candidate.id + ' → 탐사 지점', rows: segments[1], start: 12, end: 2}
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
const all=[...Object.values(window.marsProfiles).flat(), ...Object.values(window.candidateProfiles).flat(2)];
const minLon=Math.min(...all.map(r=>r.Longitude)),maxLon=Math.max(...all.map(r=>r.Longitude));
const minLat=Math.min(...all.map(r=>r.Latitude)),maxLat=Math.max(...all.map(r=>r.Latitude));
const px=lon=>55+600*(lon-minLon)/(maxLon-minLon),py=lat=>350-300*(lat-minLat)/(maxLat-minLat);
const tileDegrees=360/4096;
const galeTiles=[[1076, 3610], [1076, 3611], [1076, 3612], [1076, 3613], [1077, 3610], [1077, 3611], [1077, 3612], [1077, 3613]];
function drawCoordinateMap() {
 const rows = window.marsProfiles['2'];
 const candidate = candidates.find(item => item.id === selected);
 const points = rows.map(row => `${px(row.Longitude)},${py(row.Latitude)}`).join(' ');
 const tiles = galeTiles.map(([row,col]) => {
  const west=-180+col*tileDegrees, north=90-row*tileDegrees;
  return `<image href="data/gale/${row}-${col}.png" x="${px(west)-55}" y="${py(north)-50}" width="${px(west+tileDegrees)-px(west)}" height="${py(north-tileDegrees)-py(north)}" preserveAspectRatio="none"/>`;
 }).join('');
 const candidatePath = candidate ? window.candidateProfiles[candidate.id].map(segment => `<polyline points="${segment.map(row => `${px(row.Longitude)},${py(row.Latitude)}`).join(' ')}" fill="none" stroke="#8ed1ef" stroke-width="3"/>`).join('') : '';
 const marker = candidate ? `<circle cx="${px(candidate.point.Longitude)}" cy="${py(candidate.point.Latitude)}" r="8" fill="#f4ac78" stroke="#fff" stroke-width="2"/><text x="${px(candidate.point.Longitude)+10}" y="${py(candidate.point.Latitude)-10}" fill="#fff" font-size="16">${candidate.id}</text>` : '';
 $('coordinate-map').innerHTML = `<svg viewBox="0 0 710 400" role="img" aria-label="선택한 후보지와 실제 화성 표면"><svg x="55" y="50" width="600" height="300" overflow="hidden">${tiles}</svg><polyline points="${points}" fill="none" stroke="#f4ac78" stroke-width="3"/>${candidatePath}${marker}</svg>`;
 $('coordinate-table').textContent = candidate ? `후보지 ${candidate.id} · 위도 ${candidate.point.Latitude.toFixed(6)}°, 경도 ${candidate.point.Longitude.toFixed(6)}°` : '후보지를 선택하면 위치와 좌표가 표시됩니다.';
}

drawCoordinateMap();
