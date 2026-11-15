import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeTerrain,linkProfile} from '../integration/physics.mjs';
import {siteCost,missionBudget,scienceRadio} from '../integration/science.mjs';
const flat={res:8,w:20,h:20,z:new Float32Array(400)};
assert.equal(siteCost(flat,[80,80]).minutes,8);
assert.equal(missionBudget(flat,[[60,60],[80,80]],'summary').total,36);
for(let y=0;y<20;y++)for(let x=0;x<20;x++)flat.z[y*20+x]=x*8;
assert.equal(siteCost(flat,[80,80]).minutes,22);
assert.equal(missionBudget(flat,[[60,60],[80,80]],'video').ok,false);
assert.equal(missionBudget(flat,[[60,60]],'summary').ok,true);
const bytes=fs.readFileSync(new URL('../integration/data/terrain_8m.f32',import.meta.url));
const t=makeTerrain(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),JSON.parse(fs.readFileSync(new URL('../integration/data/meta.json',import.meta.url))));
let found={};
for(const mode of ['video','summary']){
 const r=scienceRadio(mode),ok=(a,b,h1,h2)=>linkProfile(t,r,...a,h1,...b,h2,t.res).margin>=3;
 for(let x=1600;x<=3900&&!found[mode];x+=100)for(let y=3100;y<=4900&&!found[mode];y+=100){const p=[x,y];if(missionBudget(t,[p],mode).ok&&ok([3500,3500],p,4,3)&&ok(p,[1700,3500],3,2)&&ok(p,[2400,4100],3,2))found[mode]={p,budget:missionBudget(t,[p],mode)};}
 assert.ok(found[mode],mode+' needs a feasible mission');
}
assert.ok(Math.abs(scienceRadio('video').req-scienceRadio('summary').req-10)<1e-9);
console.log('Science budget, slope, radio tradeoff and real-terrain feasibility passed',found);
