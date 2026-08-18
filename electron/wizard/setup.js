// First-run wizard. Screens: language -> welcome (choose a path) -> admin
// password -> [optional] paste key -> done. Runs in its own BrowserWindow,
// BEFORE the Express server starts (see main.cjs) -- language and key choices
// here affect which seed gets copied and what env vars the server boots with.
//
// setStatus/clearStatus/KEY_ERROR_MESSAGES come from shared.js.

const screens = {
  language: document.getElementById('screen-language'),
  welcome: document.getElementById('screen-welcome'),
  password: document.getElementById('screen-password'),
  key: document.getElementById('screen-key'),
  doneSkip: document.getElementById('screen-done-skip'),
  doneKey: document.getElementById('screen-done-key'),
};

// Populated once getConfig()/getAvailableLocales() resolve; mutated as the
// teacher moves through the wizard, then written out in one go by finish().
const state = {
  locale: 'en',
  adminPassword: '',
  openaiApiKey: null,
};

function showScreen(name) {
  for (const el of Object.values(screens)) el.classList.remove('active');
  screens[name].classList.add('active');
}

// Every screen has both EN and PT copy baked in as data attributes would be
// overkill for ~10 short strings across 6 screens -- a single lookup table is
// simpler to keep in sync than scattering data-i18n attributes through the HTML.
const STRINGS = {
  en: {
    welcomeTitle: 'Welcome to Nexy',
    welcomeIntro:
      "Nexy is a pretend social network for your classroom. Everything in it is fake, the people, the photos, the arguments, so your students can practise spotting manipulation somewhere it can't hurt anyone. Nexy is ready to use right now, with a complete made-up world already inside it. Nothing is downloaded and nothing is sent anywhere.",
    skipCardTitle: 'Start using Nexy',
    skipCardBody:
      'Explore the ready-made world. Perfect for your first lesson, your students can read the feed, dig into the comments, and argue about what looks real.',
    setupCardTitle: 'Set up AI content creation',
    setupCardBody:
      'Also let Nexy invent brand-new posts during the lesson. Needs a paid OpenAI account and costs roughly 2 cents per post. You can always do this later instead.',
    welcomeNote:
      "Without AI set-up you can explore everything that's already there, but Nexy can't create anything new, no new posts, no new comments, no disinformation campaigns.",
    passwordTitle: 'A password just for you',
    passwordIntro:
      "Nexy has a few teacher-only screens where you can delete posts or bot accounts and you don't want your students to see. They're locked so a curious student can't get in.",
    passwordGeneratedLabel: "We've picked a password for you:",
    passwordHelper:
      'Write it down, or click Copy and paste it somewhere safe. You can change it later in File > Settings.',
    passwordTooShort: 'Please use at least 6 characters.',
    keyTitle: 'Paste your key here',
    keyIntro:
      'Nothing is sent anywhere except to OpenAI, to check the key works. The key is saved on this computer only.',
    keyLabel: 'OpenAI API key',
    doneSkipTitle: "You're all set",
    doneSkipBody:
      "Nexy is running on this computer. Your students' work stays on this machine, nothing goes to the internet.",
    doneSkipHint: "Want to add AI content creation later? It's in File > Settings, in the menu at the top.",
    doneKeyTitle: 'Your key works',
    doneKeyBody:
      'Nexy can now create new content. One more thing worth doing: set a spending limit on your OpenAI account, so Nexy can never cost more than you decide.',
    checking: 'Checking your key...',
    keyWorks: 'Your key works. Nexy can now create new content.',
  },
  pt: {
    welcomeTitle: 'Bem-vindo à Nexy',
    welcomeIntro:
      'A Nexy é uma rede social a fingir para a tua sala de aula. Tudo nela é inventado, as pessoas, as fotos, as discussões, para os teus alunos praticarem a deteção de manipulação sem que isso magoe ninguém a sério. A Nexy está pronta a usar já, com um mundo inventado completo lá dentro. Nada é descarregado e nada é enviado para lado nenhum.',
    skipCardTitle: 'Começar a usar a Nexy',
    skipCardBody:
      'Explora o mundo já pronto. Perfeito para a tua primeira aula, os teus alunos podem ler o feed, explorar os comentários e discutir o que parece real.',
    setupCardTitle: 'Configurar criação de conteúdo por IA',
    setupCardBody:
      'Deixa também a Nexy inventar publicações novas durante a aula. Precisa de uma conta paga da OpenAI e custa cerca de 2 cêntimos por publicação. Podes sempre fazer isto mais tarde.',
    welcomeNote:
      'Sem configurar isto, podes explorar tudo o que já lá está, mas a Nexy não consegue criar nada de novo, sem publicações novas, sem comentários novos, sem campanhas de desinformação.',
    passwordTitle: 'Uma palavra-passe só para ti',
    passwordIntro:
      'A Nexy tem alguns ecrãs só para professores, onde podes apagar publicações ou contas de bots e que não queres que os teus alunos vejam. Estão trancados para que nenhum aluno curioso lá entre.',
    passwordGeneratedLabel: 'Escolhemos uma palavra-passe para ti:',
    passwordHelper:
      'Aponta-a, ou clica em Copiar e cola-a num sítio seguro. Podes alterá-la mais tarde em File > Settings.',
    passwordTooShort: 'Usa pelo menos 6 caracteres.',
    keyTitle: 'Cola aqui a tua chave',
    keyIntro:
      'Nada é enviado para lado nenhum exceto para a OpenAI, para verificar se a chave funciona. A chave é guardada apenas neste computador.',
    keyLabel: 'Chave da API da OpenAI',
    doneSkipTitle: 'Tudo pronto',
    doneSkipBody:
      'A Nexy está a funcionar neste computador. O trabalho dos teus alunos fica só nesta máquina, nada vai para a internet.',
    doneSkipHint: 'Queres adicionar a criação de conteúdo por IA mais tarde? Está em File > Settings, no menu do topo.',
    doneKeyTitle: 'A tua chave funciona',
    doneKeyBody:
      'A Nexy já pode criar conteúdo novo. Mais uma coisa que vale a pena fazer: define um limite de gastos na tua conta OpenAI, para a Nexy nunca poder custar mais do que decidires.',
    checking: 'A verificar a tua chave...',
    keyWorks: 'A tua chave funciona. A Nexy já pode criar conteúdo novo.',
  },
};

