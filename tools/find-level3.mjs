import {readFileSync} from 'node:fs';
import {makeTerrain, inside, linkProfile, resolveRadio, PRESETS} from '../integration/physics.mjs';
const meta=JSON.parse(readFileSync(new URL('../integration/data/meta.json',import.meta.url)));
const data=readFileSync(new URL('../integration/data/terrain_8m.f32',import.meta.url));
const T=makeTerrain(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),meta);
const R=resolveRadio(PRESETS.sband), step=8.096154845417505;
const base=[3500,3500], points=[];
for(let x=2000;x<=5000;x+=250)for(let y=3000;y<=7500;y+=250)if(inside(T,x,y))points.push([x,y]);
const cache=new Map();
function edge(a,b,ha,hb){const key=JSON.stringify([a,b,ha,hb]);if(cache.has(key))return cache.get(key);let v=linkProfile(T,R,...a,ha,...b,hb,step);let valid=[...v.zFlat,...v.d].every(Number.isFinite);let gap=Math.max(...Array.from(v.d,(d,i)=>v.zFlat[i]-(v.za+(v.zb-v.za)*d/v.D)).slice(1,-1));let result={clear:valid&&gap<=-2&&v.margin>=3,valid,margin:v.margin,block:gap};cache.set(key,result);return result;}
let possible=v=>v.valid&&v.block<=0&&v.margin>=3;
let oneHop=points.filter(p=>Math.hypot(p[0]-base[0],p[1]-base[1])>=250&&possible(edge(base,p,4,3)));
let candidates=points.filter(p=>Math.hypot(p[0]-base[0],p[1]-base[1])>=250&&edge(base,p,4,3).clear);
let found=null;
outer:for(const target of points){if(Math.hypot(target[0]-base[0],target[1]-base[1])<1200||!edge(base,target,4,2).valid||edge(base,target,4,2).clear)continue;let goalRelays=points.filter(p=>Math.hypot(p[0]-target[0],p[1]-target[1])>=250&&edge(p,target,3,2).clear);if(oneHop.some(p=>possible(edge(p,target,3,2))))continue;for(const a of candidates)for(const b of goalRelays){if(Math.hypot(a[0]-b[0],a[1]-b[1])<250)continue;let ab=edge(a,b,3,3);if(ab.clear){found={base,target,relays:[a,b],direct:edge(base,target,4,2),links:[edge(base,a,4,3),ab,edge(b,target,3,2)]};break outer;}}}
if(!found){console.log('조건을 만족하는 경로를 찾지 못했습니다.');process.exitCode=1;}else console.log(JSON.stringify({description:'로컬 좌표 (m), 북서쪽 원점, x 동쪽 / y 남쪽',step_m:step,antenna_m:{base:4,relay:3,target:2},preset:'교육용 S대역',...found},null,2));
