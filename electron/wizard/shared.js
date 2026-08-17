// Shared between settings.js and setup.js -- loaded as a plain <script> tag
// (no bundler in this project) so both windows use identical status-message
// styling and identical wording for API key validation failures.
function setStatus(el, kind, message) {
  el.className = `status-msg ${kind}`;
  el.textContent = message;
}

function clearStatus(el) {
  el.className = 'status-msg';
  el.textContent = '';
}

// Maps the reasons api-key-validation.cjs can return into copy a non-technical
// teacher can act on. insufficient_quota is the one that matters most: a
// brand-new OpenAI account has a VALID key with zero credit, and without this
// message a teacher reads that as "Nexy is broken" rather than "add $5".
const KEY_ERROR_MESSAGES = {
  empty: 'Paste your key first.',
  malformed: "That doesn't look like a key. Keys start with sk-.",
  invalid_key: "That key wasn't accepted. Check you copied the whole thing, starting with sk-.",
  insufficient_quota:
    'The key is valid, but the account has no credit yet. Go to OpenAI -> Billing and add credit, then try again.',
  rate_limited: 'OpenAI is busy right now. Wait a minute and try again.',
  network: "Couldn't reach OpenAI. Check this computer is online.",
  unknown: 'Something unexpected happened. Please try again.',
};
