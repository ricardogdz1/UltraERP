-- UltraERP — Migração 0002: Row Level Security multi-tenant
-- A barreira real de isolamento entre lojas é AQUI, no servidor —
-- nunca no filtro do aplicativo (especificação, seções 8 e 13).

-- Helper: loja do usuário autenticado (via JWT do Supabase Auth).
create or replace function public.loja_do_usuario()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select loja_id from public.usuarios where auth_id = auth.uid();
$$;

revoke all on function public.loja_do_usuario() from anon;

-- Habilita RLS. Por padrão, RLS nega tudo que não tiver policy explícita.
alter table public.lojas       enable row level security;
alter table public.usuarios    enable row level security;
alter table public.assinaturas enable row level security;

-- Privilégios explícitos (não depender dos defaults do Supabase).
-- GRANT dá o direito bruto; as policies abaixo restringem às linhas da loja.
-- Em assinaturas, o cliente só tem SELECT: escrever é impossível por design.
grant select, update on public.lojas       to authenticated;
grant select         on public.usuarios    to authenticated;
grant select         on public.assinaturas to authenticated;
revoke all on public.lojas, public.usuarios, public.assinaturas from anon;

-- LOJAS: usuário vê e edita apenas a própria loja. Criação de loja é feita
-- pelo fluxo de onboarding no backend (service_role), não pelo cliente.
create policy lojas_select on public.lojas
  for select to authenticated
  using (id = public.loja_do_usuario());

create policy lojas_update on public.lojas
  for update to authenticated
  using (id = public.loja_do_usuario());

-- USUARIOS: visíveis apenas dentro da mesma loja.
-- Escrita (convidar/alterar papel) ficará em RPC própria com checagem de
-- papel administrador — por ora, somente leitura pelo cliente.
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (loja_id = public.loja_do_usuario());

-- ASSINATURAS: cliente pode apenas LER a assinatura da própria loja.
-- Nenhuma policy de insert/update/delete = escrita negada para o cliente.
-- Só o webhook do gateway (service_role, que ignora RLS) muda o status.
create policy assinaturas_select on public.assinaturas
  for select to authenticated
  using (loja_id = public.loja_do_usuario());
