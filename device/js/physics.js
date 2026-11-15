// Radio / optical link physics on a Mars DEM.  All formulas are documented in 통신_시뮬레이션_수식.md (§ refs below).
// Coordinates: local metres, x = east, y = south, origin = NW corner of the grid. Heights in metres (Mars areoid).

export const MARS_R = 3389500;      // mean radius [m]                          (§1)
export const K_FACTOR = 1.0;        // effective-radius factor, ~no refraction  (§1)
export const C0 = 299792458;        // speed of light [m/s]
const INV2KR = 1 / (2 * K_FACTOR * MARS_R);
const SQRT2 = Math.SQRT2;

// ---- Radio presets (§5) ---------------------------------------------------------------------------
export const PRESETS = {
  uhf: {
    label: 'UHF 401 MHz · 음성+텔레메트리 256 kbps', kind: 'rf',
    f_MHz: 401, pt_dBm: 30, gt_dBi: 2, gr_dBi: 2, lsys_dB: 2, nf_dB: 4, rate_kbps: 256, ebn0_dB: 6,
  },
  sband: {
    label: 'S대역 2.4 GHz · HD 영상 10 Mbps', kind: 'rf',
    f_MHz: 2400, pt_dBm: 30, gt_dBi: 3, gr_dBi: 3, lsys_dB: 2, nf_dB: 3, rate_kbps: 10000, ebn0_dB: 6,
  },
  c58: {
    label: 'C대역 5.8 GHz · 고속 데이터 50 Mbps', kind: 'rf',
    f_MHz: 5800, pt_dBm: 30, gt_dBi: 6, gr_dBi: 6, lsys_dB: 2, nf_dB: 3, rate_kbps: 50000, ebn0_dB: 8,
  },
  fso: {
    label: '광통신 1550 nm (FSO) · 1 Gbps', kind: 'optical',
    lambda_nm: 1550, pt_dBm: 23, dtx_cm: 2.5, drx_cm: 5, div_mrad: 1.0, eff_dB: 2, point_dB: 3, sens_dBm: -40,
    tau: 0.5, angstrom: 0.3, hdust_km: 11,
  },
};

export const PARAM_INFO = {
  f_MHz: ['주파수', 'MHz'], pt_dBm: ['송신 전력', 'dBm'], gt_dBi: ['송신 안테나 이득', 'dBi'], gr_dBi: ['수신 안테나 이득', 'dBi'],
  lsys_dB: ['케이블·시스템 손실', 'dB'], nf_dB: ['수신기 잡음지수', 'dB'], rate_kbps: ['데이터율', 'kbps'],
  ebn0_dB: ['요구 Eb/N0', 'dB'], lambda_nm: ['파장', 'nm'], dtx_cm: ['송신 개구 지름', 'cm'], drx_cm: ['수신 개구 지름', 'cm'],
  div_mrad: ['빔 발산각(전각)', 'mrad'], eff_dB: ['광학계 손실', 'dB'], point_dB: ['지향 손실', 'dB'], sens_dBm: ['수신 감도', 'dBm'],
  tau: ['먼지 광학두께 τ(880 nm)', ''], angstrom: ['Ångström 지수 α', ''], hdust_km: ['먼지 척도고도 H', 'km'],
};

/** Turn a preset/param object into the constants evalLink needs. */
export function resolveRadio(P) {
  if (P.kind === 'optical') {
    const lam = P.lambda_nm * 1e-9;
    const tauLam = P.tau * Math.pow(lam / 880e-9, -P.angstrom);           // Ångström scaling       (§6.3)
    const beta = tauLam / (P.hdust_km * 1000);                             // extinction coeff [1/m] (§6.3)
    return {
      kind: 'optical', lam, beta, tauLam,
      dtx: P.dtx_cm / 100, drx: P.drx_cm / 100, theta: P.div_mrad / 1000,
      base: P.pt_dBm - P.eff_dB - P.point_dB, req: P.sens_dBm,
    };
  }
  const lam = C0 / (P.f_MHz * 1e6);
  const noise = -174 + P.nf_dB + 10 * Math.log10(P.rate_kbps * 1000);      // kTB at 290 K (§5.2)
  return { kind: 'rf', lam, base: P.pt_dBm + P.gt_dBi + P.gr_dBi - P.lsys_dB, noise, req: noise + P.ebn0_dB };
}

