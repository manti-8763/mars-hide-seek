// 주원님 통합 지점: 후보지 목록과 analyze 함수를 실제 지도/분석 모듈로 교체합니다.
// 좌표는 임시 SVG 화면 좌표이며 실제 경위도가 아닙니다.
window.marsAdapter = {
  candidates: [{id:'A',x:270,y:310},{id:'B',x:390,y:65},{id:'C',x:510,y:350}],
  async analyze(id) {
    const examples = {A:[true,false], B:[true,true], C:[false,true]};
    if (!examples[id]) throw new Error('알 수 없는 후보지입니다.');
    const [baseToRelay, relayToTarget] = examples[id];
    return {baseToRelay,relayToTarget,mode:'mock'};
  }
};
