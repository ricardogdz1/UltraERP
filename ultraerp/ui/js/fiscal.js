/* Configuração fiscal (NFC-e via Focus NFe).
   Modal aberto pela engrenagem da topbar. O token e o CSC são segredos: vão
   direto para o servidor (RPC security definer) e nunca voltam para a tela. */

const Fiscal = (() => {
  const $ = (sel) => document.querySelector(sel);

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function abrirConfig() {
    const modal = $('#fiscal-modal');
    const body = $('#fiscal-modal-body');
    modal.hidden = false;
    body.innerHTML = '<p class="muted">Carregando…</p>';

    const r = await Api.call('fiscal_status');
    const c = (r.ok && r.data) || {};
    const temToken = !!c.tem_token;

    body.innerHTML = `
      <p class="muted" style="margin-bottom:12px">
        Emissão de NFC-e via <strong>Focus NFe</strong>. Comece em
        <strong>homologação</strong> (teste, sem valor fiscal) e mude para
        produção quando estiver tudo certo.
        ${c.configurado
          ? '<br><span class="badge-ok">Pronto para emitir</span>'
          : '<br><span class="badge-alerta">Ainda não configurado</span>'}
      </p>

      <div class="fiscal-simulacao">
        <label class="checkbox">
          <input type="checkbox" name="modo_simulacao" ${c.modo_simulacao ? 'checked' : ''}>
          <strong>Modo simulação</strong> — testar a emissão sem token/CNPJ
        </label>
        <p class="muted" style="margin-top:4px">
          Ligado, o botão “Emitir NFC-e” do PDV gera uma nota fictícia
          (marcada como <em>SIMULAÇÃO — sem valor fiscal</em>) para você testar
          todo o fluxo agora. Ao ter a conta da Focus, desligue e cole o token.
        </p>
      </div>

      <div class="grid-2">
        <div><label>Ambiente</label>
          <select name="ambiente">
            <option value="homologacao" ${c.ambiente !== 'producao' ? 'selected' : ''}>Homologação (teste)</option>
            <option value="producao" ${c.ambiente === 'producao' ? 'selected' : ''}>Produção (valor fiscal)</option>
          </select></div>
        <div><label>Token da Focus <span class="hint" title="Gerado no painel da Focus NFe, por empresa. É um segredo — fica só no servidor.">?</span></label>
          <input name="focus_token" type="password" autocomplete="off"
            placeholder="${temToken ? 'Token já salvo — deixe em branco para manter' : 'Cole o token da Focus'}"></div>
        <div><label>CSC (NFC-e)</label>
          <input name="csc" type="password" autocomplete="off"
            placeholder="${c.tem_csc ? 'Já salvo — deixe em branco para manter' : 'Código de Segurança do Contribuinte'}"></div>
        <div><label>ID do CSC</label>
          <input name="csc_id" placeholder="Ex.: 000001"></div>
        <div><label>Inscrição Estadual</label>
          <input name="inscricao_estadual" value="${esc(c.inscricao_estadual ?? '')}" placeholder="IE ou ISENTO"></div>
        <div><label>Regime tributário</label>
          <select name="regime_tributario">
            <option value="1" ${String(c.regime_tributario) === '1' ? 'selected' : ''}>Simples Nacional</option>
            <option value="2" ${String(c.regime_tributario) === '2' ? 'selected' : ''}>Simples — excesso de receita</option>
            <option value="3" ${String(c.regime_tributario) === '3' ? 'selected' : ''}>Regime Normal</option>
          </select></div>
        <div><label>Série da NFC-e</label>
          <input name="serie_nfce" inputmode="numeric" value="${esc(c.serie_nfce ?? 1)}"></div>
        <div><label>Código do município (IBGE)</label>
          <input name="codigo_municipio" inputmode="numeric" placeholder="7 dígitos"></div>
        <div><label>Logradouro</label><input name="logradouro" placeholder="Rua/Av."></div>
        <div><label>Número</label><input name="numero" placeholder="Nº"></div>
        <div><label>Bairro</label><input name="bairro"></div>
        <div><label>CEP</label><input name="cep" inputmode="numeric" placeholder="Só números"></div>
        <div><label>Telefone</label><input name="telefone" inputmode="numeric"></div>
      </div>
      <p class="field-error" data-erro="fiscal" hidden></p>
      <div class="form-acoes">
        <button class="btn-primary btn-inline" data-acao="salvar-fiscal">Salvar</button>
        <button class="btn-mini" data-acao="fechar-fiscal">Cancelar</button>
      </div>`;

    body.querySelector('[data-acao=fechar-fiscal]').addEventListener('click', fechar);
    body.querySelector('[data-acao=salvar-fiscal]').addEventListener('click', async () => {
      const dados = {};
      body.querySelectorAll('[name]').forEach((i) => {
        if (i.type === 'checkbox') { dados[i.name] = i.checked ? 'true' : 'false'; return; }
        // segredos em branco não são enviados (mantêm o valor salvo)
        if ((i.name === 'focus_token' || i.name === 'csc') && !i.value) return;
        dados[i.name] = i.value;
      });
      const erro = body.querySelector('[data-erro=fiscal]');
      erro.hidden = true;
      const rs = await Api.call('fiscal_config_salvar', dados);
      if (!rs.ok) { erro.textContent = rs.error; erro.hidden = false; return; }
      fechar();
    });
  }

  function fechar() { $('#fiscal-modal').hidden = true; }

  function init() {
    $('#config-btn').addEventListener('click', abrirConfig);
    $('#fiscal-modal-close').addEventListener('click', fechar);
    $('#fiscal-modal').addEventListener('click', (e) => {
      if (e.target === $('#fiscal-modal')) fechar();
    });
  }

  return { init, abrirConfig };
})();
