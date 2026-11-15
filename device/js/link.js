// Device link: keeps plan / walk / hud state in step between the helmet display, the wrist/tablet device and the base.
//
// Every device runs on its own; the link only copies state when a connection is there.
//  · scope 'crew' — helmet ↔ tablet (normally always connected)
//  · scope 'base' — tablet ↔ base (only while the astronaut turns base sync on)
// Each state group carries a Lamport timestamp [counter, deviceId]; a device takes a group from a peer only when
// that timestamp is newer than its own (last writer wins). Every device re-sends its groups once a second, so a
// device that was cut off or reloaded catches up as soon as it hears a peer again.
//
// Transports (both are used when available; duplicates are harmless):
//  · the local server's relay (serve.py: POST /bus, Server-Sent Events on GET /bus) — separate devices on a LAN
//  · BroadcastChannel — tabs of one browser, also works on a static host without the relay

const PEER_TIMEOUT = 3500, BEAT = 1000;
const newer = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

/**
 * @param {string} role 'hud' | 'tablet' | 'base'
 * @param {object} o
 *   get: {plan, walk, hud} → current data of each group this device sends
 *   apply(group, data, fromRole) → take a newer group from a peer
 *   sends: {crew: [groups], base: [groups]}, takes: {crew: {role: [groups]}, base: {role: [groups]}}
 *   scopes: {crew: bool, base: bool} initially enabled
 */
export function createLink(role, o) {
  const id = `${role}-${Math.random().toString(36).slice(2, 8)}`;
  let clock = 0;
  const ts = { plan: [0, id], walk: [0, id], hud: [0, id] };
  const enabled = { crew: !!o.scopes.crew, base: !!o.scopes.base };
  const peers = new Map();          // role → {at, id}
  const listeners = new Set();
  const status = { server: false, local: false };
  const notify = () => listeners.forEach((fn) => fn());

  // ---------------------------------------------------------------- transports
  let bc = null;
  try { bc = new BroadcastChannel('mars-eva-link'); bc.onmessage = (e) => receive(e.data); status.local = true; } catch { /* unsupported */ }
  let es = null;
  fetch('bus/hello', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((info) => {
    if (!info?.relay) return;
    es = new EventSource('bus');
    es.onopen = () => { status.server = true; notify(); };
    es.onerror = () => { status.server = false; notify(); };
    es.onmessage = (e) => { try { receive(JSON.parse(e.data)); } catch { /* ignore malformed */ } };
  }).catch(() => {});
  function post(msg) {
    bc?.postMessage(msg);
    if (status.server) fetch('bus', { method: 'POST', body: JSON.stringify(msg), headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  }

  // ---------------------------------------------------------------- send / receive
  function send(scope) {
    if (!enabled[scope]) return;
    const groups = {};
    for (const g of o.sends[scope] || []) groups[g] = { ts: ts[g], data: o.get[g]() };
    post({ v: 1, from: id, role, scope, groups });
  }
  function receive(m) {
    if (!m || m.v !== 1 || m.from === id || !enabled[m.scope]) return;
    const takes = o.takes[m.scope]?.[m.role]; if (!takes) return;
    const wasUp = isUp(m.role);
    peers.set(m.role, { at: performance.now(), id: m.from });
    if (!wasUp) { upState.set(m.role, true); notify(); setTimeout(beat, 30); }   // answer at once so the peer sees us too
    for (const g of takes) {
      const it = m.groups?.[g]; if (!it) continue;
      clock = Math.max(clock, it.ts[0]);
      if (!newer(it.ts, ts[g])) continue;
      ts[g] = it.ts;
      o.apply(g, it.data, m.role);
    }
  }
  const beat = () => { send('crew'); send('base'); };
  const isUp = (r) => { const p = peers.get(r); return !!p && performance.now() - p.at <= PEER_TIMEOUT; };
  const upState = new Map();
  setInterval(() => {
    beat();
    let changed = false;
    for (const r of peers.keys()) { const up = isUp(r); if (upState.get(r) !== up) { upState.set(r, up); changed = true; } }
    if (changed) notify();
  }, BEAT);
  setTimeout(beat, 300);

  return {
    id, role,
    /** A local change to `group`: stamp it and send it right away. */
    touch(group) { ts[group] = [++clock, id]; beat(); },
    setEnabled(scope, on) {
      enabled[scope] = on;
      if (!on) for (const r of [...peers.keys()]) if (scopeOf(r) === scope) { peers.delete(r); upState.delete(r); }
      notify(); if (on) beat();
    },
    enabled: (scope) => enabled[scope],
    peerUp: isUp,
    lastSeen: (r) => peers.get(r)?.at ?? null,
    transport: () => (status.server ? 'server' : status.local ? 'local' : 'none'),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  function scopeOf(r) { return (o.takes.crew?.[r] ? 'crew' : 'base'); }
}
