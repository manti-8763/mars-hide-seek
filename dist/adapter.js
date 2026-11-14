// 고도와 안테나 높이 단위는 m로 가정. 단위/원본 DEM 메타데이터 검증 필요.
// 평면 단면 표본 검사: 곡률, 굴절, 프레넬 영역, 표본 사이 지형 제외.
function inspectProfile(rows, startHeight = 2, endHeight = startHeight) {
 const key='MGS MOLA: Global DEM';
 const first=rows[0],last=rows.at(-1),span=last.Distance-first.Distance;
 if(!(span>0)||rows.some(r=>!Number.isFinite(r[key])||!Number.isFinite(r.Distance)))throw new Error('유효하지 않은 고도 자료');
 const gaps=rows.slice(1,-1).map(r=>r[key]-(first[key]+startHeight+(last[key]+endHeight-first[key]-startHeight)*(r.Distance-first.Distance)/span));
 const maxAbove=Math.max(...gaps);
 return {clear:maxAbove<=0,maxAbove};
}
const missionProfile = window.directProfile;
const relayHeight = 12;
const missionCandidates = Object.entries(window.candidateProfiles).map(([id, segments]) => {
 const point = segments[0].at(-1);
 const base = missionProfile[0], target = missionProfile.at(-1);
 return {id, point, x: 90+490*(point.Longitude-base.Longitude)/(target.Longitude-base.Longitude), y: 300-700*(point.Latitude-base.Latitude)};
});

window.marsAdapter = {
 candidates: missionCandidates,
 async analyze(id, level = 1) {
  const candidate = missionCandidates.find(item => item.id === id);
  if (!candidate) throw new Error('자료가 없는 후보지입니다.');
  const direct = inspectProfile(missionProfile);
  const elevationKey = 'MGS MOLA: Global DEM';
  const segments = window.candidateProfiles[id];
  const relayDifference = Math.abs(segments[0].at(-1)[elevationKey] - segments[1][0][elevationKey]);
  const targetDifference = Math.abs(segments[1].at(-1)[elevationKey] - missionProfile.at(-1)[elevationKey]);
  const uncertain = relayDifference > 1 || targetDifference > 1;
  const leg1 = inspectProfile(window.candidateProfiles[id][0], 2, relayHeight);
  const leg2 = inspectProfile(window.candidateProfiles[id][1], relayHeight, 2);
  const targetB = level === 2 ? inspectProfile(window.level2Profiles[id], relayHeight, 2) : null;
  const targetBRelayDifference = targetB ? Math.abs(window.level2Profiles[id][0][elevationKey] - segments[0].at(-1)[elevationKey]) : 0;
  return {baseToRelay:leg1.clear, relayToTarget:leg2.clear, targetB, direct, leg1, leg2, uncertain: uncertain || targetBRelayDifference > 1, relayDifference, targetDifference};
 }
};
