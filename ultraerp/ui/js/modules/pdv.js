/* Módulo PDV (Ponto de Venda) — Fase 1.
   Busca de produto (código de barras/nome) → carrinho → pagamento → baixa
   de estoque atômica via RPC. Emissão fiscal (NFC-e) virá com a integração
   da API fiscal. O estado do carrinho vive no painel da aba (preservado ao
   trocar de aba). */

const ModuloPDV = (() => {

  const brl = (v) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Converte texto no formato brasileiro para número (vírgula = decimal).
  const numBR = (s) => {
    s = String(s || '').trim();
    return s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  };

  const FORMAS = [
    { id: 'dinheiro', label: 'Dinheiro' },
    { id: 'debito', label: 'Cartão débito' },
    { id: 'credito', label: 'Cartão crédito' },
    { id: 'pix', label: 'PIX' },
  ];

  function render(panel) {
    const carrinho = []; // {produto_id, nome, ean, preco, quantidade, estoque}
    const estado = { forma: 'dinheiro' };
    const $ = (sel) => panel.querySelector(sel);

    panel.innerHTML = `
      <div class="pdv">
        <div class="pdv-esq">
          <div class="mod-header"><h2>Ponto de Venda</h2></div>
          <div class="toolbar">
            <input class="busca-pdv" placeholder="Código de barras ou nome do produto — digite e Enter">
          </div>
          <div class="pdv-resultados"></div>
        </div>
        <div class="pdv-dir">
          <h3>Venda atual</h3>
          <div class="pdv-carrinho"></div>
          <div class="pdv-total"><span>Total</span><strong class="pdv-total-valor">R$ 0,00</strong></div>
          <div class="pdv-pagamento">
            <label>Forma de pagamento</label>
            <div class="pdv-formas">
              ${FORMAS.map(f => `<button class="pdv-forma ${f.id === 'dinheiro' ? 'ativa' : ''}" data-forma="${f.id}">${f.label}</button>`).join('')}
            </div>
            <div class="pdv-dinheiro">
              <label>Valor recebido (R$)</label>
              <input class="pdv-recebido" inputmode="decimal" placeholder="0,00">
              <p class="pdv-troco muted"></p>
            </div>
          </div>
          <p class="field-error pdv-erro" hidden></p>
          <button class="btn-primary pdv-finalizar" disabled>Finalizar venda</button>
          <div class="pdv-sucesso" hidden></div>
        </div>
      </div>`;

    // ---- busca --------------------------------------------------------------

    async function buscar(termo) {
      const box = $('.pdv-resultados');
      if (!termo) { box.innerHTML = '<p class="muted">Digite o código de barras ou o nome do produto.</p>'; return; }
      box.innerHTML = '<p class="muted">Buscando…</p>';
      const r = await Api.call('estoque_listar', 1, termo, false);
      if (!r.ok) { box.innerHTML = `<p class="field-error">${esc(r.error)}</p>`; return; }
      const itens = r.data.itens;
      if (!itens.length) { box.innerHTML = '<p class="muted">Nenhum produto encontrado.</p>'; return; }

      // código de barras exato com 1 resultado: adiciona direto e limpa a busca
      if (itens.length === 1 && itens[0].ean && itens[0].ean === termo) {
        adicionar(itens[0]);
        $('.busca-pdv').value = '';
        box.innerHTML = '<p class="muted">Produto adicionado. Continue lendo os próximos.</p>';
        return;
      }

      box.innerHTML = `<div class="pdv-lista">${itens.map(p => `
        <button class="pdv-item" data-add="${p.id}">
          <span class="pdv-item-nome">${esc(p.nome)}</span>
          <span class="pdv-item-info">${esc(p.ean) || 'sem código'} · ${brl(p.preco_venda)} · ${Number(p.estoque_atual)} em estoque</span>
        </button>`).join('')}</div>`;
      box.querySelectorAll('[data-add]').forEach(b =>
        b.addEventListener('click', () => adicionar(itens.find(p => p.id === b.dataset.add))));
    }

    // ---- carrinho -----------------------------------------------------------

    function adicionar(p) {
      const existe = carrinho.find(i => i.produto_id === p.id);
      const estoque = Number(p.estoque_atual);
      if (existe) {
        if (existe.quantidade + 1 > estoque) return avisar(`Só há ${estoque} de "${p.nome}" em estoque.`);
        existe.quantidade += 1;
      } else {
        if (estoque <= 0) return avisar(`"${p.nome}" está sem estoque.`);
        carrinho.push({ produto_id: p.id, nome: p.nome, ean: p.ean,
                        preco: Number(p.preco_venda), quantidade: 1, estoque });
      }
      renderCarrinho();
    }

    function mudarQtd(id, delta) {
      const item = carrinho.find(i => i.produto_id === id);
      if (!item) return;
      const nova = item.quantidade + delta;
      if (nova <= 0) { remover(id); return; }
      if (nova > item.estoque) return avisar(`Só há ${item.estoque} de "${item.nome}" em estoque.`);
      item.quantidade = nova;
      renderCarrinho();
    }

    function remover(id) {
      const i = carrinho.findIndex(x => x.produto_id === id);
      if (i >= 0) carrinho.splice(i, 1);
      renderCarrinho();
    }

    function total() { return carrinho.reduce((s, i) => s + i.preco * i.quantidade, 0); }

    function renderCarrinho() {
      const box = $('.pdv-carrinho');
      if (!carrinho.length) {
        box.innerHTML = '<p class="muted">Nenhum item. Busque um produto para começar a venda.</p>';
      } else {
        box.innerHTML = `<table class="tabela"><tbody>${carrinho.map(i => `
          <tr>
            <td>${esc(i.nome)}<br><span class="muted">${brl(i.preco)} un.</span></td>
            <td class="pdv-qtd">
              <button class="btn-mini" data-menos="${i.produto_id}">−</button>
              <span>${i.quantidade}</span>
              <button class="btn-mini" data-mais="${i.produto_id}">+</button>
            </td>
            <td class="pdv-sub">${brl(i.preco * i.quantidade)}</td>
            <td><button class="btn-mini btn-perigo" data-rem="${i.produto_id}">✕</button></td>
          </tr>`).join('')}</tbody></table>`;
        box.querySelectorAll('[data-menos]').forEach(b => b.addEventListener('click', () => mudarQtd(b.dataset.menos, -1)));
        box.querySelectorAll('[data-mais]').forEach(b => b.addEventListener('click', () => mudarQtd(b.dataset.mais, +1)));
        box.querySelectorAll('[data-rem]').forEach(b => b.addEventListener('click', () => remover(b.dataset.rem)));
      }
      $('.pdv-total-valor').textContent = brl(total());
      $('.pdv-finalizar').disabled = carrinho.length === 0;
      atualizarTroco();
      $('.pdv-sucesso').hidden = true;
    }

    // ---- pagamento ----------------------------------------------------------

    function atualizarTroco() {
      const ehDinheiro = estado.forma === 'dinheiro';
      $('.pdv-dinheiro').style.display = ehDinheiro ? '' : 'none';
      if (!ehDinheiro) { $('.pdv-troco').textContent = ''; return; }
      const recebido = Number(numBR($('.pdv-recebido').value));
      if (!recebido) { $('.pdv-troco').textContent = ''; return; }
      const troco = recebido - total();
      $('.pdv-troco').textContent = troco >= 0
        ? `Troco: ${brl(troco)}`
        : `Faltam ${brl(-troco)}`;
      $('.pdv-troco').classList.toggle('field-error', troco < 0);
    }

    panel.querySelectorAll('.pdv-forma').forEach(b =>
      b.addEventListener('click', () => {
        estado.forma = b.dataset.forma;
        panel.querySelectorAll('.pdv-forma').forEach(x => x.classList.toggle('ativa', x === b));
        atualizarTroco();
      }));
    $('.pdv-recebido').addEventListener('input', atualizarTroco);

    // ---- finalizar ----------------------------------------------------------

    function avisar(msg) {
      const el = $('.pdv-erro');
      el.textContent = msg; el.hidden = false;
      setTimeout(() => { el.hidden = true; }, 4000);
    }

    async function finalizar() {
      $('.pdv-erro').hidden = true;
      if (!carrinho.length) return;
      const btn = $('.pdv-finalizar');
      btn.disabled = true; btn.textContent = 'Finalizando…';
      const recebido = estado.forma === 'dinheiro' ? $('.pdv-recebido').value : null;
      const itens = carrinho.map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade }));
      const r = await Api.call('pdv_finalizar', itens, estado.forma, recebido);
      btn.textContent = 'Finalizar venda';

      if (!r.ok) { avisar(r.error); btn.disabled = false; return; }

      const { total: tot, troco, venda_id } = r.data;
      carrinho.length = 0;
      $('.pdv-recebido').value = '';
      renderCarrinho();
      const sucesso = $('.pdv-sucesso');
      sucesso.hidden = false;
      sucesso.innerHTML = `
        <div>✅ Venda concluída — <strong>${brl(tot)}</strong>${troco > 0 ? ` · troco <strong>${brl(troco)}</strong>` : ''}</div>
        <div class="pdv-nfce">
          <button class="btn-mini" data-emitir="${venda_id}">Emitir NFC-e</button>
          <span class="pdv-nfce-status muted"></span>
        </div>`;
      sucesso.querySelector('[data-emitir]').addEventListener('click', (e) => emitirNfce(e.target.dataset.emitir));
      $('.busca-pdv').focus();
    }

    async function emitirNfce(vendaId) {
      const sucesso = $('.pdv-sucesso');
      const btn = sucesso.querySelector('[data-emitir]');
      const st = sucesso.querySelector('.pdv-nfce-status');
      btn.disabled = true;
      st.textContent = 'Emitindo…';
      const r = await Api.call('fiscal_emitir', vendaId);
      if (!r.ok) {
        btn.disabled = false;
        st.innerHTML = `<span class="field-error">${esc(r.error)}</span> ` +
          '<button class="btn-mini" data-cfg="1">Configurar</button>';
        const cfg = st.querySelector('[data-cfg]');
        if (cfg) cfg.addEventListener('click', () => Fiscal.abrirConfig());
        return;
      }
      const status = r.data.status;
      if (status === 'autorizada') { st.innerHTML = '<span class="badge-ok">NFC-e autorizada</span>'; btn.remove(); }
      else if (status === 'rejeitada') { btn.disabled = false; st.innerHTML = `<span class="field-error">Rejeitada: ${esc(r.data.motivo || '')}</span>`; }
      else {
        // processando: acompanha o status por alguns segundos (webhook da Focus)
        st.textContent = 'Enviada — aguardando autorização…';
        acompanhar(vendaId, st, btn);
      }
    }

    async function acompanhar(vendaId, st, btn, tentativa = 0) {
      if (tentativa >= 5) { st.textContent = 'Enviada. Consulte o status em instantes.'; return; }
      await new Promise((res) => setTimeout(res, 3000));
      const r = await Api.call('fiscal_nota', vendaId);
      const nota = r.ok ? r.data : null;
      if (nota && nota.status === 'autorizada') { st.innerHTML = '<span class="badge-ok">NFC-e autorizada</span>'; if (btn) btn.remove(); return; }
      if (nota && nota.status === 'rejeitada') { if (btn) btn.disabled = false; st.innerHTML = `<span class="field-error">Rejeitada: ${esc(nota.motivo || '')}</span>`; return; }
      acompanhar(vendaId, st, btn, tentativa + 1);
    }

    $('.pdv-finalizar').addEventListener('click', finalizar);

    // ---- eventos de busca ---------------------------------------------------

    const busca = $('.busca-pdv');
    let timer;
    busca.addEventListener('input', (e) => {
      clearTimeout(timer);
      const termo = e.target.value.trim();
      timer = setTimeout(() => buscar(termo), 300);
    });
    busca.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { clearTimeout(timer); buscar(busca.value.trim()); }
    });

    renderCarrinho();
    buscar('');
    busca.focus();
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { render };
})();
