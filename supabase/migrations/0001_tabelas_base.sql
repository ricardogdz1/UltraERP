-- UltraERP — Migração 0001: tabelas base (Fase 1)
-- Aplicar no SQL Editor do Supabase ou via `supabase db push`.

-- Tenant = Loja (CNPJ). Uma conta pode ter várias lojas (multi-filial na Fase 3).
create table if not exists public.lojas (
  id            uuid primary key default gen_random_uuid(),
  cnpj          char(14) not null unique check (cnpj ~ '^[0-9]{14}$'),
  razao_social  text not null,
  nome_fantasia text not null default '',
  uf            char(2) not null check (uf ~ '^[A-Z]{2}$'),
  criado_em     timestamptz not null default now()
);

-- Usuário do app, vinculado ao Supabase Auth (auth.users) e a uma loja.
create table if not exists public.usuarios (
  id        uuid primary key default gen_random_uuid(),
  auth_id   uuid not null unique references auth.users (id) on delete cascade,
  loja_id   uuid not null references public.lojas (id),
  nome      text not null,
  email     text not null,
  -- Papéis padrão da especificação (seção 8); papéis customizados: Fase 2
  papel     text not null default 'administrador' check (papel in
            ('administrador','gerente','caixa','estoquista','financeiro','contador')),
  criado_em timestamptz not null default now()
);

create index if not exists idx_usuarios_loja on public.usuarios (loja_id);

-- Assinatura da loja. Fase 1: plano único por loja.
-- ESTA TABELA NUNCA É ESCRITA PELO CLIENTE: mudanças de status vêm do
-- webhook do gateway de pagamento (service_role), conforme seções 7.3 e 13.
create table if not exists public.assinaturas (
  id              uuid primary key default gen_random_uuid(),
  loja_id         uuid not null unique references public.lojas (id),
  plano           text not null default 'fase1',
  status          text not null default 'trial' check (status in
                  ('trial','ativa','inadimplente','cancelada')),
  trial_fim       timestamptz not null default now() + interval '14 days',
  pago_ate        timestamptz,            -- atualizado pelo webhook a cada pagamento
  tolerancia_dias integer not null default 5,
  atualizado_em   timestamptz not null default now(),
  criado_em       timestamptz not null default now()
);

comment on table public.assinaturas is
  'Fonte de verdade do licenciamento. Somente o backend (service_role/webhook) escreve aqui.';
