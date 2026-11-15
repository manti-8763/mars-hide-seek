// Compute worker: coverage rasters and source×target margin matrices.
import { makeTerrain, evalLink, resolveRadio } from './physics.js';

let T = null;

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'init') { T = makeTerrain(m.buffer, m.meta); self.postMessage({ type: 'ready' }); return; }
  const R = resolveRadio(m.radio);
  const step = m.step || T.res;

  if (m.type === 'coverage') {
    // m.nodes: [{x,y,h}], cells on a grid with stride `stride` (in terrain pixels), rows [r0, r1), columns [c0, c1)
    const { nodes, stride, r0, r1, hRx } = m;
    const c0 = m.c0 ?? 0, c1 = m.c1 ?? Math.ceil(T.w / stride), cw = c1 - c0, rows = r1 - r0;
    const out = new Float32Array(nodes.length * rows * cw).fill(NaN);
    for (let k = 0; k < nodes.length; k++) {
      const nd = nodes[k];
      for (let r = r0; r < r1; r++) {
        const y = (r * stride + stride / 2) * T.res;
        for (let c = c0; c < c1; c++) {
          const x = (c * stride + stride / 2) * T.res;
          const zi = Math.min(Math.floor(y / T.res), T.h - 1) * T.w + Math.min(Math.floor(x / T.res), T.w - 1);
          if (!(T.z[zi] === T.z[zi])) continue;
          out[(k * rows + (r - r0)) * cw + (c - c0)] = evalLink(T, R, nd.x, nd.y, nd.h, x, y, hRx, step);
        }
      }
      self.postMessage({ type: 'progress', id: m.id, done: (k + 1) / nodes.length });
    }
    self.postMessage({ type: 'result', id: m.id, out, r0, r1, c0, cw }, [out.buffer]);
    return;
  }

  if (m.type === 'pairs') {
    // margins for every (source, target) pair → Float32Array S×T (row-major by source)
    const { sources, targets } = m;
    const out = new Float32Array(sources.length * targets.length);
    for (let s = 0; s < sources.length; s++) {
      const a = sources[s];
      for (let t = 0; t < targets.length; t++) {
        const b = targets[t];
        out[s * targets.length + t] = evalLink(T, R, a.x, a.y, a.h, b.x, b.y, b.h, step);
      }
      if ((s & 15) === 15) self.postMessage({ type: 'progress', id: m.id, done: s / sources.length });
    }
    self.postMessage({ type: 'result', id: m.id, out }, [out.buffer]);
  }
};
