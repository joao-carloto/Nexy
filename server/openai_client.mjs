import OpenAI from 'openai';

// Single place to change the OpenAI models Nexy uses. Picked for lowest cost at
// acceptable quality: gpt-6-luna is the cheapest GPT-6 tier; Flare is the fast
// everyday image generator and Sunburst the one OpenAI recommends for edits.
// electron/api-key-validation.cjs keeps its own copy of TEXT_MODEL (CommonJS
// can't import this ESM module), so update both together.
export const TEXT_MODEL = 'gpt-6-luna';
export const IMAGE_MODEL = 'gpt-image-2.5-flare';
export const IMAGE_EDIT_MODEL = 'gpt-image-2.5-sunburst';
// gpt-6-luna reasons at 'medium' effort by default, and reasoning tokens are
// billed as output. Short social media posts don't need it.
export const TEXT_REASONING = { effort: 'none' };
// Sent as developer instructions with every text request. Newer models refuse
// to write fake news without being told why it's needed, and always refuse
// false stories about real people, so Nexy's content uses invented ones.
export const TEXT_INSTRUCTIONS =
  'You write content for Nexy, a media literacy simulator used by teachers in classrooms. ' +
  'Nexy is a closed, fictional social network: its posts are only shown to students inside the ' +
  'simulator and are never published elsewhere. The feed mixes genuine posts with false or ' +
  'manipulative ones, and the exercise is for students to work out which is which, so write ' +
  'exactly the kind of post requested: genuine when asked for a genuine post, realistically ' +
  'misleading when asked for a false or manipulative one. Never label a post as fictional, false ' +
  'or an exercise, and never add disclaimers or questions for the reader; that would give the ' +
  'exercise away, and the teacher discusses the posts with the class afterwards. Always use ' +
  'invented people, organisations, brands and places, never real, identifiable ones. Do not ' +
  'produce content that gives dangerous real-world instructions.';

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