function applyStrings() {
  const t = STRINGS[state.locale] || STRINGS.en;
  document.getElementById('welcomeTitle').textContent = t.welcomeTitle;
  document.getElementById('welcomeIntro').textContent = t.welcomeIntro;
  document.getElementById('skipCardTitle').textContent = t.skipCardTitle;
  document.getElementById('skipCardBody').textContent = t.skipCardBody;
  document.getElementById('setupCardTitle').textContent = t.setupCardTitle;
  document.getElementById('setupCardBody').textContent = t.setupCardBody;
  document.getElementById('skipKeyBtn').textContent = t.skipCardTitle;
  document.getElementById('setupKeyBtn').textContent = t.setupCardTitle;
  document.getElementById('welcomeNote').textContent = t.welcomeNote;

  document.getElementById('passwordTitle').textContent = t.passwordTitle;
  document.getElementById('passwordIntro').textContent = t.passwordIntro;
  document.getElementById('passwordGeneratedLabel').textContent = t.passwordGeneratedLabel;
  document.getElementById('passwordHelper').textContent = t.passwordHelper;

  document.getElementById('keyTitle').textContent = t.keyTitle;
  document.getElementById('keyIntro').textContent = t.keyIntro;
  document.getElementById('keyLabel').textContent = t.keyLabel;

  document.getElementById('doneSkipTitle').textContent = t.doneSkipTitle;
  document.getElementById('doneSkipBody').textContent = t.doneSkipBody;
  document.getElementById('doneSkipHint').textContent = t.doneSkipHint;
  document.getElementById('doneKeyTitle').textContent = t.doneKeyTitle;
  document.getElementById('doneKeyBody').textContent = t.doneKeyBody;
}

// --- Screen 1: language ---
document.querySelectorAll('.lang-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.locale = btn.dataset.locale;
    applyStrings();
    showScreen('welcome');
  });
});

// --- Screen 2: welcome / choose a path ---
document.getElementById('skipKeyBtn').addEventListener('click', () => {
  showScreen('password');
  document.getElementById('screen-password').dataset.nextOnContinue = 'doneSkip';
});

document.getElementById('setupKeyBtn').addEventListener('click', () => {
  showScreen('password');
  document.getElementById('screen-password').dataset.nextOnContinue = 'key';
});

// --- Screen 3: admin password ---
const adminPasswordInput = document.getElementById('adminPasswordInput');
const togglePasswordVisibility = document.getElementById('togglePasswordVisibility');
const copyPasswordBtn = document.getElementById('copyPasswordBtn');
const passwordStatus = document.getElementById('passwordStatus');
const passwordContinueBtn = document.getElementById('passwordContinueBtn');