// ---- Terrain -----------------------------------------------------------------------------------
export function makeTerrain(buffer, meta) {
  return { z: new Float32Array(buffer), w: meta.width, h: meta.height, res: meta.res_m };
}

/** Bilinear elevation at (x, y); pixel centres at (j+0.5)·res. NaN when outside / no data. */
export function groundAt(T, x, y) {
  const fx = x / T.res - 0.5, fy = y / T.res - 0.5;
  let j = Math.floor(fx), i = Math.floor(fy);
  if (j < 0) j = 0; else if (j > T.w - 2) j = T.w - 2;
  if (i < 0) i = 0; else if (i > T.h - 2) i = T.h - 2;
  const tx = Math.min(Math.max(fx - j, 0), 1), ty = Math.min(Math.max(fy - i, 0), 1);
  const k = i * T.w + j, z = T.z;
  const a = z[k], b = z[k + 1], c = z[k + T.w], d = z[k + T.w + 1];
  if (a === a && b === b && c === c && d === d) {
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  const n = (ty < 0.5 ? (tx < 0.5 ? a : b) : (tx < 0.5 ? c : d)); // nearest when an edge cell is missing
  return n;
}

export function inside(T, x, y) {
  return x >= 0 && y >= 0 && x < T.w * T.res && y < T.h * T.res && Number.isFinite(groundAt(T, x, y));
}

// ---- Profile buffers (reused, no allocation in hot loops) -----------------------------------------
const MAXN = 1 << 15;
const PD = new Float64Array(MAXN);  // distance from Tx along path [m]
const PZ = new Float64Array(MAXN);  // terrain height in "flat" frame = z + d(D−d)/2kR   (§2.2)

function fillProfile(T, ax, ay, za, bx, by, zb, step) {
  const D = Math.hypot(bx - ax, by - ay);
  let n = Math.max(2, Math.ceil(D / step));
  if (n >= MAXN) n = MAXN - 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n, d = t * D;
    PD[i] = d;
    if (i === 0) PZ[i] = za;
    else if (i === n) PZ[i] = zb;
    else {
      const g = groundAt(T, ax + (bx - ax) * t, ay + (by - ay) * t);
      PZ[i] = g === g ? g + d * (D - d) * INV2KR : -Infinity;   // no-data never obstructs
    }
  }
  return n;
}

// worst obstacle between profile indices s..e with straight chord from zs to ze  (§3)
let WE_c = Infinity, WE_i = -1;
function worstEdge(s, e, zs, ze, lam) {
  const ds = PD[s], L = PD[e] - ds;
  let cmin = Infinity, imin = -1;
  for (let i = s + 1; i < e; i++) {
    const z = PZ[i];
    if (z === -Infinity) continue;
    const d1 = PD[i] - ds, d2 = L - d1;
    const h = z - (zs + (ze - zs) * d1 / L);           // obstacle height above LOS
    const r1 = Math.sqrt(lam * d1 * d2 / L);           // 1st Fresnel radius
    const c = -h / r1;                                 // clearance ratio (v = −√2·c)
    if (c < cmin) { cmin = c; imin = i; }
  }
  WE_c = cmin; WE_i = imin;
}

/** ITU-R P.526 single knife-edge loss J(v) [dB]  (§3.2) */
export function J(v) {
  if (v <= -0.78) return 0;
  const a = v - 0.1;
  return 6.9 + 20 * Math.log10(Math.sqrt(a * a + 1) + a);
}

/** Free-space path loss [dB] (§4) */
export function fspl(d, lam) { return 20 * Math.log10(4 * Math.PI * Math.max(d, 1) / lam); }

/**
 * Evaluate a link between antenna A (ground + ha) and B (ground + hb).
 * Returns margin [dB]; if `out` given, fills details.
 */
