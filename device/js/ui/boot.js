// Start-up shared by the three screens: data, 3D scene, default scenario, device link.
import { S, A, bus } from '../core/store.js';
import { load, pool } from '../core/data.js';
import * as scene from '../core/scene.js';
import '../core/model.js';
import '../core/coverage.js';
import '../core/eva.js';
import '../core/optimizer.js';
import { defaultScenario } from '../core/model.js';
import { getPlan, applyPlan, getWalk, applyWalk, getHud, applyHud, planKey } from '../core/plan.js';
import { createLink } from '../link.js';

// who sends and takes which state groups (see link.js)
const ROLES = {
  hud:    { sends: { crew: ['plan', 'walk', 'hud'] }, takes: { crew: { tablet: ['plan', 'walk', 'hud'] } }, scopes: { crew: true } },
  tablet: { sends: { crew: ['plan', 'walk', 'hud'], base: ['plan', 'walk', 'hud'] },
            takes: { crew: { hud: ['plan', 'walk', 'hud'] }, base: { base: ['plan'] } }, scopes: { crew: true, base: false } },
  base:   { sends: { base: ['plan'] }, takes: { base: { tablet: ['plan', 'walk', 'hud'] } }, scopes: { base: true } },
};

/**
 * @param {string} device 'hud' | 'tablet' | 'base'
 * @param {object} o  host: element for the 3D view · firstPerson · setup(S) before build · link: {get?, apply?} overrides
 */
export async function boot(device, o) {
  S.device = device;
  o.setup?.(S);
  const img = await load();
  scene.build(img, { firstPerson: !!o.firstPerson });
  defaultScenario();
  A.radioChanged(false);
  scene.attach(o.host);
  new ResizeObserver(() => scene.resize()).observe(o.host);
  await pool.ready;
  A.recompute();
  A.moveEva(0);

  // ---- device link: plan edits made here are stamped automatically; walk / hud changes by the page (link.touch)
  let applying = false, lastPlan = planKey();
  const role = ROLES[device];
  const link = createLink(device, {
    ...role,
    get: { plan: getPlan, walk: getWalk, hud: getHud, ...(o.link?.get || {}) },
    apply(group, data, from) {
      if (o.link?.apply?.(group, data, from)) return;   // page handled it
      applying = true;
      try {
        if (group === 'plan') { if (planKey(data) !== planKey()) applyPlan(data); lastPlan = planKey(); }
        else if (group === 'walk') applyWalk(data);
        else if (group === 'hud') applyHud(data);
      } finally { applying = false; }
    },
  });
  if (device !== 'base') {
    const check = () => { if (applying) return; const k = planKey(); if (k !== lastPlan) { lastPlan = k; link.touch('plan'); } };
    for (const ev of ['net', 'radio', 'eva', 'plan']) bus.on(ev, check);
  }
  return link;
}
