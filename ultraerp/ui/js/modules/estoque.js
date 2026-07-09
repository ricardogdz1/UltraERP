/* Módulo Estoque (Fase 1): listagem paginada com busca, cadastro com
   erro por campo, alerta de estoque mínimo e ajuste com motivo.
   O estado vive no painel da aba — preservado ao trocar de aba. */

const ModuloEstoque = (() => {

  function render(panel) {
    panel.innerHTML = `
      <div class="mod-header">
        <h2>Estoque</h2>
        <button class="btn-primary btn-inline" data-acao="novo">+ Novo produto</button>
      </div>
      <div class="toolbar">
        <input class="busca" placeholder="Buscar por nome ou código de barras…">
      </div>
      <div class="form-produto" hidden></div>
      <div class="lista"></div>
      <div class="paginacao"></div>
    `;

    const estado = { pagina: 1, busca: '' };
    const $ = (sel) => panel.querySelector(sel);

    // ---- listagem ----------------------------------------------------------

    async function carregar() {
      const lista = $('.lista');
      lista.innerHTML = '<p class="muted">Carregando…</p>';
      const r = await Api.call('estoque_listar', estado.pagina, estado.busca);
      if (!r.ok) { lista.innerHTML = `<p class="field-error">${r.error}</p>`; return; }

      const { itens, total } = r.data;
      if (!itens.length) {
        lista.innerHTML = '<p class="muted">Nenhum produto encontrado. Clique em “+ Novo produto” para começar.</p>';
        $('.paginacao').innerHTML = '';
        return;
      }

      lista.innerHTML = `
        <table class="tabela">
          <thead><tr>
            <th>Produto</th><th>Cód. barras</th><th>Preço venda</th>
            <th>Estoque</th><th></th>
          </tr></thead>
          <tbody>${itens.map(linha).join('')}</tbody>
        </table>`;

      lista.querySelectorAll('[data-editar]').forEach(btn =>
        btn.addEventListener('click', () =>
          abrirForm(itens.find(p => p.id === btn.dataset.editar))));
      lista.querySelectorAll('[data-ajustar]').forEach(btn =>
        btn.addEventListener('click', () =>
          ajustar(itens.find(p => p.id === btn.dataset.ajustar))));
      lista.querySelectorAll('[data-excluir]').forEach(btn =>
        btn.addEventListener('click', () =>
          excluir(itens.find(p => p.id === btn.dataset.excluir))));

      paginacao(total);
    }

    function linha(p) {
      const baixo = Number(p.estoque_atual) <= Number(p.estoque_minimo);
      return `<tr>
        <td>${esc(p.nome)}</td>
        <td>${esc(p.ean) || '—'}</td>
        <td>R$ ${Number(p.preco_venda).toFixed(2).replace('.', ',')}</td>
        <td>${Number(p.estoque_atual)} ${esc(p.unidade)}
            ${baixo ? '<span class="badge-alerta" title="Abaixo do estoque mínimo">baixo</span>' : ''}</td>
        <td class="acoes">
          <button class="btn-mini" data-editar="${p.id}">Editar</button>
          <button class="btn-mini" data-ajustar="${p.id}">Ajustar</button>
          <button class="btn-mini btn-perigo" data-excluir="${p.id}">Excluir</button>
        </td>
      </tr>`;
    }

    function paginacao(total) {
      const paginas = Math.max(1, Math.ceil(total / 25));
      $('.paginacao').innerHTML = `
        <button class="btn-mini" data-pag="-1" ${estado.pagina <= 1 ? 'disabled' : ''}>‹ Anterior</button>
        <span class="muted">Página ${estado.pagina} de ${paginas} — ${total} produto(s)</span>
        <button class="btn-mini" data-pag="1" ${estado.pagina >= paginas ? 'disabled' : ''}>Próxima ›</button>`;
      $('.paginacao').querySelectorAll('[data-pag]').forEach(btn =>
        btn.addEventListener('click', () => {
          estado.pagina += Number(btn.dataset.pag);
          carregar();
        }));
    }

    // ---- formulário ---------------------------------------------------------

    function abrirForm(p = null) {
      const form = $('.form-produto');
      form.hidden = false;
      form.innerHTML = `
        <h3>${p ? 'Editar produto' : 'Novo produto'}</h3>
        <div class="grid-2">
          <div><label>Nome do produto *</label>
            <input name="nome" value="${esc(p?.nome ?? '')}" placeholder="Ex.: Camiseta Básica Branca M">
            <p class="field-error" data-erro="nome" hidden></p></div>
          <div><label>Código de barras (EAN) <span class="hint" title="Número embaixo das barras na etiqueta. Pode deixar vazio se o produto não tiver.">?</span></label>
            <input name="ean" value="${esc(p?.ean ?? '')}" placeholder="Ex.: 7891234567895">
            <p class="field-error" data-erro="ean" hidden></p></div>
          <div><label>NCM <span class="hint" title="Código fiscal do tipo de produto (8 números). Seu contador sabe informar. Obrigatório para emitir nota.">?</span></label>
            <input name="ncm" value="${esc(p?.ncm ?? '')}" placeholder="Ex.: 61091000">
            <p class="field-error" data-erro="ncm" hidden></p></div>
          <div><label>Unidade</label>
            <input name="unidade" value="${esc(p?.unidade ?? 'UN')}" placeholder="UN, KG, CX…"></div>
          <div><label>Preço de custo (R$)</label>
            <input name="preco_custo" value="${p?.preco_custo ?? ''}" placeholder="0,00">
            <p class="field-error" data-erro="preco_custo" hidden></p></div>
          <div><label>Preço de venda (R$) *</label>
            <input name="preco_venda" value="${p?.preco_venda ?? ''}" placeholder="0,00">
            <p class="field-error" data-erro="preco_venda" hidden></p></div>
          <div><label>Estoque mínimo (avisa quando chegar neste nível)</label>
            <input name="estoque_minimo" value="${p?.estoque_minimo ?? 0}">
            <p class="field-error" data-erro="estoque_minimo" hidden></p></div>
        </div>
        <p class="field-error" data-erro="_geral" hidden></p>
        <div class="form-acoes">
          <button class="btn-primary btn-inline" data-acao="salvar">Salvar</button>
          <button class="btn-mini" data-acao="cancelar">Cancelar</button>
        </div>`;

      form.querySelector('[data-acao=cancelar]').addEventListener('click', () => {
        form.hidden = true;
      });
      form.querySelector('[data-acao=salvar]').addEventListener('click', async () => {
        const dados = {};
        form.querySelectorAll('input[name]').forEach(i => {
          dados[i.name] = i.name.startsWith('preco') || i.name === 'estoque_minimo'
            ? i.value.replace(',', '.') : i.value;
          i.classList.remove('invalid');
        });
        form.querySelectorAll('[data-erro]').forEach(e => e.hidden = true);
        if (p) dados.id = p.id;

        const r = await Api.call('estoque_salvar', dados);
        if (r.ok) { form.hidden = true; carregar(); return; }

        // erros por campo, preservando o que o usuário digitou (seção 9)
        for (const [campo, msg] of Object.entries(r.field_errors || { _geral: r.error })) {
          const el = form.querySelector(`[data-erro="${campo}"]`);
          if (el) { el.textContent = msg; el.hidden = false; }
          const input = form.querySelector(`input[name="${campo}"]`);
          if (input) input.classList.add('invalid');
        }
      });
      form.querySelector('input[name=nome]').focus();
    }

    // ---- ações --------------------------------------------------------------

    async function ajustar(p) {
      const qtd = prompt(
        `Ajustar estoque de "${p.nome}" (atual: ${p.estoque_atual} ${p.unidade}).\n` +
        'Digite a quantidade: positiva para entrada (ex.: 10), negativa para saída (ex.: -3).');
      if (qtd === null || qtd.trim() === '') return;
      const motivo = prompt('Motivo do ajuste (ex.: inventário, avaria, brinde):') || '';
      const r = await Api.call('estoque_ajustar', p.id, qtd.trim(), motivo);
      if (!r.ok) { alert(r.error); return; }
      carregar();
    }

    async function excluir(p) {
      if (!confirm(`Excluir "${p.nome}"?\nO produto sai da lista, mas o histórico de movimentações fica guardado.`)) return;
      const r = await Api.call('estoque_desativar', p.id);
      if (!r.ok) { alert(r.error); return; }
      carregar();
    }

    // ---- eventos ------------------------------------------------------------

    $('[data-acao=novo]').addEventListener('click', () => abrirForm());

    let timer;
    $('.busca').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        estado.busca = e.target.value.trim();
        estado.pagina = 1;
        carregar();
      }, 300);
    });

    carregar();
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { render };
})();
