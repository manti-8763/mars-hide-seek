// 고도와 안테나 높이 단위는 m로 가정. 단위/원본 DEM 메타데이터 검증 필요.
// 평면 단면 표본 검사: 곡률, 굴절, 프레넬 영역, 표본 사이 지형 제외.
function inspectProfile(rows) {
 const key='MRO HiRISE: Gale Crater DEM';
 const first=rows[0],last=rows.at(-1),span=last.Distance-first.Distance;
 if(!(span>0)||rows.some(r=>!Number.isFinite(r[key])||!Number.isFinite(r.Distance)))throw new Error('유효하지 않은 고도 자료');
 const gaps=rows.slice(1,-1).map(r=>r[key]-(first[key]+2+(last[key]-first[key])*(r.Distance-first.Distance)/span));
 const maxAbove=Math.max(...gaps);
 return {clear:maxAbove<=0,maxAbove};
}
window.marsAdapter={
 candidates:[{id:'A',x:340,y:70}],
 async analyze(id){
 if(id!=='A')throw new Error('자료가 없는 후보지입니다.');
 const direct=inspectProfile(window.marsProfiles['2']),leg1=inspectProfile(window.marsProfiles['3']),leg2=inspectProfile(window.marsProfiles['4']);
 return {baseToRelay:leg1.clear,relayToTarget:leg2.clear,mode:'sampled',direct,leg1,leg2};
 }
};
