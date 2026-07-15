// js/title.js
// Dynamically loads the title.html into the #title-container div

document.addEventListener('DOMContentLoaded', function () {
  if (window.__nexyTitleInitialized) {
    return;
  }
  window.__nexyTitleInitialized = true;

  const t = (key, fallback) => (window.NexyI18n ? window.NexyI18n.t(key, fallback) : fallback);

  // adminAuth is an HttpOnly cookie, so the client can't read it directly to tell
  // login from logout; ask the server instead. Also toggles the Manage Posts/Manage
  // Bots menu items, which should only be reachable once actually logged in.
  function refreshAdminAuthAction() {
    const link = document.getElementById('adminAuthAction');
    if (!link) {
      return;
    }
    fetch('/admin/status')
      .then((response) => response.json())
      .then(({ authenticated }) => {
        const key = authenticated ? 'title.logout' : 'title.login';
        const href = authenticated ? '/logout' : '/login.html';
        link.setAttribute('data-i18n', key);
        link.setAttribute('href', href);
        link.textContent = t(key, authenticated ? 'Logout' : 'Login');
        document.querySelectorAll('.admin-only-menu-item').forEach((item) => {
          item.classList.toggle('hidden', !authenticated);
        });
      })
      .catch(() => {});
  }

  // Personal installations typically don't set up Resend, so the contact form has
  // nowhere to send its message; hide it and keep only the GitHub/LinkedIn links.
  function applyContactAvailability(root, available) {
    if (available) {
      return;
    }
    const section = root.querySelector('#contactFormSection');
    if (section) {
      section.classList.add('hidden');
    }
    const alternativesIntro = root.querySelector('#contactAlternativesIntro');
    if (alternativesIntro) {
      alternativesIntro.setAttribute('data-i18n', 'title.contactAlternativesOnlyIntro');
      alternativesIntro.textContent = t('title.contactAlternativesOnlyIntro', 'Reach out directly:');
    }
  }

  function bindContactForm(root) {
    const form = root.querySelector('#helpContactForm');
    const status = root.querySelector('#contactFormStatus');
    if (!form || !status) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      status.textContent = '';
      status.className = 'help-contact-status';
      button.disabled = true;

      const formData = new FormData(form);
      try {
        const response = await fetch('/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.get('name'),
            email: formData.get('email'),
            message: formData.get('message'),
          }),
        });
        if (!response.ok) {
          throw new Error('Contact form submission failed');
        }
        form.reset();
        status.textContent = t('helpPopup.contactSuccess', 'Thanks! Your message has been sent.');
        status.classList.add('success');
      } catch {
        status.textContent = t('helpPopup.contactError', 'Something went wrong. Please try again later.');
        status.classList.add('error');
      } finally {
        button.disabled = false;
      }
    });
  }

  const container = document.getElementById('title-container');
  if (container) {
    fetch('/title.html')
      .then((response) => response.text())
      .then((html) => {
        container.innerHTML = html;
        if (window.NexyI18n) {
          // title.html is loaded dynamically, so translate it after injection.
          window.NexyI18n.applyTranslations(container);
        }
        refreshAdminAuthAction();
        // The contact form lives directly in title.html (not lazily fetched like the
        // help FAQ), so bind it once, right after this injection.
        bindContactForm(container);
        fetch('/contact/status')
          .then((response) => response.json())
          .then(({ available }) => applyContactAvailability(container, available))
          .catch(() => applyContactAvailability(container, false));
      });
  }

  let helpContentLoaded = false;

  function getHelpElements() {
    return {
      modal: document.getElementById('helpInfoModal'),
      content: document.getElementById('helpInfoContent'),
    };
  }

  function loadHelpContent() {
    const elements = getHelpElements();
    if (!elements.content || helpContentLoaded) {
      return;
    }

    fetch('/help_popup_content.html')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load help content');
        }
        return response.text();
      })
      .then((html) => {
        elements.content.innerHTML = html;
        if (window.NexyI18n) {
          // Help body is a fragment, so it also needs an explicit translation pass.
          window.NexyI18n.applyTranslations(elements.content);
        }
        helpContentLoaded = true;
      })
      .catch(() => {
        elements.content.innerHTML = `<section><h3>${t('title.helpUnavailableHeading', 'Help unavailable')}</h3><p>${t('title.helpUnavailableMessage', 'Unable to load help content right now. Please try again.')}</p></section>`;
      });
  }

  // Mirrors the storage key used by NexyI18n so we can seed the selector before
  // i18n.init() finishes loading the locale resources.
  const I18N_STORAGE_KEY = 'nexy.locale';

  function readPersistedLocale(selector) {
    let stored = null;
    try {
      stored = localStorage.getItem(I18N_STORAGE_KEY);
    } catch (error) {
      stored = null;
    }

    if (!stored) {
      return null;
    }

    const lower = String(stored).toLowerCase();
    const primary = lower.split('-')[0];
    const options = Array.from(selector.options).map((option) => option.value);

    if (options.includes(lower)) {
      return lower;
    }
    if (options.includes(primary)) {
      return primary;
    }
    return null;
  }

  function setupLanguageSelector(selector) {
    // Seed the visible value from persisted locale immediately. NexyI18n.getLocale()
    // may still report the default 'en' if init() hasn't resolved its fetch yet,
    // which is what causes the dropdown to lag behind the actual UI language.
    const persisted = readPersistedLocale(selector);
    if (persisted) {
      selector.value = persisted;
    } else if (window.NexyI18n) {
      selector.value = window.NexyI18n.getLocale();
    }

    selector.addEventListener('change', async (event) => {
      if (!window.NexyI18n) {
        return;
      }
      try {
        await window.NexyI18n.setLocale(event.target.value);
      } catch (error) {
        console.error('Error changing locale:', error);
      }
    });

    if (window.NexyI18n) {
      // Keep the dropdown synced once init() (or any later setLocale) completes.
      window.NexyI18n.onChange(({ locale }) => {
        if (selector.value !== locale) {
          selector.value = locale;
        }
      });
    }
  }

  function openHelpModal() {
    const elements = getHelpElements();
    if (!elements.modal) {
      return;
    }
    loadHelpContent();
    elements.modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeHelpModal() {
    const elements = getHelpElements();
    if (!elements.modal) {
      return;
    }
    elements.modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function openContactModal() {
    const modal = document.getElementById('contactModal');
    if (!modal) {
      return;
    }
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeContactModal() {
    const modal = document.getElementById('contactModal');
    if (!modal) {
      return;
    }
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Toggle/close logic for the single Help/Contact/Admin icon dropdown in the title bar.
  function closeMenu() {
    const button = document.getElementById('mainMenuButton');
    const dropdown = document.getElementById('mainDropdown');
    if (!dropdown || !button) {
      return;
    }
    dropdown.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    const button = document.getElementById('mainMenuButton');
    const dropdown = document.getElementById('mainDropdown');
    if (!dropdown || !button) {
      return;
    }
    const willOpen = dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden', !willOpen);
    button.setAttribute('aria-expanded', String(willOpen));
  }

  document.addEventListener('click', function (event) {
    const target = event.target;
    const closest = (selector) => target.closest && target.closest(selector);

    if (closest('#mainMenuButton')) {
      event.preventDefault();
      toggleMenu();
      return;
    }

    if (target.id === 'openHelpAction') {
      event.preventDefault();
      closeMenu();
      openHelpModal();
      return;
    }

    if (target.id === 'openContactAction') {
      event.preventDefault();
      closeMenu();
      openContactModal();
      return;
    }

    if (!closest('.main-menu')) {
      closeMenu();
    }

    if (target.id === 'closeHelpInfo' || target.id === 'helpInfoModal') {
      closeHelpModal();
      return;
    }

    if (target.id === 'closeContactModal' || target.id === 'contactModal') {
      closeContactModal();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeHelpModal();
      closeContactModal();
      closeMenu();
    }
  });

  // title.html and navbar.html are injected independently, so initialize after insertion.
  const titleObserver = new MutationObserver(() => {
    const selector = document.getElementById('language-selector');
    if (selector && !selector.dataset.nexyLanguageBound) {
      selector.dataset.nexyLanguageBound = 'true';
      setupLanguageSelector(selector);
      titleObserver.disconnect();
    }
  });

  titleObserver.observe(document.body, { childList: true, subtree: true });
});
