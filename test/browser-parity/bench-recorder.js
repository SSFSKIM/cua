// Evaluate once per device REPL, then await bench.init({service, run}). The journal
// lives under os.tmpdir(), which the device sandbox permits; /tmp is not equivalent.
(() => {
  if (globalThis.bench) throw new Error('bench is already loaded; use the existing recorder');
  const calls = [], outcomes = Object.create(null), completed = new Map();
  let current = null, fileSystem, directory, callsPath, outcomesPath, initialized = false, runKey;
  const ready = () => {if (!initialized) throw new Error('Await bench.init({service, run}) before recording');};
  const task = () => {
    ready();
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
  // The journal is authoritative, including score audits. Replaying it repairs an
  // outcome snapshot interrupted between appendFileSync and the atomic rename.
  const apply = row => {
    if (typeof row.task !== 'string' || !row.task) throw new Error('Invalid journal task');
    if (row.scored === true) {
      correctness(row.ok);
      const done = completed.get(row.task);
      if (!done) throw new Error(`task ${row.task} has not completed`);
      if (done.ok !== null && done.ok !== row.ok) throw new Error('Only deferred scores may change');
      outcomes[row.task].ok = row.ok;
    } else if (Object.hasOwn(row,'done')) {
      correctness(row.ok, true);
      if (completed.has(row.task)) throw new Error(`task ${row.task} is already complete`);
      completed.set(row.task,row);
      outcomes[row.task] = {answer:row.answer,ok:row.ok};
      current = null;
    } else if (Object.hasOwn(row,'t')) {
      if (completed.has(row.task)) throw new Error(`task ${row.task} is already complete`);
      current = row.task;
    } else throw new Error('Invalid journal row');
    calls.push(row);
  };
  const saveOutcomes = () => {
    const temporary = `${outcomesPath}.tmp`;
    fileSystem.writeFileSync(temporary,JSON.stringify(outcomes,null,2)+'\n',{mode:0o600});
    fileSystem.renameSync(temporary,outcomesPath);
  };
  const append = row => {
    const text = JSON.stringify(row);
    fileSystem.appendFileSync(callsPath,text+'\n',{mode:0o600});
    apply(JSON.parse(text));
  };
  const state = () => ({directory,completed:[...completed.keys()],currentTask:current});
  globalThis.bench = {
    async init({service,run,fs,os} = {}) {
      if (!['vendor','cua'].includes(service) || !Number.isInteger(run) || run < 1 || run > 3) throw new Error('init requires service vendor|cua and run 1|2|3');
      const key = `${service}-run-${run}`;
      if (initialized) {
        if (runKey !== key) throw new Error('Use a fresh REPL before selecting a different run');
        return state();
      }
      fileSystem = fs ?? await import('node:fs');
      const system = os ?? await import('node:os');
      directory = `${system.tmpdir().replace(/\/+$/,'')}/cua-bench/${key}`;
      callsPath = `${directory}/calls.jsonl`;
      outcomesPath = `${directory}/outcomes.json`;
      fileSystem.mkdirSync(directory,{recursive:true,mode:0o700});
      let journal = '';
      try {journal=fileSystem.readFileSync(callsPath,'utf8');} catch (error) {if (error.code !== 'ENOENT') throw error;}
      calls.length=0; completed.clear(); current=null;
      for (const id of Object.keys(outcomes)) delete outcomes[id];
      for (const line of journal.split('\n').filter(Boolean)) apply(JSON.parse(line));
      fileSystem.appendFileSync(callsPath,'',{mode:0o600});
      saveOutcomes();
      initialized=true; runKey=key;
      return state();
    },
    get directory() {return directory;},
    start(id) {
      ready();
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
      let value, failure, failed = false;
      try {value=await fn();} catch (error) {failure=error;failed=true;}
      const ms = performance.now()-started;
      append({t,task:id,tool,kind,ok:!failed,ms,note,...(failed ? {error:String(failure?.message ?? failure)} : {})});
      if (failed) throw failure;
      return value;
    },
    // profiles_list is outside JS and contributes only to diagnostic setup time.
    recordExternal(tool, kind, measurement) {
      const id = task();
      if (id !== 'T0' && id !== 'T9') throw new Error('External timing is restricted to T0 and T9');
      identity(tool, kind);
      const {t,ms,ok,note = ''} = measurement;
      correctness(ok);
      if (!Number.isFinite(Date.parse(t)) || !Number.isFinite(ms) || ms < 0) throw new Error('External timing needs a start ISO time and finite nonnegative ms');
      append({t,task:id,tool,kind,ok,ms,note});
    },
    done(answer, ok) {
      const id = task();
      correctness(ok, true);
      append({task:id,done:new Date().toISOString(),answer,ok});
      saveOutcomes();
    },
    score(id, ok) {
      ready(); correctness(ok);
      const row = completed.get(id);
      if (!row) throw new Error(`task ${id} has not completed`);
      if (row.ok !== null && row.ok !== ok) throw new Error('Only deferred scores may change');
      append({task:id,scored:true,ok,t:new Date().toISOString()});
      saveOutcomes();
    },
    // Diagnostic only: transfer the actual files with scp, never through model text.
    dump() {
      ready();
      return {calls:calls.map(row => JSON.stringify(row)).join('\n') + (calls.length ? '\n' : ''),
        outcomes:JSON.parse(JSON.stringify(outcomes))};
    },
  };
})();
