/* Bootstrap do UltraERP: login → shell multi-abas. */

(() => {
  const $ = (sel) => document.querySelector(sel);

  const viewLogin = $('#view-login');
  const viewShell = $('#view-shell');
  const viewCadastro = $('#view-cadastro');
  const loginForm = $('#login-form');
  const loginBtn = $('#login-btn');
  const loginError = $('#login-error');
  const emailInput = $('#login-email');
  const passInput = $('#login-password');
  const rememberEmail = $('#remember-email');
  const rememberPass = $('#remember-password');

  // ---- lembrar e-mail/senha ------------------------------------------------
  // Preferências (e-mail lembrado, flags) ficam no lado Python (core/prefs.py),
  // que persiste em arquivo e independe do WebView (roda em modo privado).
  // A senha vai para o cofre nativo do SO — nunca em arquivo de texto
  // (especificação, seção 13). O token de sessão só vive em memória.

  async function prefillCredentials() {
    const pr = await Api.call('prefs_get');
    const p = (pr.ok && pr.data) || {};
    if (p.remember_email && p.email) {
      emailInput.value = p.email;
      rememberEmail.checked = true;
    }
    if (p.remember_password && p.email) {
      rememberPass.checked = true;
      const r = await Api.call('credentials_get', p.email);
      if (r.ok && r.data.password) passInput.value = r.data.password;
    }
    if (emailInput.value) passInput.focus();
  }

  async function persistCredentials(email, password) {
    const lembrarEmail = rememberEmail.checked || rememberPass.checked;
    await Api.call('prefs_set', {
      email: lembrarEmail ? email : '',
      remember_email: lembrarEmail,
      remember_password: rememberPass.checked,
    });
    if (rememberPass.checked) {
      const r = await Api.call('credentials_save', email, password);
      if (!r.ok) {
        // Cofre do SO indisponível: avisa, mas não impede o uso
        rememberPass.checked = false;
        await Api.call('prefs_set', { remember_password: false });
        alert(r.error);
      }
    } else {
      await Api.call('credentials_delete', email);
    }
  }

  // ---- login -------------------------------------------------------------

  async function detectDemoMode() {
    const r = await Api.call('ping');
    if (r.ok && r.data.demo_mode) $('#demo-badge').hidden = false;
  }

  function showFieldError(msg, field) {
    loginError.textContent = msg;
    loginError.hidden = false;
    if (field) {
      field.classList.add('invalid');
      field.focus();
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    emailInput.classList.remove('invalid');
    passInput.classList.remove('invalid');

    // Validação client-side com mensagem específica (a validação real é no servidor)
    if (!emailInput.value.includes('@')) {
      return showFieldError('Digite um e-mail válido — ex.: nome@empresa.com.br', emailInput);
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Entrando…';
    const r = await Api.call('login', emailInput.value.trim(), passInput.value);
    loginBtn.disabled = false;
    loginBtn.textContent = 'Entrar';

    if (!r.ok) return showFieldError(r.error, passInput);
    // Abrir a tela principal é o que importa; guardar as credenciais é um
    // extra que nunca deve impedir o acesso. Por isso o shell abre primeiro,
    // e o persist roda depois sem bloquear.
    try {
      await enterShell(r.data);
    } catch (err) {
      console.error('enterShell falhou:', err);
      showFieldError('Login ok, mas houve um erro ao abrir a tela principal: ' + (err && err.message ? err.message : err), null);
      return;
    }
    persistCredentials(emailInput.value.trim(), passInput.value).catch((err) =>
      console.error('persistCredentials falhou (ignorado):', err)
    );
  });

  // ---- cadastro (conta + loja) --------------------------------------------

  const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

  const cadastroForm = $('#cadastro-form');
  const cadastroBtn = $('#cadastro-btn');
  const cadastroError = $('#cadastro-error');

  // Preenche o <select> de UF uma vez
  {
    const sel = $('#cad-uf');
    for (const uf of UFS) {
      const opt = document.createElement('option');
      opt.value = uf; opt.textContent = uf;
      sel.appendChild(opt);
    }
  }

  function mostrarCadastro() {
    limparErrosCadastro();
    viewLogin.hidden = true;
    viewCadastro.hidden = false;
    $('#cad-email').focus();
  }
  function mostrarLogin() {
    viewCadastro.hidden = true;
    viewLogin.hidden = false;
  }
  $('#ir-cadastro').addEventListener('click', (e) => { e.preventDefault(); mostrarCadastro(); });
  $('#ir-login').addEventListener('click', (e) => { e.preventDefault(); mostrarLogin(); });

  // Máscara de CNPJ: 00.000.000/0000-00 (só dígitos, formatado ao digitar)
  $('#cad-cnpj').addEventListener('input', (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 14);
    let out = d;
    if (d.length > 2)  out = d.slice(0, 2) + '.' + d.slice(2);
    if (d.length > 5)  out = out.slice(0, 6) + '.' + d.slice(5);
    if (d.length > 8)  out = out.slice(0, 10) + '/' + d.slice(8);
    if (d.length > 12) out = out.slice(0, 15) + '-' + d.slice(12);
    e.target.value = out;
  });

  function limparErrosCadastro() {
    cadastroError.hidden = true;
    cadastroForm.querySelectorAll('[data-erro]').forEach((e) => (e.hidden = true));
    cadastroForm.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
  }

  cadastroForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErrosCadastro();

    const dados = {};
    cadastroForm.querySelectorAll('[name]').forEach((i) => { dados[i.name] = i.value; });

    cadastroBtn.disabled = true;
    cadastroBtn.textContent = 'Criando…';
    const r = await Api.call('cadastrar', dados);
    cadastroBtn.disabled = false;
    cadastroBtn.textContent = 'Criar conta e entrar';

    if (r.ok) {
      viewCadastro.hidden = true;
      try {
        await enterShell(r.data);
      } catch (err) {
        console.error('enterShell (cadastro) falhou:', err);
        mostrarLogin();
        showFieldError('Conta criada! Faça login para entrar.', null);
      }
      return;
    }

    // erros por campo (seção 9), preservando o que foi digitado
    const campos = r.field_errors || { _geral: r.error };
    let primeiro = null;
    for (const [campo, msg] of Object.entries(campos)) {
      const el = cadastroForm.querySelector(`[data-erro="${campo}"]`);
      if (el) { el.textContent = msg; el.hidden = false; }
      const input = cadastroForm.querySelector(`[name="${campo}"]`);
      if (input) { input.classList.add('invalid'); primeiro = primeiro || input; }
    }
    if (primeiro) primeiro.focus();
    else { cadastroError.textContent = r.error || 'Não foi possível concluir o cadastro.'; cadastroError.hidden = false; }
  });

  // ---- shell ---------------------------------------------------------------

  async function enterShell(session) {
    viewLogin.hidden = true;
    viewShell.hidden = false;
    $('#user-email').textContent = session.email;

    // Aviso de assinatura (status vem sempre do servidor)
    const lic = session.license;
    const banner = $('#license-banner');
    if (lic && lic.message) {
      banner.textContent = lic.message;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }

    Tabs.init($('#tabbar'), $('#tab-panels'));

    const mods = await Api.call('list_modules');
    if (mods.ok) {
      const menu = $('#module-menu');
      menu.innerHTML = '';
      for (const m of mods.data) {
        const li = document.createElement('li');
        li.textContent = m.label;
        li.addEventListener('click', () => openModule(m));
        menu.appendChild(li);
      }
      // Ações rápidas do Dashboard podem abrir outras abas por id
      window.__abrirModulo = (id) => {
        const m = mods.data.find((x) => x.id === id);
        if (m) openModule(m);
      };
      openModule(mods.data[0]); // Dashboard como aba inicial
    }
  }

  // Módulos com tela própria; os demais caem no placeholder
  const MODULE_RENDERERS = {
    dashboard: (panel) => ModuloDashboard.render(panel),
    estoque: (panel) => ModuloEstoque.render(panel),
    pdv: (panel) => ModuloPDV.render(panel),
    caixa: (panel) => ModuloCaixa.render(panel),
  };

  function openModule(mod) {
    Tabs.open(mod.id, mod.label, (panel) => {
      const renderer = MODULE_RENDERERS[mod.id];
      if (renderer) return renderer(panel);
      panel.innerHTML =
        '<div class="placeholder"><h2>' + mod.label + '</h2>' +
        '<p>Módulo em construção (Fase 1 do roadmap). O conteúdo digitado ' +
        'aqui é preservado ao trocar de aba.</p>' +
        '<label>Teste de preservação de estado</label>' +
        '<input placeholder="Digite algo e troque de aba">' +
        '</div>';
    });
  }

  $('#theme-toggle').addEventListener('click', Theme.toggle);

  $('#logout-btn').addEventListener('click', async () => {
    await Api.call('logout');
    Tabs.closeAll();
    viewShell.hidden = true;
    viewLogin.hidden = false;
    passInput.value = '';
  });

  detectDemoMode();
  prefillCredentials();
})();
