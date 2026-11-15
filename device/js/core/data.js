// Loads the simulator's prepared data from ../sim/data (single copy, shared with the simulator).
import { S, PH } from './store.js';
import { Pool } from './pool.js';

const DATA = new URL('../../data/', import.meta.url);
export let pool = null;

async function loadTerrainBuffer() {
  const r = await fetch(new URL('terrain_8m.f32', DATA)).catch(() => null);
  if (r && r.ok) return r.arrayBuffer();
  const b64 = await (await fetch(new URL('terrain_8m_f32.b64.txt', DATA))).text();     // fallback where binaries can't be served
  const bin = atob(b64.trim()), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function load() {
  const [meta, buf, route, img] = await Promise.all([
    fetch(new URL('meta.json', DATA)).then((r) => r.json()),
    loadTerrainBuffer(),
    fetch(new URL('route.json', DATA)).then((r) => r.json()),
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = new URL('ortho_4m.jpg', DATA).href; }),
  ]);
  S.meta = meta; S.T = PH.makeTerrain(buf, meta);
  S.W = meta.width * meta.res_m; S.H = meta.height * meta.res_m; S.zRef = meta.z_min;
  S.route = route.filter((p) => PH.inside(S.T, p.x, p.y));
  pool = new Pool(Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)), buf, meta);
  return img;
}
