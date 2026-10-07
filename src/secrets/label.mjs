// Secret keys: [A-Za-z_][A-Za-z0-9_]*, the grammar of the plugin's `/secret` mod (hooks/mods/secrets.tsx), whose
// store this is (src/secrets/store.mjs). A key names a stored secret and its file; it is metadata, never a value.
export const LABEL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const LABEL_RULE = "keys are letters, digits and '_', not starting with a digit (as /secret KEY takes them)";

export const isLabel = label => typeof label === 'string' && LABEL_PATTERN.test(label);
