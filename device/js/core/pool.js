// Worker pool around sim/js/worker.js (the simulator's compute worker, reused as is).
export class Pool {
  constructor(n, buffer, meta) {
    this.workers = []; this.queue = []; this.jobs = new Map(); this.seq = 0;
    const ready = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
      w.busy = false;
      ready.push(new Promise((res) => { w.onmessage = (e) => { if (e.data.type === 'ready') res(); }; }));
      w.postMessage({ type: 'init', buffer: buffer.slice(0), meta });
      this.workers.push(w);
    }
    this.ready = Promise.all(ready).then(() => this.workers.forEach((w) => (w.onmessage = (e) => this._msg(w, e.data))));
  }
  _msg(w, d) {
    const job = this.jobs.get(d.id);
    if (!job) return;
    if (d.type === 'progress') { job.prog[job.idx.get(d.id)] = d.done; job.onProgress?.(job.prog.reduce((a, b) => a + b, 0) / job.n); return; }
    job.results[job.idx.get(d.id)] = d; job.prog[job.idx.get(d.id)] = 1; job.left--;
    this.jobs.delete(d.id); w.busy = false;
    job.onProgress?.(job.prog.reduce((a, b) => a + b, 0) / job.n);
    if (job.left === 0) job.resolve(job.results);
    this._pump();
  }
  _pump() {
    for (const w of this.workers) {
      if (w.busy || !this.queue.length) continue;
      const msg = this.queue.shift(); w.busy = true; w.postMessage(msg);
    }
  }
  run(msgs, onProgress) {
    return new Promise((resolve) => {
      const job = { n: msgs.length, left: msgs.length, results: [], prog: new Array(msgs.length).fill(0), idx: new Map(), resolve, onProgress };
      msgs.forEach((m, i) => { const id = ++this.seq; job.idx.set(id, i); this.jobs.set(id, job); this.queue.push({ ...m, id }); });
      this._pump();
    });
  }
}
