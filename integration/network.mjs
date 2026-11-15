import {linkProfile} from './physics.mjs';
// Same threshold as LEVEL 5. Returns the graph, path, and nodes reachable from base.
export function assessNetwork(terrain,radio,nodes){
 const edges=[];
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=nodes[i],b=nodes[j],v=linkProfile(terrain,radio,...a.p,a.h,...b.p,b.h,terrain.res);
  const valid=v.D>30&&[...v.d,...v.zFlat].every(Number.isFinite)&&Number.isFinite(v.margin);
  const gap=valid?Math.max(...Array.from(v.d,(d,k)=>v.zFlat[k]-(v.za+(v.zb-v.za)*d/v.D)).slice(1,-1)):NaN;
  edges.push({a:i,b:j,v,valid,visible:valid&&gap<=0,ok:valid&&v.margin>=3});
 }
 const queue=[[0]],seen=new Set([0]);let route=null;
 while(queue.length){const path=queue.shift(),last=path.at(-1);if(last===nodes.length-1){route=path;break;}for(const e of edges){if(!e.ok)continue;const n=e.a===last?e.b:e.b===last?e.a:null;if(n!==null&&!seen.has(n)){seen.add(n);queue.push([...path,n]);}}}
 return {edges,route,seen};
}
