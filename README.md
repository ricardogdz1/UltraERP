# UltraERP

ERP desktop para lojistas de varejo brasileiro. Python + PyWebView, PostgreSQL em nuvem (Supabase) e storage S3-compatible.

Especificação de referência: `UltraERP_Prompt_de_Projeto.md`. Estágio atual: **Fase 1 (MVP) — esqueleto do aplicativo**.

## O que já existe

- Janela desktop PyWebView (WebView nativo do SO — leve, sem Chromium embutido)
- Shell multi-abas estilo navegador, com estado preservado ao trocar de aba
- Tema claro/escuro (segue o SO por padrão, alternância manual)
- Tela de login com autenticação via Supabase Auth (validação no servidor)
- Verificação de assinatura no servidor a cada login (`core/licensing.py`) — nunca decidida localmente
- Camada de banco SQLAlchemy 2.0 + modelos iniciais (Loja/tenant, Usuário) + Alembic
- Bridge JS↔Python via `pywebview.api`
- Placeholders dos módulos da Fase 1: Dashboard, Estoque, PDV, Fluxo de Caixa, Financeiro, Fiscal

## Como rodar

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env         # e preencha as credenciais do Supabase
python -m ultraerp.main
```

Sem `.env` configurado o app abre em **modo demonstração** (login local fake, sem banco) para desenvolvimento da interface.

## Estrutura

```
ultraerp/
├── main.py            # entrada — cria a janela PyWebView
├── config.py          # configurações via variáveis de ambiente
├── api/bridge.py      # métodos Python expostos ao front (pywebview.api)
├── core/auth.py       # login via Supabase Auth
├── core/licensing.py  # status da assinatura — sempre validado no servidor
├── db/engine.py       # engine SQLAlchemy (PostgreSQL/Supabase)
├── db/models.py       # modelos: Loja (tenant), Usuário
└── ui/                # front-end HTML/CSS/JS puro (sem build step)
```

## Regras não negociáveis (da especificação)

- Assinatura validada **no servidor**; sem flag local `licenciado=true`
- Emissão fiscal seguirá o MOC via API terceirizada (Fase 1: NF-e/NFC-e) — sem atalhos que gerem rejeição na SEFAZ
- Multiplataforma e leveza: sem dependências pesadas sem justificativa
- Mensagens de erro claras para lojista leigo, campo a campo
