import OpenAI from 'openai';

// Lazily constructs (and caches) the OpenAI client, instead of constructing it at
// module load. openai v4 throws in its constructor when apiKey is undefined, and
// this module is imported (directly or transitively) by app.mjs, so a missing key
// used to crash the whole server on boot. Routing every call through getOpenAI()
// lets the app boot and serve the (fully seeded) demo world with no key at all.
//
// The client is rebuilt whenever the key actually changes, so a teacher pasting a
// key into the setup wizard unlocks AI features immediately -- no server restart.
let cachedClient = null;
let cachedKey = null;

export function getApiKey() {
  const key = process.env.OPENAI_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

export function isAIAvailable() {
  return getApiKey() !== null;
}

export function getOpenAI() {
  const key = getApiKey();
  if (!key) {
    const error = new Error('AI_NOT_CONFIGURED');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new OpenAI({ apiKey: key });
    cachedKey = key;
  }
  return cachedClient;
}
