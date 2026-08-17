const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeySavedNotice = document.getElementById('apiKeySavedNotice');
const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
const removeKeyBtn = document.getElementById('removeKeyBtn');
const checkAndSaveKeyBtn = document.getElementById('checkAndSaveKeyBtn');
const keyStatus = document.getElementById('keyStatus');
const getKeyLink = document.getElementById('getKeyLink');

const adminPasswordInput = document.getElementById('adminPasswordInput');
const togglePasswordVisibility = document.getElementById('togglePasswordVisibility');
const copyPasswordBtn = document.getElementById('copyPasswordBtn');
const savePasswordBtn = document.getElementById('savePasswordBtn');
const passwordStatus = document.getElementById('passwordStatus');

const closeBtn = document.getElementById('closeBtn');

const classroomModeToggle = document.getElementById('classroomModeToggle');
const classroomJoinInfo = document.getElementById('classroomJoinInfo');
const joinUrlDisplay = document.getElementById('joinUrlDisplay');
const copyJoinUrlBtn = document.getElementById('copyJoinUrlBtn');
const classroomStatus = document.getElementById('classroomStatus');

// setStatus/clearStatus/KEY_ERROR_MESSAGES come from shared.js (loaded first
// in settings.html), so both this page and the first-run wizard show
// identical copy for the same OpenAI validation failure.

async function refreshJoinInfo() {
  if (!classroomModeToggle.checked) {
    classroomJoinInfo.style.display = 'none';
    return;
  }
  const joinInfo = await window.nexySetup.getJoinInfo();
  if (joinInfo.address) {
    joinUrlDisplay.value = `http://${joinInfo.address}:${joinInfo.port}`;
    classroomJoinInfo.style.display = 'block';
  } else {
    // No non-virtual network interface could be found (e.g. offline machine) --
    // classroom mode would bind 0.0.0.0 but there's no address worth showing a
    // student, since nothing outside this machine could actually reach it.
    classroomJoinInfo.style.display = 'none';
    setStatus(
      classroomStatus,
      'err',
      "Couldn't find a network address for this computer. Check it's connected to Wi-Fi or Ethernet."
    );
  }
}

// The saved key is never sent to the renderer (see main.cjs's nexy:get-config
// handler), so this box can never actually show it -- it can only ever be
// used to type a NEW key. Showing/hiding a permanently-empty field would be
// meaningless, so the Show/Hide button and placeholder only make sense once
// there's something typed in the box; the "already saved" state instead gets
// its own explanatory notice, so a teacher isn't left wondering why "Show"
// reveals nothing.
function setKeyFieldSavedState(hasApiKey) {
  apiKeySavedNotice.style.display = hasApiKey ? 'block' : 'none';
  apiKeyInput.placeholder = hasApiKey ? 'Paste a new key to replace it' : 'sk-...';
}

async function init() {
  const config = await window.nexySetup.getConfig();
  setKeyFieldSavedState(config.hasApiKey);
  adminPasswordInput.value = config.adminPassword || '';
  classroomModeToggle.checked = Boolean(config.classroomMode);
  await refreshJoinInfo();
}

toggleKeyVisibility.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleKeyVisibility.textContent = isPassword ? 'Hide' : 'Show';
});

getKeyLink.addEventListener('click', (event) => {
  event.preventDefault();
  window.nexySetup.openExternal('https://platform.openai.com/api-keys');
});

checkAndSaveKeyBtn.addEventListener('click', async () => {
  const value = apiKeyInput.value.trim();
  if (!value) {
    setStatus(keyStatus, 'err', KEY_ERROR_MESSAGES.empty);
    return;
  }
  checkAndSaveKeyBtn.disabled = true;
  setStatus(keyStatus, 'info', 'Checking your key...');

  const result = await window.nexySetup.validateApiKey(value);
  if (result.ok) {
    await window.nexySetup.saveConfig({ openaiApiKey: value, skippedKeySetup: false });
    setStatus(keyStatus, 'ok', 'Your key works. Nexy can now create new content.');
    apiKeyInput.value = '';
    setKeyFieldSavedState(true);
  } else {
    setStatus(keyStatus, 'err', KEY_ERROR_MESSAGES[result.reason] || KEY_ERROR_MESSAGES.unknown);
  }
  checkAndSaveKeyBtn.disabled = false;
});

removeKeyBtn.addEventListener('click', async () => {
  await window.nexySetup.saveConfig({ openaiApiKey: null });
  apiKeyInput.value = '';
  setKeyFieldSavedState(false);
  setStatus(keyStatus, 'info', 'Key removed. Nexy is back to browse-only mode.');
});

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
    // Never claim success on a failed write -- a silent failure here
    // previously left the clipboard holding whatever was copied last (e.g.
    // the classroom join URL), which looked like "the wrong thing got copied"
    // rather than "the copy silently didn't happen".
    copyPasswordBtn.textContent = "Couldn't copy";
  }
  setTimeout(() => (copyPasswordBtn.textContent = 'Copy'), 1500);
});

savePasswordBtn.addEventListener('click', async () => {
  const value = adminPasswordInput.value.trim();
  if (value.length < 6) {
    setStatus(passwordStatus, 'err', 'Please use at least 6 characters.');
    return;
  }
  await window.nexySetup.saveConfig({ adminPassword: value });
  setStatus(passwordStatus, 'ok', 'Saved. Restarting Nexy to apply it...');
  setTimeout(() => window.nexySetup.relaunch(), 1200);
});

classroomModeToggle.addEventListener('change', async () => {
  const enabled = classroomModeToggle.checked;
  await window.nexySetup.saveConfig({ classroomMode: enabled });
  // Don't show a join URL yet: the server is still running on its OLD port in
  // its OLD bind mode until the restart below completes, and a fresh port is
  // chosen on every launch (see server-lifecycle.cjs's findFreePort()), so
  // anything shown right now would very likely be wrong. Settings' own init()
  // will show the correct address/port once reopened after the restart.
  classroomJoinInfo.style.display = 'none';
  setStatus(
    classroomStatus,
    'ok',
    enabled
      ? "Saved. Restarting Nexy — reopen Settings afterwards for the address to give your students."
      : 'Saved. Restarting Nexy to go back to this computer only...'
  );
  setTimeout(() => window.nexySetup.relaunch(), 1200);
});

copyJoinUrlBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(joinUrlDisplay.value);
    copyJoinUrlBtn.textContent = 'Copied!';
  } catch {
    copyJoinUrlBtn.textContent = "Couldn't copy";
  }
  setTimeout(() => (copyJoinUrlBtn.textContent = 'Copy'), 1500);
});

closeBtn.addEventListener('click', () => {
  window.nexySetup.close();
});

clearStatus(keyStatus);
clearStatus(passwordStatus);
init();
