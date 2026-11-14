// Undirected sampled line-of-sight graph; every edge retains its source profile.
function analyzeNetwork(ids) {
 const edges=[];
 const add=(a,b,rows,h1,h2)=>edges.push({a,b,rows,h1,h2,...inspectProfile(rows,h1,h2)});
 add('BASE','GOAL',window.level3Direct,2,2);
 for(const id of ['A','B','C']) {
  add('BASE',id,window.candidateProfiles[id][0],2,12);
  add(id,'GOAL',window.level3Targets[id],12,2);
 }
 for(const key of ['AB','AC','BC'])add(key[0],key[1],window.relayProfiles[key],12,12);
 const allowed=new Set(['BASE','GOAL',...ids]), queue=[['BASE']],seen=new Set(['BASE']);
 let route=null;
 while(queue.length){const path=queue.shift(),last=path.at(-1);if(last==='GOAL'){route=path;break;}for(const e of edges){if(!e.clear||!allowed.has(e.a)||!allowed.has(e.b))continue;const next=e.a===last?e.b:e.b===last?e.a:null;if(next&&!seen.has(next)){seen.add(next);queue.push([...path,next]);}}}
 return {edges,route,seen};
}
const level3Selected=new Set();
const names={BASE:'기지',A:'중계소 A',B:'중계소 B',C:'중계소 C',GOAL:'새 탐사 지점 D'};
const positions={BASE:[75,320],B:[230,350],C:[535,320],A:[240,130],GOAL:[470,70]};
function paintLevel3(checked=false){
 const {edges,route,seen}=analyzeNetwork([...level3Selected]);
 const active=new Set(['BASE','GOAL',...level3Selected]);
 const goal=window.level3Direct.at(-1);
 $('level3-source').textContent=`새 탐사 지점 D: 위도 ${goal.Latitude.toFixed(5)}°, 경도 ${goal.Longitude.toFixed(5)}° · 자료 취득 2026-11-14`;
 $('level3-count').textContent=`설치 ${level3Selected.size} / 3개 · 남은 장비 ${3-level3Selected.size}개`;
 $('level3-check').disabled=!level3Selected.size;
 document.querySelectorAll('[data-relay]').forEach(b=>{const on=level3Selected.has(b.dataset.relay);b.setAttribute('aria-pressed',String(on));b.textContent=`${b.dataset.relay} ${on?'철거':'설치'}`;});
 const visible=edges.filter(e=>active.has(e.a)&&active.has(e.b));
 $('level3-map').innerHTML=`<svg viewBox="0 0 700 430" role="img" aria-label="새 탐사 지점 D와 중계소 A B C의 연결 개념도"><defs><pattern id="l3-grid" width="35" height="35" patternUnits="userSpaceOnUse"><path d="M35 0H0V35" fill="none" stroke="#ffffff10"/></pattern></defs><rect width="700" height="430" fill="url(#l3-grid)"/>${visible.map(e=>{const a=positions[e.a],b=positions[e.b];return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${e.clear?'#8cd7b0':'#ff876c'}" stroke-width="3" stroke-dasharray="${e.clear?'0':'7 7'}"/>`;}).join('')}${Object.entries(positions).map(([id,[x,y]])=>`<circle cx="${x}" cy="${y}" r="16" fill="${active.has(id)?'#f4ac78':'#323c2e'}" stroke="${seen.has(id)?'#8cd7b0':'#c0b9aa'}" stroke-width="3"/><text x="${x}" y="${y-27}" text-anchor="middle" fill="#fff" font-size="16">${names[id]}</text>`).join('')}</svg>`;
 $('level3-links').innerHTML=visible.map(e=>`<li>${names[e.a]} → ${names[e.b]}: <strong>${e.clear?'가시선 확보':'지형에 가림'}</strong></li>`).join('');
 $('level3-result').hidden=!checked;
 $('level3-result').innerHTML=checked?(route?`<h2>LEVEL 3 COMPLETE</h2><p>${route.map(id=>names[id]).join(' → ')}</p><p>설치 ${level3Selected.size}개 · 연결 경로에 사용 ${route.length-2}개</p><p>장비 효율 점수 ${Math.round((route.length-2)/level3Selected.size*100)} / 100 — 경로에 사용한 장비 ÷ 설치한 장비</p><p>새 지역까지 경로를 확보했습니다. 다음은 두 탐사팀을 동시에 지원하는 미션입니다.</p><button id="go-level4">LEVEL 4 시작 →</button><button id="restart-all">LEVEL 1부터 다시 플레이</button>`:`<h2>아직 경로가 끊겨 있습니다</h2><p>기지에서 연결된 지점: ${[...seen].map(id=>names[id]).join(', ')}. 다른 중계소를 추가하거나 배치를 바꿔 보세요.</p>`):'';
 if($('go-level4'))$('go-level4').onclick=()=>startExtra(4);
 if($('restart-all'))$('restart-all').onclick=()=>location.reload();
}
for(const id of ['A','B','C']){const b=document.createElement('button');b.className='candidate';b.dataset.relay=id;b.onclick=()=>{level3Selected.has(id)?level3Selected.delete(id):level3Selected.add(id);paintLevel3();};$('level3-candidates').append(b);}
$('next-level3').onclick=()=>{level=3;for(const child of $('game').children)child.hidden=child.id!=='level3-panel';paintLevel3();$('level3-panel').scrollIntoView({behavior:'smooth'});};
$('level3-reset').onclick=()=>{level3Selected.clear();paintLevel3();};
$('level3-check').onclick=()=>{paintLevel3(true);$('level3-result').scrollIntoView({behavior:'smooth',block:'nearest'});};
