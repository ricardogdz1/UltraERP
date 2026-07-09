/* Módulo Estoque (Fase 1 — completo): KPIs, listagem paginada com busca e
   filtro de estoque baixo, cadastro com erro por campo, ajuste com motivo
   (em modal) e histórico de movimentações por produto.
   O estado vive no painel da aba — preservado ao trocar de aba. */

const ModuloEstoque = (() => {

  const brl = (v) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // ---- máscaras de entrada: o campo só aceita o que é permitido ------------

  function soDigitos(input, max) {
    if (!input) return;
    input.maxLength = max;
    input.setAttribute('inputmode', 'numeric');
    input.addEventListener('input', () => {
      const limpo = input.value.replace(/\D/g, '').slice(0, max);
      if (input.value !== limpo) input.value = limpo;
    });
  }

  function soDecimal(input, max) {
    if (!input) return;
    input.maxLength = max;
    input.setAttribute('inputmode', 'decimal');
    input.addEventListener('input', () => {
      // mantém dígitos e no máximo UM separador decimal (vírgula ou ponto)
      const m = input.value.replace(/[^\d.,]/g, '').match(/^(\d*)([.,]?)(\d*)/);
      const v = (m ? m[1] + m[2] + m[3] : '').slice(0, max);
      if (input.value !== v) input.value = v;
    });
  }

  function maiusculas(input, max) {
    if (!input) return;
    input.maxLength = max;
    input.addEventListener('input', () => {
      const v = input.value.toUpperCase().slice(0, max);
      if (input.value !== v) input.value = v;
    });
  }

  function limite(input, max) {
    if (input) input.maxLength = max;
  }

  function render(panel) {
    panel.innerHTML = `
      <div class="mod-header">
        <h2>Estoque</h2>
        <button class="btn-primary btn-inline" data-acao="novo">+ Novo produto</button>
      </div>

      <div class="kpis"></div>

      <div class="toolbar toolbar-flex">
        <input class="busca" placeholder="Buscar por nome ou código de barras…">
        <label class="checkbox filtro-baixo">
          <input type="checkbox" data-filtro="baixo"> Somente abaixo do mínimo
        </label>
      </div>

      <div class="form-produto" hidden></div>
      <div class="lista"></div>
      <div class="paginacao"></div>

      <div class="modal-overlay" hidden>
        <div class="modal">
          <div class="modal-head">
            <h3 class="modal-titulo"></h3>
            <button class="modal-close" title="Fechar">✕</button>
          </div>
          <div class="modal-body"></div>
        </div>
      </div>
    `;

    const estado = { pagina: 1, busca: '', so_baixo: false };
    const $ = (sel) => panel.querySelector(sel);

    // ---- KPIs ---------------------------------------------------------------

    async function carregarKpis() {
      const r = await Api.call('estoque_resumo');
      if (!r.ok) { $('.kpis').innerHTML = ''; return; }
      const k = r.data;
      $('.kpis').innerHTML = `
        <div class="kpi"><span class="kpi-num">${k.total}</span><span class="kpi-lbl">Produtos ativos</span></div>
        <div class="kpi ${k.abaixo_minimo ? 'kpi-alerta' : ''}">
          <span class="kpi-num">${k.abaixo_minimo}</span><span class="kpi-lbl">Abaixo do mínimo</span></div>
        <div class="kpi"><span class="kpi-num">${brl(k.valor_custo)}</span><span class="kpi-lbl">Valor em estoque (custo)</span></div>
        <div class="kpi"><span class="kpi-num">${brl(k.valor_venda)}</span><span class="kpi-lbl">Valor em estoque (venda)</span></div>`;
    }

    // ---- listagem -----------------------------------------------------------

    async function carregar() {
      const lista = $('.lista');
      lista.innerHTML = '<p class="muted">Carregando…</p>';
      const r = await Api.call('estoque_listar', estado.pagina, estado.busca, estado.so_baixo);
      if (!r.ok) { lista.innerHTML = `<p class="field-error">${esc(r.error)}</p>`; return; }

      const { itens, total } = r.data;
      if (!itens.length) {
        lista.innerHTML = estado.so_baixo
          ? '<p class="muted">Nenhum produto abaixo do estoque mínimo. 👍</p>'
          : (estado.busca
              ? '<p class="muted">Nenhum produto encontrado para essa busca.</p>'
              : '<p class="muted">Nenhum produto ainda. Clique em “+ Novo produto” para começar.</p>');
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
        btn.addEventListener('click', () => abrirForm(itens.find(p => p.id === btn.dataset.editar))));
      lista.querySelectorAll('[data-ajustar]').forEach(btn =>
        btn.addEventListener('click', () => abrirAjuste(itens.find(p => p.id === btn.dataset.ajustar))));
      lista.querySelectorAll('[data-historico]').forEach(btn =>
        btn.addEventListener('click', () => abrirHistorico(itens.find(p => p.id === btn.dataset.historico))));
      lista.querySelectorAll('[data-excluir]').forEach(btn =>
        btn.addEventListener('click', () => excluir(itens.find(p => p.id === btn.dataset.excluir))));

      paginacao(total);
    }

    function linha(p) {
      const baixo = p.abaixo_minimo ?? (Number(p.estoque_atual) <= Number(p.estoque_minimo));
      return `<tr>
        <td>${esc(p.nome)}</td>
        <td>${esc(p.ean) || '—'}</td>
        <td>${brl(p.preco_venda)}</td>
        <td>${Number(p.estoque_atual)} ${esc(p.unidade)}
            ${baixo ? '<span class="badge-alerta" title="Abaixo do estoque mínimo">baixo</span>' : ''}</td>
        <td class="acoes">
          <button class="btn-mini" data-editar="${p.id}">Editar</button>
          <button class="btn-mini" data-ajustar="${p.id}">Ajustar</button>
          <button class="btn-mini" data-historico="${p.id}">Histórico</button>
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
        btn.addEventListener('click', () => { estado.pagina += Number(btn.dataset.pag); carregar(); }));
    }

    // Recarrega lista + KPIs após qualquer alteração
    function reload() { carregar(); carregarKpis(); }

    // ---- formulário de produto ---------------------------------------------

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

      // máscaras: cada campo só aceita o permitido, com limite de tamanho
      limite(form.querySelector('input[name=nome]'), 120);
      soDigitos(form.querySelector('input[name=ean]'), 14);   // EAN/GTIN: até 14 dígitos
      soDigitos(form.querySelector('input[name=ncm]'), 8);    // NCM: 8 dígitos
      maiusculas(form.querySelector('input[name=unidade]'), 6);
      soDecimal(form.querySelector('input[name=preco_custo]'), 12);
      soDecimal(form.querySelector('input[name=preco_venda]'), 12);
      soDecimal(form.querySelector('input[name=estoque_minimo]'), 10);

      form.querySelector('[data-acao=cancelar]').addEventListener('click', () => { form.hidden = true; });
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
        if (r.ok) { form.hidden = true; reload(); return; }

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

    // ---- modal (ajuste e histórico) ----------------------------------------

    function abrirModal(titulo, corpoHtml) {
      $('.modal-titulo').textContent = titulo;
      $('.modal-body').innerHTML = corpoHtml;
      $('.modal-overlay').hidden = false;
    }
    function fecharModal() { $('.modal-overlay').hidden = true; }
    $('.modal-close').addEventListener('click', fecharModal);
    $('.modal-overlay').addEventListener('click', (e) => {
      if (e.target === $('.modal-overlay')) fecharModal();
    });

    function abrirAjuste(p) {
      abrirModal(`Ajustar estoque — ${esc(p.nome)}`, `
        <p class="muted">Estoque atual: <strong>${Number(p.estoque_atual)} ${esc(p.unidade)}</strong></p>
        <div class="ajuste-tipo">
          <label class="radio"><input type="radio" name="tipo" value="entrada" checked> Entrada (+)</label>
          <label class="radio"><input type="radio" name="tipo" value="saida"> Saída (−)</label>
        </div>
        <label>Quantidade</label>
        <input name="qtd" inputmode="decimal" placeholder="Ex.: 10">
        <label>Motivo</label>
        <input name="motivo" list="motivos" placeholder="Ex.: inventário, avaria, brinde, compra">
        <datalist id="motivos">
          <option value="Compra / entrada de mercadoria">
          <option value="Inventário / contagem">
          <option value="Avaria / perda">
          <option value="Brinde / bonificação">
          <option value="Devolução de cliente">
        </datalist>
        <p class="field-error" data-erro="ajuste" hidden></p>
        <div class="form-acoes">
          <button class="btn-primary btn-inline" data-acao="confirmar">Confirmar ajuste</button>
          <button class="btn-mini" data-acao="cancelar">Cancelar</button>
        </div>
      `);
      const body = $('.modal-body');
      soDecimal(body.querySelector('input[name=qtd]'), 10);
      limite(body.querySelector('input[name=motivo]'), 80);
      body.querySelector('[data-acao=cancelar]').addEventListener('click', fecharModal);
      body.querySelector('input[name=qtd]').focus();
      body.querySelector('[data-acao=confirmar]').addEventListener('click', async () => {
        const erro = body.querySelector('[data-erro=ajuste]');
        erro.hidden = true;
        const bruto = body.querySelector('input[name=qtd]').value.trim().replace(',', '.');
        const num = Number(bruto);
        if (!bruto || Number.isNaN(num) || num <= 0) {
          erro.textContent = 'Digite uma quantidade maior que zero.';
          erro.hidden = false; return;
        }
        const tipo = body.querySelector('input[name=tipo]:checked').value;
        const qtd = tipo === 'saida' ? -num : num;
        const motivo = body.querySelector('input[name=motivo]').value.trim();
        const r = await Api.call('estoque_ajustar', p.id, qtd, motivo);
        if (!r.ok) { erro.textContent = r.error; erro.hidden = false; return; }
        fecharModal(); reload();
      });
    }

    async function abrirHistorico(p) {
      abrirModal(`Histórico — ${esc(p.nome)}`, '<p class="muted">Carregando…</p>');
      const r = await Api.call('estoque_movimentos', p.id, 1);
      const body = $('.modal-body');
      if (!r.ok) { body.innerHTML = `<p class="field-error">${esc(r.error)}</p>`; return; }
      const { itens, total } = r.data;
      if (!itens.length) { body.innerHTML = '<p class="muted">Sem movimentações registradas ainda.</p>'; return; }
      body.innerHTML = `
        <table class="tabela">
          <thead><tr><th>Data</th><th>Tipo</th><th>Qtd</th><th>Motivo</th><th>Usuário</th></tr></thead>
          <tbody>${itens.map(m => `
            <tr>
              <td>${dataHora(m.criado_em)}</td>
              <td>${rotuloTipo(m.tipo)}</td>
              <td class="${Number(m.quantidade) < 0 ? 'btn-perigo' : ''}">${Number(m.quantidade) > 0 ? '+' : ''}${Number(m.quantidade)}</td>
              <td>${esc(m.motivo) || '—'}</td>
              <td>${esc(m.usuarios?.nome) || '—'}</td>
            </tr>`).join('')}</tbody>
        </table>
        <p class="muted" style="margin-top:8px">${total} movimento(s).</p>`;
    }

    function rotuloTipo(t) {
      return { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste' }[t] || esc(t);
    }
    function dataHora(iso) {
      try { return new Date(iso).toLocaleString('pt-BR'); }
      catch { return esc(iso); }
    }

    async function excluir(p) {
      if (!confirm(`Excluir "${p.nome}"?\nO produto sai da lista, mas o histórico de movimentações fica guardado.`)) return;
      const r = await Api.call('estoque_desativar', p.id);
      if (!r.ok) { alert(r.error); return; }
      reload();
    }

    // ---- eventos ------------------------------------------------------------

    $('[data-acao=novo]').addEventListener('click', () => abrirForm());

    $('[data-filtro=baixo]').addEventListener('change', (e) => {
      estado.so_baixo = e.target.checked;
      estado.pagina = 1;
      carregar();
    });

    let timer;
    $('.busca').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        estado.busca = e.target.value.trim();
        estado.pagina = 1;
        carregar();
      }, 300);
    });

    carregarKpis();
    carregar();
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { render };
})();
