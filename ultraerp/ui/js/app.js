/* Bootstrap do UltraERP: login → shell multi-abas. */

(() => {
  const $ = (sel) => document.querySelector(sel);

  const viewLogin = $('#view-login');
  const viewShell = $('#view-shell');
  const loginForm = $('#login-form');
  const loginBtn = $('#login-btn');
  const loginError = $('#login-error');
  const emailInput = $('#login-email');
  const passInput = $('#login-password');
  const rememberEmail = $('#remember-email');
  const rememberPass = $('#remember-password');

  // ---- lembrar e-mail/senha ------------------------------------------------
  // E-mail (não sensível): localStorage. Senha: cofre nativo do SO via bridge
  // — nunca em localStorage ou arquivo texto (especificação, seção 13).

  const KEY_EMAIL = 'ultraerp.login.email';
  const KEY_REMEMBER_PASS = 'ultraerp.login.rememberPass';

  async function prefillCredentials() {
    const savedEmail = localStorage.getItem(KEY_EMAIL);
    if (!savedEmail) return;
    emailInput.value = savedEmail;
    rememberEmail.checked = true;
    if (localStorage.getItem(KEY_REMEMBER_PASS) === '1') {
      rememberPass.checked = true;
      const r = await Api.call('credentials_get', savedEmail);
      if (r.ok && r.data.password) passInput.value = r.data.password;
    }
    passInput.focus();
  }

  async function persistCredentials(email, password) {
    if (rememberEmail.checked || rememberPass.checked) {
      localStorage.setItem(KEY_EMAIL, email); // lembrar senha implica lembrar e-mail
      rememberEmail.checked = true;
    } else {
      localStorage.removeItem(KEY_EMAIL);
    }
    if (rememberPass.checked) {
      const r = await Api.call('credentials_save', email, password);
      if (r.ok) {
        localStorage.setItem(KEY_REMEMBER_PASS, '1');
      } else {
        // Cofre do SO indisponível: avisa, mas não impede o uso
        localStorage.removeItem(KEY_REMEMBER_PASS);
        rememberPass.checked = false;
        alert(r.error);
      }
    } else {
      localStorage.removeItem(KEY_REMEMBER_PASS);
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
      openModule(mods.data[0]); // Dashboard como aba inicial
    }
  }

  // Módulos com tela própria; os demais caem no placeholder
  const MODULE_RENDERERS = {
    estoque: (panel) => ModuloEstoque.render(panel),
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
