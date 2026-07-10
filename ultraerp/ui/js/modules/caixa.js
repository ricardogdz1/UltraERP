/* Módulo Fluxo de Caixa — Fase 1.
   Contas a pagar e a receber: KPIs, filtros, cadastro manual, baixa
   (marcar pago) e exclusão. Recebimentos do PDV entram automaticamente
   (não editáveis/excluíveis, para não descasar do histórico de vendas). */

const ModuloCaixa = (() => {

  const brl = (v) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function dataBR(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
  }

  function render(panel) {
    const estado = { tipo: '', situacao: '', pagina: 1 };
    const $ = (sel) => panel.querySelector(sel);

    panel.innerHTML = `
      <div class="mod-header">
        <h2>Fluxo de Caixa</h2>
        <button class="btn-primary btn-inline" data-acao="novo">+ Novo lançamento</button>
      </div>
      <div class="kpis"></div>
      <div class="toolbar toolbar-flex">
        <select class="filtro-tipo">
          <option value="">Todos os tipos</option>
          <option value="receber">A receber</option>
          <option value="pagar">A pagar</option>
        </select>
        <select class="filtro-situacao">
          <option value="">Pagos e pendentes</option>
          <option value="pendente">Só pendentes</option>
          <option value="pago">Só pagos</option>
        </select>
      </div>
      <div class="form-produto" hidden></div>
      <div class="lista"></div>
      <div class="paginacao"></div>
    `;

    async function carregarKpis() {
      const r = await Api.call('financeiro_resumo');
      if (!r.ok) { $('.kpis').innerHTML = ''; return; }
      const k = r.data;
      $('.kpis').innerHTML = `
        <div class="kpi"><span class="kpi-num" style="color:var(--success)">${brl(k.a_receber)}</span><span class="kpi-lbl">A receber (pendente)</span></div>
        <div class="kpi"><span class="kpi-num" style="color:var(--danger)">${brl(k.a_pagar)}</span><span class="kpi-lbl">A pagar (pendente)</span></div>
        <div class="kpi"><span class="kpi-num">${brl(k.recebido_mes)}</span><span class="kpi-lbl">Recebido no mês</span></div>
        <div class="kpi"><span class="kpi-num">${brl(k.pago_mes)}</span><span class="kpi-lbl">Pago no mês</span></div>
        <div class="kpi ${k.vencidos ? 'kpi-alerta' : ''}"><span class="kpi-num">${k.vencidos}</span><span class="kpi-lbl">Contas vencidas</span></div>`;
    }

    async function carregar() {
      const lista = $('.lista');
      lista.innerHTML = '<p class="muted">Carregando…</p>';
      const r = await Api.call('financeiro_listar', estado.tipo, estado.situacao, estado.pagina);
      if (!r.ok) { lista.innerHTML = `<p class="field-error">${esc(r.error)}</p>`; return; }
      const { itens, total } = r.data;
      if (!itens.length) {
        lista.innerHTML = '<p class="muted">Nenhum lançamento. Clique em “+ Novo lançamento” ou registre vendas no PDV.</p>';
        $('.paginacao').innerHTML = '';
        return;
      }
      lista.innerHTML = `
        <table class="tabela">
          <thead><tr>
            <th>Descrição</th><th>Categoria</th><th>Vencimento</th>
            <th>Valor</th><th>Situação</th><th></th>
          </tr></thead>
          <tbody>${itens.map(linha).join('')}</tbody>
        </table>`;

      lista.querySelectorAll('[data-baixar]').forEach(b =>
        b.addEventListener('click', () => baixar(b.dataset.baixar, b.dataset.pago === '1')));
      lista.querySelectorAll('[data-editar]').forEach(b =>
        b.addEventListener('click', () => abrirForm(itens.find(l => l.id === b.dataset.editar))));
      lista.querySelectorAll('[data-excluir]').forEach(b =>
        b.addEventListener('click', () => excluir(itens.find(l => l.id === b.dataset.excluir))));
      paginacao(total);
    }

    function linha(l) {
      const doPdv = !!l.venda_id;
      const vencido = !l.pago && l.vencimento < hojeISO();
      const cor = l.tipo === 'receber' ? 'var(--success)' : 'var(--danger)';
      const sinal = l.tipo === 'receber' ? '+' : '−';
      return `<tr>
        <td>${esc(l.descricao)} ${doPdv ? '<span class="badge-alerta" title="Gerado automaticamente pelo PDV">PDV</span>' : ''}</td>
        <td>${esc(l.categoria) || '—'}</td>
        <td class="${vencido ? 'field-error' : ''}">${dataBR(l.vencimento)}</td>
        <td style="color:${cor};white-space:nowrap">${sinal} ${brl(l.valor)}</td>
        <td>${l.pago
              ? '<span class="badge-ok">Pago</span>'
              : (vencido ? '<span class="badge-alerta">Vencido</span>' : '<span class="muted">Pendente</span>')}</td>
        <td class="acoes">
          <button class="btn-mini" data-baixar="${l.id}" data-pago="${l.pago ? '0' : '1'}">
            ${l.pago ? 'Reabrir' : 'Dar baixa'}</button>
          ${doPdv ? '' : `<button class="btn-mini" data-editar="${l.id}">Editar</button>
          <button class="btn-mini btn-perigo" data-excluir="${l.id}">Excluir</button>`}
        </td>
      </tr>`;
    }

    function paginacao(total) {
      const paginas = Math.max(1, Math.ceil(total / 25));
      $('.paginacao').innerHTML = `
        <button class="btn-mini" data-pag="-1" ${estado.pagina <= 1 ? 'disabled' : ''}>‹ Anterior</button>
        <span class="muted">Página ${estado.pagina} de ${paginas} — ${total} lançamento(s)</span>
        <button class="btn-mini" data-pag="1" ${estado.pagina >= paginas ? 'disabled' : ''}>Próxima ›</button>`;
      $('.paginacao').querySelectorAll('[data-pag]').forEach(b =>
        b.addEventListener('click', () => { estado.pagina += Number(b.dataset.pag); carregar(); }));
    }

    function reload() { carregar(); carregarKpis(); }

    // ---- formulário ---------------------------------------------------------

    function abrirForm(l = null) {
      const form = $('.form-produto');
      form.hidden = false;
      form.innerHTML = `
        <h3>${l ? 'Editar lançamento' : 'Novo lançamento'}</h3>
        <div class="grid-2">
          <div><label>Tipo *</label>
            <select name="tipo">
              <option value="receber" ${l?.tipo === 'receber' ? 'selected' : ''}>A receber</option>
              <option value="pagar" ${l?.tipo === 'pagar' ? 'selected' : ''}>A pagar</option>
            </select>
            <p class="field-error" data-erro="tipo" hidden></p></div>
          <div><label>Descrição *</label>
            <input name="descricao" value="${esc(l?.descricao ?? '')}" placeholder="Ex.: Aluguel, Fornecedor X, Cliente Y">
            <p class="field-error" data-erro="descricao" hidden></p></div>
          <div><label>Categoria</label>
            <input name="categoria" value="${esc(l?.categoria ?? '')}" placeholder="Ex.: Fixo, Mercadoria (opcional)"></div>
          <div><label>Valor (R$) *</label>
            <input name="valor" value="${l?.valor ?? ''}" placeholder="0,00">
            <p class="field-error" data-erro="valor" hidden></p></div>
          <div><label>Vencimento *</label>
            <input name="vencimento" type="date" value="${l?.vencimento ?? hojeISO()}">
            <p class="field-error" data-erro="vencimento" hidden></p></div>
        </div>
        <p class="field-error" data-erro="_geral" hidden></p>
        <div class="form-acoes">
          <button class="btn-primary btn-inline" data-acao="salvar">Salvar</button>
          <button class="btn-mini" data-acao="cancelar">Cancelar</button>
        </div>`;

      // valor só numérico com um separador decimal
      const inpValor = form.querySelector('input[name=valor]');
      inpValor.maxLength = 12;
      inpValor.setAttribute('inputmode', 'decimal');
      inpValor.addEventListener('input', () => {
        // aceita dígitos e separadores; conversão (formato BR) é no servidor
        const v = inpValor.value.replace(/[^\d.,]/g, '').slice(0, 12);
        if (inpValor.value !== v) inpValor.value = v;
      });
      form.querySelector('input[name=descricao]').maxLength = 120;
      form.querySelector('input[name=categoria]').maxLength = 40;

      form.querySelector('[data-acao=cancelar]').addEventListener('click', () => { form.hidden = true; });
      form.querySelector('[data-acao=salvar]').addEventListener('click', async () => {
        const dados = {};
        form.querySelectorAll('[name]').forEach(i => {
          dados[i.name] = i.value;  // valor é normalizado no servidor (formato BR)
          i.classList.remove('invalid');
        });
        form.querySelectorAll('[data-erro]').forEach(e => e.hidden = true);
        if (l) dados.id = l.id;

        const r = await Api.call('financeiro_salvar', dados);
        if (r.ok) { form.hidden = true; reload(); return; }
        for (const [campo, msg] of Object.entries(r.field_errors || { _geral: r.error })) {
          const el = form.querySelector(`[data-erro="${campo}"]`);
          if (el) { el.textContent = msg; el.hidden = false; }
          const input = form.querySelector(`[name="${campo}"]`);
          if (input) input.classList.add('invalid');
        }
      });
      form.querySelector('input[name=descricao]').focus();
    }

    // ---- ações --------------------------------------------------------------

    async function baixar(id, pago) {
      const r = await Api.call('financeiro_baixar', id, pago);
      if (!r.ok) { alert(r.error); return; }
      reload();
    }

    async function excluir(l) {
      if (!confirm(`Excluir o lançamento "${l.descricao}"?`)) return;
      const r = await Api.call('financeiro_excluir', l.id);
      if (!r.ok) { alert(r.error); return; }
      reload();
    }

    // ---- eventos ------------------------------------------------------------

    $('[data-acao=novo]').addEventListener('click', () => abrirForm());
    $('.filtro-tipo').addEventListener('change', (e) => { estado.tipo = e.target.value; estado.pagina = 1; carregar(); });
    $('.filtro-situacao').addEventListener('change', (e) => { estado.situacao = e.target.value; estado.pagina = 1; carregar(); });

    carregarKpis();
    carregar();
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { render };
})();
