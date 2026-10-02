// The connection's task state machine. A task is the server's explicitly bounded sequence of `js`/`js_reset` calls on
// one connection; it is not a model turn. States:
//
//   idle     no task; the next work mints a task ID
//   active   a task is open; work is serialized, one call upstream at a time
//   ending   end_task was admitted: no new work; running work may finish; then one upstream completion
//   failed   terminal: completion or the runtime became uncertain; everything is rejected, the heap is never reused
//   closing  terminal: EOF/signal; a bounded best-effort completion may run, but nothing returns to idle
//
// Only confirmed quiescence (every dispatched call answered) plus a successful upstream acknowledgement of the
// completion returns `ending` to `idle`. A deadline, an error or an exit while that is uncertain makes the connection
// terminal. Every submitted call and every end_task caller is settled exactly once; replies that arrive after their
// caller was settled are dropped and cannot change state.
//
// This module does no I/O: the server supplies `complete` (the upstream completion request) and each work item's
// `run` (its upstream request), both returning promises of the upstream reply.
import {randomUUID} from 'node:crypto';

export class LifecycleError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'LifecycleError';
    this.code = code;
    this.detail = detail;
  }
}

const MESSAGES = {
  task_ending: 'the current task is ending; send new work after end_task returns',
  connection_failed: 'this connection failed and accepts no more work; start a new connection',
  connection_closing: 'this connection is closing and accepts no more work',
  cancelled: 'cancelled before it started',
  completion_timeout: 'task completion did not finish within its deadline; this connection is closed',
  completion_failed: 'the runtime did not confirm task completion; this connection is closed',
};
const error = (code, detail) => new LifecycleError(code, MESSAGES[code], detail);

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => {});
  return {promise, resolve, reject};
}

export class TaskLifecycle {
  #state = 'idle';
  #taskId = null;
  #queue = [];
  #inFlight = null;
  #quiet = null;          // deferred resolved when nothing is queued or in flight
  #ending = null;         // {taskId, deferred, timer, settled}
  #closed = null;         // deferred: the close() completion attempt has finished
  #terminalNotified = false;

  constructor({sessionId, complete, onTerminal = () => {}, completionDeadlineMs = 5000, newId = randomUUID}) {
    this.sessionId = sessionId;
    this.complete = complete;
    this.onTerminal = onTerminal;
    this.completionDeadlineMs = completionDeadlineMs;
    this.newId = newId;
  }

