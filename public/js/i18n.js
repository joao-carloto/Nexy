(function () {
  if (window.NexyI18n) {
    return;
  }

  // Keep English as the canonical fallback when a key is missing in the active locale.
  const DEFAULT_LOCALE = 'en';
  const SUPPORTED_LOCALES = ['en', 'pt'];
  const STORAGE_KEY = 'nexy.locale';
  const resources = {};
  let currentLocale = DEFAULT_LOCALE;

  function normalizeLocale(input) {
    if (!input || typeof input !== 'string') {
      return DEFAULT_LOCALE;
    }

    const lower = input.toLowerCase();
    const primary = lower.split('-')[0];

    if (SUPPORTED_LOCALES.includes(lower)) {
      return lower;
    }
    if (SUPPORTED_LOCALES.includes(primary)) {
      return primary;
    }

    return DEFAULT_LOCALE;
  }

  async function loadLocale(locale) {
    if (resources[locale]) {
      return resources[locale];
    }

    // Locale files are lazy-loaded so we only fetch languages users actually select.
    const response = await fetch(`/i18n/${locale}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load locale: ${locale}`);
    }

    resources[locale] = await response.json();
    return resources[locale];
  }

  function resolveKey(obj, path) {
    return path.split('.').reduce((acc, part) => {
      if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
        return acc[part];
      }
      return undefined;
    }, obj);
  }

  function interpolate(text, vars) {
    if (!vars) {
      return text;
    }

    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      if (Object.prototype.hasOwnProperty.call(vars, key)) {
        return String(vars[key]);
      }
      return match;
    });
  }

  function t(key, fallback = '', vars) {
    const currentResources = resources[currentLocale] || {};
    const defaultResources = resources[DEFAULT_LOCALE] || {};

    // Resolution order: active locale -> default locale -> attribute/text fallback -> key.
    const fromCurrent = resolveKey(currentResources, key);
    const fromDefault = resolveKey(defaultResources, key);
    const value = fromCurrent ?? fromDefault ?? fallback ?? key;

    return interpolate(String(value), vars);
  }

  function applyTranslations(root = document) {
    // data-i18n-html is intended for trusted, pre-authored rich HTML blocks.
    root.querySelectorAll('[data-i18n-html]').forEach((element) => {
      const key = element.getAttribute('data-i18n-html');
      const fallback = element.innerHTML;
      element.innerHTML = t(key, fallback);
    });

    root.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.getAttribute('data-i18n');
      const fallback = element.textContent.trim();
      element.textContent = t(key, fallback);
    });

    root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const key = element.getAttribute('data-i18n-placeholder');
      const fallback = element.getAttribute('placeholder') || '';
      element.setAttribute('placeholder', t(key, fallback));
    });

    root.querySelectorAll('[data-i18n-title]').forEach((element) => {
      const key = element.getAttribute('data-i18n-title');
      const fallback = element.getAttribute('title') || '';
      element.setAttribute('title', t(key, fallback));
    });

    root.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
      const key = element.getAttribute('data-i18n-aria-label');
      const fallback = element.getAttribute('aria-label') || '';
      element.setAttribute('aria-label', t(key, fallback));
    });

    root.querySelectorAll('[data-i18n-alt]').forEach((element) => {
      const key = element.getAttribute('data-i18n-alt');
      const fallback = element.getAttribute('alt') || '';
      element.setAttribute('alt', t(key, fallback));
    });

    root.querySelectorAll('[data-i18n-value]').forEach((element) => {
      const key = element.getAttribute('data-i18n-value');
      const fallback = element.value || '';
      element.value = t(key, fallback);
    });
  }

  function emitLocaleChange() {
    // Expose selected language to browser/assistive tooling and notify subscribers.
    document.documentElement.setAttribute('lang', currentLocale);
    window.dispatchEvent(new CustomEvent('nexy:i18n:updated', { detail: { locale: currentLocale } }));
  }

  async function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const browserLocale = normalizeLocale(navigator.language || DEFAULT_LOCALE);
    const targetLocale = normalizeLocale(saved || browserLocale);

    // Always load fallback locale first so missing keys still render readable text.
    await loadLocale(DEFAULT_LOCALE);
    if (targetLocale !== DEFAULT_LOCALE) {
      await loadLocale(targetLocale);
    }

    currentLocale = targetLocale;
    applyTranslations(document);
    emitLocaleChange();

    return currentLocale;
  }

  async function setLocale(nextLocale) {
    const normalized = normalizeLocale(nextLocale);
    await loadLocale(normalized);

    currentLocale = normalized;
    // Persist selection so locale stays stable across navigation.
    localStorage.setItem(STORAGE_KEY, currentLocale);

    applyTranslations(document);
    emitLocaleChange();

    return currentLocale;
  }

  function getLocale() {
    return currentLocale;
  }

  function onChange(callback) {
    if (typeof callback !== 'function') {
      return function () {};
    }

    const handler = (event) => {
      callback(event.detail || { locale: currentLocale });
    };

    window.addEventListener('nexy:i18n:updated', handler);
    return function () {
      window.removeEventListener('nexy:i18n:updated', handler);
    };
  }

  window.NexyI18n = {
    supportedLocales: SUPPORTED_LOCALES.slice(),
    init,
    setLocale,
    getLocale,
    t,
    applyTranslations,
    onChange,
  };
})();
