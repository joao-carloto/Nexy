// Small JSON-file config store at <userData>/config.json. The OpenAI API key
// is encrypted at rest with Electron's safeStorage (backed by Windows DPAPI,
// tied to the logged-in Windows user), since school computers are sometimes
// shared across multiple teachers or students under one login -- a plain-text
// key in this file would otherwise be readable by anyone with access to that
// account. Nothing else in this store is sensitive enough to need the same
// treatment: adminPassword/adminTokenSecret gate in-app screens only, not an
// external paid service.
//
// Not a native module (e.g. keytar): safeStorage ships with Electron itself,
// so this adds no packaging/compile step beyond sqlite3/sharp, which the
// server already requires.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeStorage } = require('electron');

const CONFIG_FILENAME = 'config.json';
// Marks an already-encrypted key so loadConfig can tell it apart from a
// plaintext key written by a version of Nexy that predates this change --
// existing installs are migrated to encrypted storage on their next save,
// not left broken or silently downgraded to plaintext.
const ENCRYPTED_PREFIX = 'safeStorage:v1:';

function encryptApiKey(plainKey) {
  if (!plainKey) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    // No OS-level keyring available (rare; mainly a Linux-without-keyring
    // scenario, not expected on the Windows builds this app ships). Storing
    // plaintext here is a last resort, not a silent security regression: the
    // alternative is refusing to save the key at all, which breaks the app's
    // AI features entirely just to protect a threat model that doesn't apply
    // if it were adopted on that platform's install anyway.
    console.warn('safeStorage encryption is not available on this system; storing API key as plain text.');
    return plainKey;
  }
  return ENCRYPTED_PREFIX + safeStorage.encryptString(plainKey).toString('base64');
}

function decryptApiKey(storedKey) {
  if (!storedKey) return null;
  if (!storedKey.startsWith(ENCRYPTED_PREFIX)) {
    // Plaintext from either a pre-encryption install or the no-keyring
    // fallback above.
    return storedKey;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    // The key was encrypted (e.g. on this same machine, an earlier launch),
    // but the OS keyring is unavailable right now -- surfacing this as "no
    // key configured" is safer and more honest than throwing mid-launch.
    console.error('Cannot decrypt saved API key: safeStorage encryption is unavailable.');
    return null;
  }
  try {
    const buffer = Buffer.from(storedKey.slice(ENCRYPTED_PREFIX.length), 'base64');
    return safeStorage.decryptString(buffer);
  } catch (err) {
    console.error('Failed to decrypt saved API key, treating it as unset:', err.message);
    return null;
  }
}

const DEFAULTS = {
  openaiApiKey: null,
  adminPassword: null,
  adminTokenSecret: null,
  locale: null, // null -> not chosen yet; wizard sets 'en' or 'pt'
  seedVersion: 0,
  skippedKeySetup: false,
  setupCompleted: false,
  classroomMode: false,
  windowBounds: null,
  zoomLevel: 0,
};

function configPath(userDataDir) {
  return path.join(userDataDir, CONFIG_FILENAME);
}

function loadConfig(userDataDir) {
  const file = configPath(userDataDir);
  if (!fs.existsSync(file)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const merged = { ...DEFAULTS, ...raw };
    // Callers work with the plaintext key in memory (env vars, the wizard's
    // hasApiKey check, etc); only the on-disk JSON stores the encrypted form.
    merged.openaiApiKey = decryptApiKey(merged.openaiApiKey);
    return merged;
  } catch (err) {
    console.error('Failed to parse config.json, falling back to defaults:', err.message);
    return { ...DEFAULTS };
  }
}

function saveConfig(userDataDir, config) {
  fs.mkdirSync(userDataDir, { recursive: true });
  // Encrypt only in the on-disk copy -- the in-memory `config` object callers
  // hold onto keeps the plaintext key, since callers (main.cjs setting
  // process.env.OPENAI_API_KEY, updateConfig's return value, etc) need it.
  const onDisk = { ...config, openaiApiKey: encryptApiKey(config.openaiApiKey) };
  // Write to a temp file then rename, so a crash mid-write never corrupts the
  // teacher's saved settings (in particular their API key).
  const file = configPath(userDataDir);
  const tmpFile = `${file}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(onDisk, null, 2));
  fs.renameSync(tmpFile, file);
}

function updateConfig(userDataDir, patch) {
  const current = loadConfig(userDataDir);
  const next = { ...current, ...patch };
  saveConfig(userDataDir, next);
  return next;
}

// A short, memorable admin passphrase (three words + two digits) rather than a
// random hex string -- a teacher may need to read this off screen and type it
// on a projector, or write it down by hand.
const PASSPHRASE_WORDS = [
  'hare', 'fox', 'owl', 'bee', 'elm', 'oak', 'sky', 'sea', 'sun', 'moon',
  'reef', 'lake', 'peak', 'dune', 'leaf', 'reed', 'pine', 'plum', 'sage', 'mint',
  'window', 'garden', 'meadow', 'harbor', 'canyon', 'summit', 'ember', 'quartz', 'willow', 'cedar',
];

function generateAdminPassword() {
  const pick = () => PASSPHRASE_WORDS[crypto.randomInt(PASSPHRASE_WORDS.length)];
  const digits = crypto.randomInt(10, 99);
  return `${pick()}-${pick()}-${digits}`;
}

function generateTokenSecret() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  DEFAULTS,
  loadConfig,
  saveConfig,
  updateConfig,
  generateAdminPassword,
  generateTokenSecret,
};
