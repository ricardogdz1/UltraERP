/* Wrapper da bridge pywebview.api.
   Aguarda a ponte Python ficar pronta antes da primeira chamada. */

const Api = (() => {
  // Espera até o método específico existir em window.pywebview.api.
  // Usa POLLING em vez de depender só do evento `pywebviewready`: esse
  // evento dispara uma única vez e, dependendo da ordem de carregamento do
  // WebView2, pode disparar ANTES de registrarmos o listener — o que deixava
  // a promise pendente para sempre e travava o botão "Entrar". O polling
  // não tem essa condição de corrida.
  function waitFor(method, timeoutMs) {
    return new Promise((resolve, reject) => {
      const inicio = Date.now();
      (function check() {
        const api = window.pywebview && window.pywebview.api;
        if (api && typeof api[method] === 'function') return resolve();
        if (Date.now() - inicio > timeoutMs) {
          return reject(new Error('ponte pywebview indisponível (método ' + method + ')'));
        }
        setTimeout(check, 40);
      })();
    });
  }

  // Watchdog: se a ponte não responder (falha silenciosa de mensageria), o
  // usuário nunca deve ficar preso num spinner sem explicação (seção 9).
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ ok: false, error: 'O aplicativo demorou demais para responder. Feche e abra novamente; se persistir, fale com o suporte.' }),
          ms
        )
      ),
    ]);
  }

  async function call(method, ...args) {
    try {
      await waitFor(method, 10000);
    } catch (e) {
      console.error('Api.call:', e);
      return { ok: false, error: 'O aplicativo ainda está iniciando ou a ponte interna falhou. Feche e abra novamente; se persistir, fale com o suporte.' };
    }
    try {
      return await withTimeout(window.pywebview.api[method](...args), 20000);
    } catch (e) {
      console.error('Api.call falhou:', method, e);
      return { ok: false, error: 'Algo deu errado no aplicativo. Feche e abra novamente; se persistir, fale com o suporte.' };
    }
  }

  return { call };
})();
