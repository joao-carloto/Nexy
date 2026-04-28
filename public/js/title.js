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

  function setupLanguageSelector() {
    const selector = document.getElementById('language-selector');
    if (!selector || !window.NexyI18n) {
      return;
    }

    selector.value = window.NexyI18n.getLocale();

    selector.addEventListener('change', async (event) => {
      try {
        await window.NexyI18n.setLocale(event.target.value);
      } catch (error) {
        console.error('Error changing locale:', error);
      }
    });

    window.NexyI18n.onChange(({ locale }) => {
      if (selector.value !== locale) {
        selector.value = locale;
      }
    });
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
    if (document.getElementById('language-selector')) {
      setupLanguageSelector();
      titleObserver.disconnect();
    }
  });

  titleObserver.observe(document.body, { childList: true, subtree: true });
});
