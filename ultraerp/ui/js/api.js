/* Wrapper da bridge pywebview.api.
   Aguarda o evento pywebviewready antes da primeira chamada. */

const Api = (() => {
  let ready = null;

  function waitReady() {
    if (window.pywebview && window.pywebview.api) return Promise.resolve();
    if (!ready) {
      ready = new Promise((resolve) =>
        window.addEventListener('pywebviewready', resolve, { once: true })
      );
    }
    return ready;
  }

  async function call(method, ...args) {
    await waitReady();
    try {
      return await window.pywebview.api[method](...args);
    } catch (e) {
      return { ok: false, error: 'Algo deu errado no aplicativo. Feche e abra novamente; se persistir, fale com o suporte.' };
    }
  }

  return { call };
})();
