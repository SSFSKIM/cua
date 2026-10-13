// Evaluate this whole snippet once in the persistent cua_repl. No imports or file IO.
(() => {
  if (globalThis.bench) throw new Error('bench is already initialized; dump it before starting another run');
  const calls = [], outcomes = Object.create(null), completed = new Map();
  let current = null;
  const task = () => {
    if (current === null) throw new Error('Call bench.start(task) before recording');
    return current;
  };
  const correctness = (ok, deferred = false) => {
    if (typeof ok !== 'boolean' && !(deferred && ok === null)) throw new Error('ok must be boolean (or null for deferred scoring)');
  };
  const identity = (tool, kind) => {
    if (typeof tool !== 'string' || !tool) throw new Error('tool must be a nonempty name');
    if (!['action','observe','wait','other'].includes(kind)) throw new Error('invalid call kind');
  };
  globalThis.bench = {
    start(id) {
      if (typeof id !== 'string' || !id.trim()) throw new Error('task must be a nonempty id');
      if (completed.has(id)) throw new Error(`task ${id} is already complete`);
      if (current !== null && current !== id) throw new Error(`finish task ${current} before starting ${id}`);
      current = id;
    },
    async call(tool, kind, fn, note = '') {
      const id = task();
      identity(tool, kind);
      if (typeof fn !== 'function') throw new Error('bench.call requires a function');
      const t = new Date().toISOString(), started = performance.now();
      try {
        const value = await fn();
        calls.push({t,task:id,tool,kind,ok:true,ms:performance.now()-started,note});
        return value;
      } catch (error) {
        calls.push({t,task:id,tool,kind,ok:false,ms:performance.now()-started,note,error:String(error?.message ?? error)});
        throw error;
      }
    },
    // MCP tools outside JS can only contribute to unjudged T0/T9 timing.
    recordExternal(tool, kind, measurement) {
      const id = task();
      if (id !== 'T0' && id !== 'T9') throw new Error('External timing is restricted to T0 and T9');
      identity(tool, kind);
      const {t,ms,ok,note = ''} = measurement;
      correctness(ok);
      if (!Number.isFinite(Date.parse(t)) || !Number.isFinite(ms) || ms < 0) throw new Error('External timing needs a start ISO time and finite nonnegative ms');
      calls.push({t,task:id,tool,kind,ok,ms,note});
    },
    done(answer, ok) {
      const id = task();
      correctness(ok, true);
      const row = {task:id,done:new Date().toISOString(),answer,ok};
      calls.push(row);
      completed.set(id, row);
      outcomes[id] = {answer,ok};
      current = null;
    },
    // Ground truth is reviewed after T8. Preserve the original done timestamp.
    score(id, ok) {
      correctness(ok);
      const row = completed.get(id);
      if (!row) throw new Error(`task ${id} has not completed`);
      row.ok = ok;
      outcomes[id].ok = ok;
    },
    dump() {
      return {calls:calls.map(row => JSON.stringify(row)).join('\n') + (calls.length ? '\n' : ''),
        outcomes:JSON.parse(JSON.stringify(outcomes))};
    },
  };
})();
