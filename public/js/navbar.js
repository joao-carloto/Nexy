async function ensureUserId() {
  // Shared persona state is stored in localStorage under randomUser.
  let userId = localStorage.getItem('randomUser') ? JSON.parse(localStorage.getItem('randomUser')).userId : null;

  if (!userId) {
    try {
      // Bootstrap persona when none is cached.
      const response = await fetch('/random-user');
      if (!response.ok) {
        throw new Error('Failed to fetch random user');
      }
      const randomUser = await response.json();

      // Persist once so all pages can reuse the same selected user.
      localStorage.setItem('randomUser', JSON.stringify(randomUser));
      userId = randomUser.userId;
      console.log('Random user selected:', randomUser);
    } catch (error) {
      console.error('Error fetching random user:', error);
      alert('Failed to select a random user. Please try again.');
    }
  }

  return userId;
}

function ensureI18nScript() {
  if (window.NexyI18n) {
    return Promise.resolve(window.NexyI18n);
  }

  // Reuse a pending script tag if another module already started loading i18n.js.
  const existingScript = document.getElementById('nexy-i18n-script');
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve(window.NexyI18n), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load i18n script')), { once: true });
    });
  }

  const script = document.createElement('script');
  script.id = 'nexy-i18n-script';
  script.src = '/js/i18n.js';

  return new Promise((resolve, reject) => {
    script.onload = () => resolve(window.NexyI18n);
    script.onerror = () => reject(new Error('Failed to load i18n script'));
    document.head.appendChild(script);
  });
}

async function bootstrapI18n() {
  try {
    await ensureI18nScript();
    if (window.NexyI18n) {
      // init() resolves locale, loads resources and translates current DOM.
      await window.NexyI18n.init();
    }
  } catch (error) {
    console.error('Error initializing i18n:', error);
  }
}

async function loadNavbar() {
  // Navbar is a shared HTML fragment injected at runtime.
  const response = await fetch('/navbar.html');
  const navbarHTML = await response.text();
  document.body.insertAdjacentHTML('afterbegin', navbarHTML);

  const navbarElement = document.getElementById('site-navbar');
  if (window.NexyI18n && navbarElement) {
    // Translate only the injected fragment to avoid unnecessary full-document scans.
    window.NexyI18n.applyTranslations(navbarElement);
  }

  // After injection, resolve and update the avatar placeholder.
  const userId = localStorage.getItem('randomUser') ? JSON.parse(localStorage.getItem('randomUser')).userId : null;

  const thumbnailElement = document.getElementById('random-bot-thumbnail');

  if (userId) {
    // Naming contract: /thumbnails/profile_pictures/<userId>-thumbnail.png
    thumbnailElement.src = `/thumbnails/profile_pictures/${userId}-thumbnail.png`;
  } else {
    // Set a default placeholder image if no userId is found
    thumbnailElement.src = 'images/logo.png';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await bootstrapI18n();
  // Ensure persona exists before navbar render to avoid broken avatar state.
  await ensureUserId();
  await loadNavbar();
});