export function evalLink(T, R, ax, ay, ha, bx, by, hb, step, out) {
  const ga = groundAt(T, ax, ay), gb = groundAt(T, bx, by);
  const za = ga + ha, zb = gb + hb;
  const D = Math.hypot(bx - ax, by - ay);
  let Ld = 0, clr = Infinity, e1 = -1, e2 = -1, e3 = -1;
  if (D > 2 * step) {
    const n = fillProfile(T, ax, ay, za, bx, by, zb, step);
    // Deygout, up to 3 edges (§3.3)
    worstEdge(0, n, za, zb, R.lam);
    clr = WE_c;
    const p = WE_i;
    if (p > 0) {
      const vm = -SQRT2 * WE_c;
      if (vm > -0.78) {
        Ld = J(vm); e1 = p;
        const zp = PZ[p];
        worstEdge(0, p, za, zp, R.lam);
        if (WE_i > 0) { const v = -SQRT2 * WE_c; if (v > -0.78) { Ld += J(v); e2 = WE_i; } }
        worstEdge(p, n, zp, zb, R.lam);
        if (WE_i > 0) { const v = -SQRT2 * WE_c; if (v > -0.78) { Ld += J(v); e3 = WE_i; } }
      }
    }
  }
  let pr, Lfs, Latm = 0;
  if (R.kind === 'optical') {
    const spot = R.dtx + R.theta * D;                                         // beam diameter at Rx (§6.1)
    Lfs = spot > R.drx ? 20 * Math.log10(spot / R.drx) : 0;                  // geometric loss
    Latm = 4.343 * R.beta * D;                                               // Beer–Lambert, dB (§6.2)
    pr = R.base - Lfs - Latm - Ld;
  } else {
    Lfs = fspl(D, R.lam);
    pr = R.base - Lfs - Ld;
  }
  const margin = pr - R.req;
  if (out) {
    out.D = D; out.ga = ga; out.gb = gb; out.za = za; out.zb = zb; out.Lfs = Lfs; out.Ld = Ld; out.Latm = Latm;
    out.pr = pr; out.req = R.req; out.margin = margin; out.clr = clr; out.edges = [e1, e2, e3].filter(i => i > 0);
  }
  return margin;
}

/** Full profile arrays for plotting (allocates). */
export function linkProfile(T, R, ax, ay, ha, bx, by, hb, step) {
  const out = {};
  evalLink(T, R, ax, ay, ha, bx, by, hb, step, out);
  const n = fillProfile(T, ax, ay, out.za, bx, by, out.zb, step);
  const D = out.D;
  const d = new Float64Array(n + 1), zRaw = new Float64Array(n + 1), zFlat = new Float64Array(n + 1), r1 = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    d[i] = PD[i];
    zFlat[i] = PZ[i];
    const bulge = PD[i] * (D - PD[i]) * INV2KR;
    zRaw[i] = (i === 0) ? out.ga : (i === n) ? out.gb : (PZ[i] === -Infinity ? NaN : PZ[i] - bulge);
    if (i === 0 || i === n) zFlat[i] = zRaw[i] + 0; // ground at ends (antenna drawn separately)
    r1[i] = Math.sqrt(R.lam * PD[i] * (D - PD[i]) / D);
  }
  return { ...out, n, d, zRaw, zFlat, r1 };
}

// ---- Network routing: widest-path (max bottleneck margin) from the lander (§7.1) --------------------
/**
 * nodes: [{x,y,h,type:'lander'|'relay'}], index 0..; returns {best[], prev[]}
 * linkM(i,j) → margin.
 */
export function widestPath(n, rootIdx, linkM) {
  const best = new Float64Array(n).fill(-Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  best[rootIdx] = Infinity;
  for (let it = 0; it < n; it++) {
    let u = -1, bu = -Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && best[i] > bu) { bu = best[i]; u = i; }
    if (u < 0 || bu < 0) break;           // remaining nodes unreachable with margin ≥ 0
    done[u] = 1;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const m = Math.min(bu, linkM(u, v));
      if (m >= 0 && m > best[v]) { best[v] = m; prev[v] = u; }
    }
  }
  return { best, prev };
}
