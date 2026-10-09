// Secret keys: [A-Za-z_][A-Za-z0-9_]*, the grammar of the plugin's `/secret` mod (hooks/mods/secrets.tsx), whose
// store this is (src/secrets/store.mjs). A key names a stored secret and its file; it is metadata, never a value.
export const LABEL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const LABEL_RULE = "keys are letters, digits and '_', not starting with a digit (as /secret KEY takes them), and not \"projects\"";
// The global tier's folder that holds the project tiers (store.mjs), so never a key. Any case: macOS's default file
// system would open PROJECTS for projects, and a file there would turn every project lookup into ENOTDIR.
export const PROJECTS_FOLDER = 'projects';

export const isLabel = label => typeof label === 'string' && LABEL_PATTERN.test(label) && label.toLowerCase() !== PROJECTS_FOLDER;

// Keys starting CUA_DEVICE_ hold device credentials (src/remote/devices.mjs: the client credential of a registered
// device, which the server process reads to reach it). They are the owner's, never the model's: secrets_list omits them
// and a {{secret:…}} reference to one is refused (secret_reserved). The owner's `cua secrets list` still shows them.
// The prefix matches in any case: macOS's default file system is case-insensitive, so the store opens CUA_DEVICE_<id>
// for cua_device_<id>.
export const RESERVED_PREFIX = 'CUA_DEVICE_';
export const isReserved = label => typeof label === 'string' && label.toUpperCase().startsWith(RESERVED_PREFIX);
