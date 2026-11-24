// Classified runtime errors. `code` is stable for callers and tests; `hint` is the actionable next step for a human.
// Messages carry paths and versions only, never credential material. `context`, where a caller needs the facts of an
// error rather than its sentence (a release, a home), carries them as plain values.
export class CuaError extends Error {
  constructor(code, message, {hint, cause, context} = {}) {
    super(message, cause ? {cause} : undefined);
    this.name = 'CuaError';
    this.code = code;
    if (hint) this.hint = hint;
    if (context) this.context = context;
  }
}

export const fail = (code, message, options) => { throw new CuaError(code, message, options); };
