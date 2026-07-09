/* Tema claro/escuro: segue o SO por padrão, com alternância manual persistida. */

const Theme = (() => {
  const KEY = 'ultraerp.theme';

  function systemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
  }

  function init() {
    apply(localStorage.getItem(KEY) || systemTheme());
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!localStorage.getItem(KEY)) apply(systemTheme());
    });
  }

  function toggle() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, next);
    apply(next);
  }

  return { init, toggle };
})();

Theme.init();
