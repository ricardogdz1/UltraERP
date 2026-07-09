# Backend Supabase — guia de aplicação

## Passos

1. Crie um projeto em [supabase.com](https://supabase.com) (região `sa-east-1`, São Paulo — menor latência para lojistas brasileiros).
2. No **SQL Editor**, execute os arquivos de `migrations/` **na ordem**:
   `0001_tabelas_base.sql` → `0002_rls.sql` → `0003_subscription_status.sql` → `0004_estoque.sql` → `0005_fix_grants_funcoes.sql`.
   *(Já aplicadas no projeto `UltraERP` em 08/07/2026.)*
3. Em **Authentication → Providers**, deixe apenas *Email* habilitado (Fase 1) e desative *Confirm email* durante o desenvolvimento.
4. Em **Settings → API**, copie a *URL* e a *anon key* para o `.env` do app. Em **Settings → Database**, copie a connection string do *pooler* (porta 6543) para `DATABASE_URL`.

## Criar uma loja (onboarding)

Registre um usuário (signup pelo app ou `POST /auth/v1/signup`) e chame a RPC
`onboarding_criar_loja` autenticado — ela valida o CNPJ (dígito verificador,
no servidor), cria a loja, vincula o usuário como administrador e inicia o
trial de 14 dias, tudo numa transação:

```sql
select onboarding_criar_loja(
  p_cnpj => '11.222.333/0001-81', p_razao_social => 'Minha Loja Teste LTDA',
  p_uf => 'SP', p_nome_usuario => 'Seu Nome', p_nome_fantasia => 'Loja Teste');
```

Loja de teste já criada no projeto: usuário `teste@ultraerp.dev`
(senha `TesteUltra123!`), CNPJ 11.222.333/0001-81, com um produto e
movimentos de estoque de exemplo.

## Decisões de segurança embutidas (especificação, seções 7 e 13)

- `assinaturas` não tem policy nem grant de escrita para o cliente — só o webhook do gateway de pagamento (service_role) muda status. Testado: UPDATE pelo cliente retorna `permission denied`.
- `subscription_status()` decide com `now()` do servidor; adiantar/atrasar o relógio do PC não tem efeito.
- Bloqueio progressivo: `trial/ativo → tolerancia → bloqueado_parcial (30 dias) → bloqueado`. Dados nunca são apagados por inadimplência.
- RLS isola cada loja (tenant); testado com dois usuários de lojas diferentes.

## Validação executada

Migrações aplicadas e testadas em PostgreSQL real (embutido, via `pgserver`): isolamento RLS entre duas lojas, RPC nos estados `ativo`, `trial vencido → bloqueado`, e tentativa de fraude por UPDATE direto — todos com o resultado esperado.

## Webhook de pagamento (Asaas)

Edge Function `asaas-webhook` (código em `functions/asaas-webhook/index.ts`)
publicada em `https://ofgmniqzqrmetxlbznfe.supabase.co/functions/v1/asaas-webhook`.
Roda com service_role e é o único caminho que altera `assinaturas`:
pagamento confirmado → `ativa` + `pago_ate` estendido; vencido →
`inadimplente`; estorno/chargeback → revoga o período pago na hora.
Sem o header `asaas-access-token` correto, responde 401 (testado).

Para ativar, falta apenas (manual, no painel de cada serviço):
1. Criar a conta no Asaas e configurar o webhook de cobranças apontando para a URL acima, definindo um token de autenticação.
2. Salvar esse mesmo token como secret `ASAAS_WEBHOOK_TOKEN` em Edge Functions → Secrets no dashboard do Supabase.
3. Ao criar cobranças/assinaturas no Asaas, preencher `externalReference` com o `lojas.id`.

## Pendências (próximas etapas)

- RPCs de gestão de usuários (convidar, trocar papel) com checagem de papel administrador.
- Token de graça offline assinado pelo servidor (48–72h).
- Idempotência/registro de eventos recebidos no webhook (tabela de eventos processados).
