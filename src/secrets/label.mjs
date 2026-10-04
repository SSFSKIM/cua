// Secret labels: [A-Za-z0-9][A-Za-z0-9._-]{0,127}, the same rule the Keychain helper enforces (native/keychain,
// Label.swift). A label names a stored secret; it is metadata, never a value.
export const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const LABEL_RULE = "labels are 1-128 letters, digits, '.', '_' or '-', starting with a letter or digit";

export const isLabel = label => typeof label === 'string' && LABEL_PATTERN.test(label);
