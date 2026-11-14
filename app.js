const $ = id => document.getElementById(id);
let selected=null, installed=false, busy=false;
const candidates=window.marsAdapter.candidates;
$('markers').innerHTML=candidates.map(c=>`<circle cx="${c.x}" cy="${c.y}" r="18" fill="#342c27" stroke="#f4ac78"/><text x="${c.x}" y="${c.y+5}" text-anchor="middle" fill="#fff">${c.id}</text>`).join('');
for(const c of candidates){const b=document.createElement('button');b.className='candidate';b.textContent=`후보지 ${c.id}`;b.onclick=()=>{if(installed||busy)return;selected=c.id;document.querySelectorAll('.candidate').forEach(x=>x.setAttribute('aria-pressed',x===b));$('install').disabled=false;$('install').textContent=`${c.id}에 중계소 설치`;};b.setAttribute('aria-pressed','false');$('candidates').append(b);}
$('start').onclick=()=>{$('brief').hidden=true;$('game').hidden=false;};
$('install').onclick=async()=>{if(!selected||installed||busy)return;busy=true;$('install').disabled=true;$('install').textContent='분석 중…';try{const r=await window.marsAdapter.analyze(selected);if(typeof r.baseToRelay!=='boolean'||typeof r.relayToTarget!=='boolean')throw new Error('분석 결과 형식을 확인해 주세요.');installed=true;$('remaining').textContent='0';const success=r.baseToRelay&&r.relayToTarget;const c=candidates.find(c=>c.id===selected);$('paths').innerHTML=[[90,300,c.x,c.y,r.baseToRelay],[c.x,c.y,580,230,r.relayToTarget]].map(([x1,y1,x2,y2,ok])=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ok?'#8cd7b0':'#ff876c'}" stroke-width="3" stroke-dasharray="${ok?'0':'7 7'}"/>`).join('');$('result').hidden=false;$('result').innerHTML=`<small>실제 CSV 표본 · 평면 단면 시험</small><h2>구간별 고도 표본 분석</h2><p>기지 → 중계소: ${r.baseToRelay?'표본상 가림 없음':'표본상 가림'} / 중계소 → 마지막 확인 위치: ${r.relayToTarget?'표본상 가림 없음':'표본상 가림'}</p><p>전체 경로 연결 여부는 미확정입니다. 기지·목표 끝점은 약 20m, 중계소 끝점은 약 29m씩 다릅니다. 좌표를 임의로 합치지 않았습니다.</p><p>직접 경로: ${r.direct.clear?'표본상 가림 없음':'표본상 가림'} · 첫 구간의 최대 돌출 ${r.leg1.maxAbove.toFixed(2)}m · 둘째 구간의 최대 돌출 ${r.leg2.maxAbove.toFixed(2)}m</p><p>HiRISE 열 사용, 양 끝 안테나 높이 2m 가정. 고도 단위는 m로 가정하며 메타데이터 확인 필요. 곡률·전파 특성·표본 사이 지형은 제외했습니다. 지도 위치는 실제 좌표가 아닙니다.</p>`;$('install').textContent='중계소 배치 완료';}catch(e){$('result').hidden=false;$('result').textContent=`분석 실패: ${e.message}`;$('install').disabled=false;$('install').textContent='분석 다시 시도';}finally{busy=false;}};
$('reset').onclick=()=>{if(busy)return;selected=null;installed=false;$('remaining').textContent='1';$('result').hidden=true;$('paths').innerHTML='';$('install').disabled=true;$('install').textContent='후보지를 선택하세요';document.querySelectorAll('.candidate').forEach(b=>b.setAttribute('aria-pressed','false'));};

// 사용자 CSV의 실제 단면을 보여주는 독립 패널. 원본 경로는 서로 다른 끝점을 유지합니다.
const profilePanel=document.createElement('section');
profilePanel.id='profile-panel';
profilePanel.innerHTML='<small>DATA INSPECTOR / 실제 고도 표본</small><h2>무엇이 가시선을 가릴까요?</h2><p>지형선과 안테나를 잇는 직선을 비교해 보세요. 가로축은 경로 진행률입니다. 지도와 다른 실제 CSV 단면을 보여줍니다.</p><label for="antenna-height">양 끝 안테나 높이 (m 가정): </label><input id="antenna-height" type="number" min="0" max="100" step="1" value="2"><p>아래 높이 조절은 비교 실험용입니다. 위 미션 판정은 기존 2m 조건을 유지합니다.</p><div id="profile-plots"></div>';
$('game').append(profilePanel);
function drawProfiles(){
 const h=Number($('antenna-height').value);
 if(!Number.isFinite(h)||h<0||h>100){$('profile-plots').textContent='0~100 사이의 높이를 입력하세요.';return;}
 const names={'2':'직접 경로: 기지 → 목표','3':'구간 1: 기지 → 후보','4':'구간 2: 후보 → 목표'};
 $('profile-plots').innerHTML=Object.entries(names).map(([id,title])=>{
 const rows=window.marsProfiles[id],key='MRO HiRISE: Gale Crater DEM';
 const d0=rows[0].Distance,span=rows.at(-1).Distance-d0;
 const a=rows[0][key]+h,b=rows.at(-1)[key]+h;
 const low=Math.min(...rows.map(r=>r[key]))-10,high=Math.max(a,b,...rows.map(r=>r[key]))+10;
 const x=t=>55+650*t,y=z=>180-145*(z-low)/(high-low);
 const points=rows.map(r=>`${x((r.Distance-d0)/span)},${y(r[key])}`).join(' ');
 let maxGap=-Infinity;
 const blocked=rows.slice(1,-1).map(r=>{const t=(r.Distance-d0)/span,gap=r[key]-(a+(b-a)*t);maxGap=Math.max(maxGap,gap);return gap>0?`<circle cx="${x(t)}" cy="${y(r[key])}" r="3" fill="#ff846c"/>`:'';}).join('');
 return `<article class="profile-card"><h3>${title}</h3><p>${maxGap>0?'표본상 가림':'표본상 가림 없음'} · 최대 지형 돌출 ${maxGap.toFixed(2)}m</p><svg viewBox="0 0 740 220" role="img" aria-label="${title} 고도 단면"><line x1="55" y1="180" x2="705" y2="180" stroke="#657060"/><polyline points="${points}" fill="none" stroke="#f4ac78" stroke-width="2"/><line x1="55" y1="${y(a)}" x2="705" y2="${y(b)}" stroke="#96dcb7" stroke-dasharray="6 4" stroke-width="2"/>${blocked}<text x="55" y="207" fill="#ccc" font-size="12">시작 0%</text><text x="635" y="207" fill="#ccc" font-size="12">끝 100%</text></svg><p class="caption">주황: 지형 · 초록 점선: 안테나 사이 직선 · 빨간 점: 직선 위 표본<br>높이는 m로 가정. 세로축은 단면마다 다르고 과장되어 보입니다.</p><a href="data/ElevationProfile${id}.csv" download>원본 CSV 다운로드</a></article>`;
 }).join('');
}
$('antenna-height').addEventListener('input',drawProfiles);drawProfiles();
