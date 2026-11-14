const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');global.window={};
for(const f of ['candidate-profiles.js','level2-profiles.js','level3-profiles.js','adapter.js'])vm.runInThisContext(fs.readFileSync(path.join(root,f),'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root,'level3.js'),'utf8').split('const level3Selected')[0]);
for(const ids of [[],['A'],['B'],['C'],['B','C']])assert.equal(analyzeNetwork(ids).route,null);
assert.deepEqual(analyzeNetwork(['B','A']).route,['BASE','B','A','GOAL']);
assert.deepEqual(analyzeNetwork(['A','C']).route,['BASE','C','A','GOAL']);
assert.equal(analyzeNetwork(['A','B','C']).route.length,4);
const points={};
for(const e of analyzeNetwork([]).edges)for(const [id,row] of [[e.a,e.rows[0]],[e.b,e.rows.at(-1)]]){
 if(points[id])for(const key of ['Longitude','Latitude','MGS MOLA: Global DEM'])assert.ok(Math.abs(points[id][key]-row[key])<1e-6,`${id} ${key}`);
 points[id]=row;
}
assert.notEqual(points.GOAL.Latitude,window.level2Profiles.A.at(-1).Latitude);
Promise.all(['A','B','C'].map(async id=>{for(const level of [1,2]){const r=await window.marsAdapter.analyze(id,level);assert.equal(r.uncertain,false);if(id==='C')assert.ok(r.baseToRelay&&r.relayToTarget&&(level===1||r.targetB.clear));}})).then(()=>console.log('PASS: all 8 level 3 layouts, shared coordinates/elevations, new target, level 1/2 regressions'));
