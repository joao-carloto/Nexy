// Validates an OpenAI API key the teacher pastes into Settings/the wizard.
//
// Deliberately calls chat/completions with a tiny max_completion_tokens rather than GET
// /v1/models. /v1/models succeeds even on a brand-new key with zero billing
// credit, which would tell a teacher "your key works!" right before their
// first real generation fails with insufficient_quota -- exactly the
// confusing failure this validation step exists to prevent. A minimal
// chat/completions call actually exercises billing.
// Keep in sync with TEXT_MODEL in server/openai_client.mjs.
const MODEL = 'gpt-6-luna';

async function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { ok: false, reason: 'empty' };
  }
  const trimmed = apiKey.trim();
  if (!trimmed.startsWith('sk-')) {
    // Cheap client-side-style check we can do without a network call.
    return { ok: false, reason: 'malformed' };
  }

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${trimmed}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        // Reasoning models reject a 1-token limit outright (HTTP 400) since
        // they can't finish thinking; 16 is enough to return 200.
        max_completion_tokens: 16,
      }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (response.ok) {
    return { ok: true };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // ignore -- fall through to status-code-based classification
  }
  const code = body?.error?.code;

  if (response.status === 401 || code === 'invalid_api_key') {
    return { ok: false, reason: 'invalid_key' };
  }
  if (response.status === 429 && code === 'insufficient_quota') {
    return { ok: false, reason: 'insufficient_quota' };
  }
  if (response.status === 429) {
    return { ok: false, reason: 'rate_limited' };
  }
  return { ok: false, reason: 'unknown', status: response.status };
}

module.exports = { validateApiKey };
