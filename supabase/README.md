# Backend Supabase — guia de aplicação

## Passos

1. Crie um projeto em [supabase.com](https://supabase.com) (região `sa-east-1`, São Paulo — menor latência para lojistas brasileiros).
2. No **SQL Editor**, execute os arquivos de `migrations/` **na ordem**:
   `0001_tabelas_base.sql` → `0002_rls.sql` → `0003_subscription_status.sql` → `0004_estoque.sql` → `0005_fix_grants_funcoes.sql`.
   *(Já aplicadas no projeto `UltraERP` em 08/07/2026.)*
3. Em **Authentication → Providers**, deixe apenas *Email* habilitado (Fase 1) e desative *Confirm email* durante o desenvolvimento.
4. Em **Settings → API**, copie a *URL* e a *anon key* para o `.env` do app. Em **Settings → Database**, copie a connection string do *pooler* (porta 6543) para `DATABASE_URL`.

## Criar uma loja de teste

O onboarding automatizado virá depois; por ora, crie manualmente no SQL Editor (após registrar um usuário pela tela de login do app ou em Authentication → Users):

```sql
insert into lojas (cnpj, razao_social, uf)
values ('11222333000181', 'Minha Loja Teste', 'SP')
returning id;

-- use o id retornado acima e o UUID do usuário em Authentication → Users
insert into usuarios (auth_id, loja_id, nome, email)
values ('UUID-DO-AUTH-USER', 'UUID-DA-LOJA', 'Seu Nome', 'seu@email.com');

insert into assinaturas (loja_id) values ('UUID-DA-LOJA');  -- inicia trial de 14 dias
```

## Decisões de segurança embutidas (especificação, seções 7 e 13)

- `assinaturas` não tem policy nem grant de escrita para o cliente — só o webhook do gateway de pagamento (service_role) muda status. Testado: UPDATE pelo cliente retorna `permission denied`.
- `subscription_status()` decide com `now()` do servidor; adiantar/atrasar o relógio do PC não tem efeito.
- Bloqueio progressivo: `trial/ativo → tolerancia → bloqueado_parcial (30 dias) → bloqueado`. Dados nunca são apagados por inadimplência.
- RLS isola cada loja (tenant); testado com dois usuários de lojas diferentes.

## Validação executada

Migrações aplicadas e testadas em PostgreSQL real (embutido, via `pgserver`): isolamento RLS entre duas lojas, RPC nos estados `ativo`, `trial vencido → bloqueado`, e tentativa de fraude por UPDATE direto — todos com o resultado esperado.

## Pendências (próximas etapas)

- Webhook do gateway de pagamento (Asaas/Iugu/Stripe) atualizando `assinaturas` via Edge Function com service_role.
- RPC de onboarding (criar loja + vincular primeiro usuário como administrador).
- RPCs de gestão de usuários (convidar, trocar papel) com checagem de papel administrador.
- Token de graça offline assinado pelo servidor (48–72h).
