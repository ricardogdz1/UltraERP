/* Módulo Dashboard — tela de boas-vindas com os KPIs do dia.
   Uma única chamada (dashboard_resumo) agrega vendas, financeiro e estoque.
   Botões de ação rápida abrem as outras abas. Sem dependências externas:
   o mini-gráfico de 7 dias é feito com CSS. */

const ModuloDashboard = (() => {

  const brl = (v) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function diaSemana(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  }
  function diaMes(iso) {
    const m = /-(\d{2})-(\d{2})$/.exec(iso);
    return m ? `${m[2]}/${m[1]}` : iso;
  }

  function render(panel) {
    panel.innerHTML = `
      <div class="mod-header">
        <h2>Bem-vindo 👋</h2>
        <button class="btn-mini" data-acao="atualizar">Atualizar</button>
      </div>
      <div class="dash-acoes">
        <button class="btn-primary btn-inline" data-abrir="pdv">🛒 Nova venda</button>
        <button class="btn-mini" data-abrir="estoque">📦 Estoque</button>
        <button class="btn-mini" data-abrir="caixa">💰 Fluxo de caixa</button>
      </div>
      <div class="dash-conteudo"><p class="muted">Carregando o resumo…</p></div>
    `;

    panel.querySelectorAll('[data-abrir]').forEach((b) =>
      b.addEventListener('click', () => window.__abrirModulo && window.__abrirModulo(b.dataset.abrir)));
    panel.querySelector('[data-acao=atualizar]').addEventListener('click', carregar);

    async function carregar() {
      const box = panel.querySelector('.dash-conteudo');
      box.innerHTML = '<p class="muted">Carregando o resumo…</p>';
      const r = await Api.call('dashboard_resumo');
      if (!r.ok) { box.innerHTML = `<p class="field-error">${esc(r.error)}</p>`; return; }
      const k = r.data;

      const serie = k.serie_7dias || [];
      const maxv = Math.max(1, ...serie.map((d) => Number(d.total)));
      const barras = serie.map((d) => {
        const alt = Math.round((Number(d.total) / maxv) * 100);
        return `<div class="dash-bar-col" title="${diaMes(d.dia)}: ${brl(d.total)}">
          <div class="dash-bar-wrap"><div class="dash-bar" style="height:${alt}%"></div></div>
          <span class="dash-bar-lbl">${diaSemana(d.dia)}</span>
        </div>`;
      }).join('');

      box.innerHTML = `
        <div class="kpis dash-kpis">
          <div class="kpi kpi-destaque">
            <span class="kpi-num">${brl(k.vendas_hoje_total)}</span>
            <span class="kpi-lbl">Vendas de hoje · ${k.vendas_hoje_qtd} venda(s)</span></div>
          <div class="kpi"><span class="kpi-num">${brl(k.ticket_medio)}</span><span class="kpi-lbl">Ticket médio hoje</span></div>
          <div class="kpi"><span class="kpi-num">${brl(k.vendas_mes)}</span><span class="kpi-lbl">Vendas no mês</span></div>
          <div class="kpi"><span class="kpi-num" style="color:var(--success)">${brl(k.a_receber)}</span><span class="kpi-lbl">A receber</span></div>
          <div class="kpi"><span class="kpi-num" style="color:var(--danger)">${brl(k.a_pagar)}</span><span class="kpi-lbl">A pagar</span></div>
          <div class="kpi ${k.vencidos ? 'kpi-alerta' : ''}"><span class="kpi-num">${k.vencidos}</span><span class="kpi-lbl">Contas vencidas</span></div>
          <div class="kpi"><span class="kpi-num">${k.produtos_total}</span><span class="kpi-lbl">Produtos ativos</span></div>
          <div class="kpi ${k.abaixo_minimo ? 'kpi-alerta' : ''}"><span class="kpi-num">${k.abaixo_minimo}</span><span class="kpi-lbl">Abaixo do mínimo</span></div>
        </div>

        <div class="dash-grafico">
          <h3>Vendas dos últimos 7 dias</h3>
          <div class="dash-bars">${barras}</div>
        </div>`;
    }

    carregar();
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { render };
})();
