// js/title.js
// Dynamically loads the title.html into the #title-container div

document.addEventListener('DOMContentLoaded', function () {
  if (window.__nexyTitleInitialized) {
    return;
  }
  window.__nexyTitleInitialized = true;

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
        const t = (key, fallback) => (window.NexyI18n ? window.NexyI18n.t(key, fallback) : fallback);
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

  document.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('.help-button')) {
      event.preventDefault();
      openHelpModal();
      return;
    }

    if (event.target.id === 'closeHelpInfo') {
      closeHelpModal();
      return;
    }

    if (event.target.id === 'helpInfoModal') {
      closeHelpModal();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeHelpModal();
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