// Masked by default: a teacher may already be projecting this wizard to the
// class (some do this to show students how the app was set up), so the
// generated password shouldn't be plaintext-visible until they choose to
// reveal it.
togglePasswordVisibility.addEventListener('click', () => {
  const isPassword = adminPasswordInput.type === 'password';
  adminPasswordInput.type = isPassword ? 'text' : 'password';
  togglePasswordVisibility.textContent = isPassword ? 'Hide' : 'Show';
});

copyPasswordBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(adminPasswordInput.value);
    copyPasswordBtn.textContent = 'Copied!';
  } catch {
    // Never claim success on a failed write -- see main.cjs's
    // setPermissionRequestHandler for why this could previously fail silently.
    copyPasswordBtn.textContent = "Couldn't copy";
  }
  setTimeout(() => (copyPasswordBtn.textContent = 'Copy'), 1500);
});

passwordContinueBtn.addEventListener('click', () => {
  const value = adminPasswordInput.value.trim();
  const t = STRINGS[state.locale] || STRINGS.en;
  if (value.length < 6) {
    setStatus(passwordStatus, 'err', t.passwordTooShort);
    return;
  }
  state.adminPassword = value;
  clearStatus(passwordStatus);
  const next = document.getElementById('screen-password').dataset.nextOnContinue;
  showScreen(next === 'key' ? 'key' : 'doneSkip');
  if (next !== 'key') {
    finish({ skippedKeySetup: true });
  }
});

// --- Screen 4: paste the key ---
const apiKeyInput = document.getElementById('apiKeyInput');
const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
const getKeyLink = document.getElementById('getKeyLink');
const keyStatus = document.getElementById('keyStatus');
const keyBackBtn = document.getElementById('keyBackBtn');
const keySkipBtn = document.getElementById('keySkipBtn');
const keyCheckBtn = document.getElementById('keyCheckBtn');

toggleKeyVisibility.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleKeyVisibility.textContent = isPassword ? 'Hide' : 'Show';
});

getKeyLink.addEventListener('click', (event) => {
  event.preventDefault();
  window.nexySetup.openExternal('https://platform.openai.com/api-keys');
});

keyBackBtn.addEventListener('click', () => {
  showScreen('welcome');
});

keySkipBtn.addEventListener('click', () => {
  showScreen('doneSkip');
  finish({ skippedKeySetup: true });
});

keyCheckBtn.addEventListener('click', async () => {
  const value = apiKeyInput.value.trim();
  const t = STRINGS[state.locale] || STRINGS.en;
  if (!value) {
    setStatus(keyStatus, 'err', KEY_ERROR_MESSAGES.empty);
    return;
  }
  keyCheckBtn.disabled = true;
  setStatus(keyStatus, 'info', t.checking);

  const result = await window.nexySetup.validateApiKey(value);
  if (result.ok) {
    state.openaiApiKey = value;
    setStatus(keyStatus, 'ok', t.keyWorks);
    setTimeout(() => {
      showScreen('doneKey');
      finish({ openaiApiKey: value, skippedKeySetup: false });
    }, 700);
  } else {
    setStatus(keyStatus, 'err', KEY_ERROR_MESSAGES[result.reason] || KEY_ERROR_MESSAGES.unknown);
  }
  keyCheckBtn.disabled = false;
});

// --- Screen 5b: done (key configured) ---
document.getElementById('openLimitsBtn').addEventListener('click', () => {
  window.nexySetup.openExternal('https://platform.openai.com/settings/organization/limits');
});

// --- Finishing ---
// Writes every choice made in the wizard in one call and tells main.cjs the
// server can now start. Called once state stops changing for this run (either
// right after picking "skip", or right after a key validates), NOT on every
// screen transition, so a half-finished wizard never leaves setupCompleted set.
let finished = false;
async function finish(extra) {
  if (finished) return;
  finished = true;
  await window.nexySetup.completeSetup({
    locale: state.locale,
    adminPassword: state.adminPassword,
    setupCompleted: true,
    ...extra,
  });
}

document.getElementById('openNexySkipBtn').addEventListener('click', () => window.close());
document.getElementById('openNexyKeyBtn').addEventListener('click', () => window.close());

// --- Init ---
async function init() {
  const config = await window.nexySetup.getConfig();
  state.adminPassword = config.adminPassword || '';
  adminPasswordInput.value = state.adminPassword;

  const available = await window.nexySetup.getAvailableLocales();
  if (available.length === 1) {
    // Only one seed locale is actually available -- skip asking a question
    // whose answer wouldn't change anything.
    state.locale = available[0];
    applyStrings();
    showScreen('welcome');
  } else {
    showScreen('language');
  }
}

clearStatus(passwordStatus);
clearStatus(keyStatus);
init();