  get state() { return this.#state; }

  // Admits one js/js_reset call. Returns {promise, cancel}: the promise resolves {taskId, reply} with the upstream
  // reply or rejects with a LifecycleError; cancel() withdraws the call if it has not been dispatched yet.
  submit(run) {
    const refusal = this.#refusal();
    if (refusal) return {promise: Promise.reject(refusal), cancel: () => false};
    if (this.#state === 'idle') {
      this.#taskId = this.newId();
      this.#state = 'active';
    }
    const item = {run, taskId: this.#taskId, settled: false, ...deferred()};
    this.#queue.push(item);
    this.#pump();
    return {
      promise: item.promise,
      cancel: () => {
        const index = this.#queue.indexOf(item);
        if (index < 0) return false;
        this.#queue.splice(index, 1);
        this.#settle(item, error('cancelled'));
        this.#checkQuiet();
        return true;
      },
    };
  }

  endTask() {
    switch (this.#state) {
      case 'idle': return Promise.resolve({status: 'noop', ended: false});
      case 'active': return this.#beginEnding();
      case 'ending': return this.#ending.deferred.promise;
      default: return Promise.reject(this.#refusal());
    }
  }

  // EOF or a termination signal. Stops admission at once and makes a bounded best-effort completion of an open task;
  // resolves {completion: 'none'|'ended'|<error code>} when that attempt has finished. The connection stays terminal.
  close() {
    if (this.#closed) return this.#closed.promise;
    this.#closed = deferred();
    if (this.#state === 'failed') {
      this.#closed.resolve({completion: 'failed'});
      return this.#closed.promise;
    }
    const previous = this.#state;
    this.#state = 'closing';
    this.#rejectQueued('connection_closing');
    const attempt = previous === 'active' ? this.#beginEnding()
      : previous === 'ending' ? this.#ending.deferred.promise
      : Promise.resolve({status: 'none'});
    attempt.then(
      result => this.#closed.resolve({completion: result.status === 'ended' ? 'ended' : 'none'}),
      reason => this.#closed.resolve({completion: reason.code ?? 'completion_failed'}),
    );
    return this.#closed.promise;
  }

  // The runtime exited or errored. Terminal; settles every pending caller once.
  fail(code = 'connection_failed', detail = {}) {
    if (this.#state === 'failed') return;
    const closing = this.#state === 'closing';
    if (!closing) this.#state = 'failed';
    const callerCode = closing ? 'connection_closing' : 'connection_failed';
    this.#rejectQueued(callerCode);
    if (this.#inFlight) { this.#settle(this.#inFlight, error(callerCode)); this.#inFlight = null; }
    this.#settleEnding(error('completion_failed', {reason: code, ...detail, stage: this.#ending?.stage}));
    this.#checkQuiet();
    this.#notifyTerminal({state: this.#state, code, ...detail});
  }

  // Settles whatever is still pending when the connection is torn down.
  abandon() {
    const code = this.#state === 'closing' ? 'connection_closing' : 'connection_failed';
    this.#rejectQueued(code);
    if (this.#inFlight) { this.#settle(this.#inFlight, error(code)); this.#inFlight = null; }
  }

  #refusal() {
    if (this.#state === 'ending') return error('task_ending');
    if (this.#state === 'failed') return error('connection_failed');
    if (this.#state === 'closing') return error('connection_closing');
    return null;
  }

  #pump() {
    if (this.#inFlight || !this.#queue.length || this.#state === 'failed') return;
    const item = this.#queue.shift();
    this.#inFlight = item;
    const callId = this.newId();
    Promise.resolve()
      .then(() => item.run({sessionId: this.sessionId, taskId: item.taskId, callId}))
      .then(reply => this.#finish(item, null, reply), reason => this.#finish(item, reason));
  }

  #finish(item, reason, reply) {
    // A reply for a call that was already settled (the connection failed meanwhile) is dropped here.
    if (this.#inFlight === item) this.#inFlight = null;
    this.#settle(item, reason ? error('connection_failed', {cause: String(reason?.message ?? reason)}) : null, {taskId: item.taskId, reply});
    this.#pump();
    this.#checkQuiet();
  }

  #settle(item, reason, value) {
    if (item.settled) return;
    item.settled = true;
    if (reason) item.reject(reason); else item.resolve(value);
  }

  #rejectQueued(code) {
    for (const item of this.#queue.splice(0)) this.#settle(item, error(code));
  }

  #checkQuiet() {
    if (this.#quiet && !this.#inFlight && !this.#queue.length) { this.#quiet.resolve(); this.#quiet = null; }
  }

  #quiescent() {
    if (!this.#inFlight && !this.#queue.length) return Promise.resolve();
    this.#quiet ??= deferred();
    return this.#quiet.promise;
  }

  #beginEnding() {
    const taskId = this.#taskId;
    if (this.#state === 'active') this.#state = 'ending';
    // Work that never started is not part of what completion waits for.
    this.#rejectQueued(this.#state === 'closing' ? 'connection_closing' : 'task_ending');
    const ending = this.#ending = {taskId, deferred: deferred(), stage: 'quiescence', settled: false};
    ending.timer = setTimeout(() => this.#completionFailed('completion_timeout'), this.completionDeadlineMs);
    (async () => {
      await this.#quiescent();
      if (ending.settled) return;
      ending.stage = 'acknowledgement';
      let reply;
      try {
        reply = await this.complete({sessionId: this.sessionId, taskId, callId: this.newId()});
      } catch (reason) {
        return this.#completionFailed('completion_failed', {cause: String(reason?.message ?? reason)});
      }
      if (ending.settled) return;
      if (reply?.error || reply?.result?.isError) return this.#completionFailed('completion_failed');
      clearTimeout(ending.timer);
      ending.settled = true;
      if (this.#state === 'ending') { this.#state = 'idle'; this.#taskId = null; }
      ending.deferred.resolve({status: 'ended', ended: true, taskId});
    })();
    return ending.deferred.promise;
  }

  #completionFailed(code, detail = {}) {
    const ending = this.#ending;
    if (!ending || ending.settled) return;
    this.#settleEnding(error(code, {stage: ending.stage, ...detail}));
    if (this.#state === 'closing') {
      // Closing already stops admission; settle the stuck caller now so teardown can proceed.
      if (this.#inFlight) { this.#settle(this.#inFlight, error('connection_closing')); this.#inFlight = null; }
      this.#checkQuiet();
      return;
    }
    this.#state = 'failed';
    this.#rejectQueued('connection_failed');
    if (this.#inFlight) { this.#settle(this.#inFlight, error('connection_failed')); this.#inFlight = null; }
    this.#checkQuiet();
    this.#notifyTerminal({state: 'failed', code, stage: ending.stage});
  }

  #settleEnding(reason) {
    const ending = this.#ending;
    if (!ending || ending.settled) return;
    ending.settled = true;
    clearTimeout(ending.timer);
    ending.deferred.reject(reason);
  }

  #notifyTerminal(info) {
    if (this.#terminalNotified) return;
    this.#terminalNotified = true;
    this.onTerminal(info);
  }
}
