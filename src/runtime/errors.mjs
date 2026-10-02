// Classified runtime errors. `code` is stable for callers and tests; `hint` is the actionable next step for a human.
// Messages carry paths and versions only, never credential material.
export class CuaError extends Error {
  constructor(code, message, {hint, cause} = {}) {
    super(message, cause ? {cause} : undefined);
    this.name = 'CuaError';
    this.code = code;
    if (hint) this.hint = hint;
  }
}

export const fail = (code, message, options) => { throw new CuaError(code, message, options); };
