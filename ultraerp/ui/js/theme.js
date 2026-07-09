/* Tema claro/escuro: segue o SO por padrão, com alternância manual salva nas
   preferências (lado Python), pois o WebView roda em modo privado e não
   preserva localStorage entre execuções. */

const Theme = (() => {
  let manual = false; // usuário escolheu manualmente? (então não segue o SO)

  function systemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
  }

  async function init() {
    apply(systemTheme()); // aplica o do SO já, para não piscar
    const pr = await Api.call('prefs_get');
    const salvo = pr.ok && pr.data && pr.data.theme;
    if (salvo) { manual = true; apply(salvo); }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!manual) apply(systemTheme());
    });
  }

  async function toggle() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    manual = true;
    apply(next);
    await Api.call('prefs_set', { theme: next });
  }

  return { init, toggle };
})();

Theme.init();
