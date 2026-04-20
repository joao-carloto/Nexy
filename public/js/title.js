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
        helpContentLoaded = true;
      })
      .catch(() => {
        elements.content.innerHTML =
          '<section><h3>Help unavailable</h3><p>Unable to load help content right now. Please try again.</p></section>';
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
});
