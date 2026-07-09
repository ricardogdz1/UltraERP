/* Gerenciador de abas estilo navegador (especificação, seção 5).
   Cada módulo abre uma aba; o painel fica vivo no DOM (apenas oculto)
   ao trocar de aba, preservando formulários em andamento. */

const Tabs = (() => {
  const MAX_TABS = 8; // limite para não pesar a memória
  const tabs = new Map(); // id -> { tabEl, panelEl }
  let activeId = null;
  let tabbar, panels;

  function init(tabbarEl, panelsEl) {
    tabbar = tabbarEl;
    panels = panelsEl;
  }

  function open(id, label, renderFn) {
    if (tabs.has(id)) return activate(id);
    if (tabs.size >= MAX_TABS) {
      alert('Limite de ' + MAX_TABS + ' abas abertas atingido. Feche uma aba para abrir outra.');
      return;
    }

    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.innerHTML =
      '<span>' + label + '</span><button class="tab-close" title="Fechar aba">✕</button>';
    tabEl.addEventListener('click', () => activate(id));
    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      close(id);
    });
    tabbar.appendChild(tabEl);

    const panelEl = document.createElement('section');
    panelEl.className = 'tab-panel';
    panelEl.hidden = true;
    panels.appendChild(panelEl);
    renderFn(panelEl);

    tabs.set(id, { tabEl, panelEl });
    activate(id);
  }

  function activate(id) {
    for (const [tid, t] of tabs) {
      const on = tid === id;
      t.tabEl.classList.toggle('active', on);
      t.panelEl.hidden = !on;
    }
    activeId = id;
  }

  function close(id) {
    const t = tabs.get(id);
    if (!t) return;
    t.tabEl.remove();
    t.panelEl.remove();
    tabs.delete(id);
    if (activeId === id) {
      const last = [...tabs.keys()].pop();
      if (last) activate(last);
      else activeId = null;
    }
  }

  function closeAll() {
    for (const id of [...tabs.keys()]) close(id);
  }

  return { init, open, close, closeAll };
})();
