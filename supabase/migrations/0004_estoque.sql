-- UltraERP — Migração 0004: módulo Estoque (Fase 1, básico)
-- Produtos + movimentos de estoque auditáveis + RPC atômica de ajuste.
-- Variações, lotes, kits e transferência entre lojas: Fase 2/3.

create table if not exists public.produtos (
  id             uuid primary key default gen_random_uuid(),
  loja_id        uuid not null references public.lojas (id),
  nome           text not null check (length(trim(nome)) >= 2),
  ean            text not null default '' check (ean = '' or ean ~ '^[0-9]{8,14}$'),
  ncm            text not null default '' check (ncm = '' or ncm ~ '^[0-9]{8}$'),
  unidade        text not null default 'UN',
  preco_custo    numeric(12,2) not null default 0 check (preco_custo >= 0),
  preco_venda    numeric(12,2) not null check (preco_venda >= 0),
  estoque_atual  numeric(12,3) not null default 0,
  estoque_minimo numeric(12,3) not null default 0 check (estoque_minimo >= 0),
  ativo          boolean not null default true,   -- exclusão é sempre lógica
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- EAN único por loja (quando informado)
create unique index if not exists idx_produtos_ean_loja
  on public.produtos (loja_id, ean) where ean <> '';
-- Busca por nome (listagens paginadas)
create index if not exists idx_produtos_loja_nome
  on public.produtos (loja_id, lower(nome));

-- Histórico imutável de movimentos — auditoria exigida pela seção 3.2/8.
create table if not exists public.estoque_movimentos (
  id          uuid primary key default gen_random_uuid(),
  loja_id     uuid not null references public.lojas (id),
  produto_id  uuid not null references public.produtos (id),
  tipo        text not null check (tipo in ('entrada','saida','ajuste')),
  quantidade  numeric(12,3) not null check (quantidade <> 0),
  motivo      text not null default '',
  usuario_id  uuid references public.usuarios (id),
  criado_em   timestamptz not null default now()
);

create index if not exists idx_movimentos_produto
  on public.estoque_movimentos (produto_id, criado_em desc);

-- ---------------- RLS ----------------

alter table public.produtos           enable row level security;
alter table public.estoque_movimentos enable row level security;

grant select, insert, update on public.produtos           to authenticated;
grant select, insert         on public.estoque_movimentos to authenticated;
-- Sem grant de DELETE em nenhuma das duas: produto sai de cena com
-- ativo=false; movimento nunca é apagado nem alterado.
revoke all on public.produtos, public.estoque_movimentos from anon;

create policy produtos_select on public.produtos
  for select to authenticated
  using (loja_id = public.loja_do_usuario());

create policy produtos_insert on public.produtos
  for insert to authenticated
  with check (loja_id = public.loja_do_usuario());

create policy produtos_update on public.produtos
  for update to authenticated
  using (loja_id = public.loja_do_usuario())
  with check (loja_id = public.loja_do_usuario());

create policy movimentos_select on public.estoque_movimentos
  for select to authenticated
  using (loja_id = public.loja_do_usuario());

create policy movimentos_insert on public.estoque_movimentos
  for insert to authenticated
  with check (loja_id = public.loja_do_usuario());

-- ---------------- RPC: ajuste atômico de estoque ----------------
-- Atualiza o saldo E registra o movimento numa única transação — o app
-- nunca escreve estoque_atual diretamente sem rastro.

create or replace function public.estoque_ajustar(
  p_produto_id uuid,
  p_quantidade numeric,     -- positiva = entrada, negativa = saída
  p_motivo     text default ''
)
returns json
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_loja  uuid := public.loja_do_usuario();
  v_novo  numeric;
begin
  if p_quantidade = 0 then
    return json_build_object('ok', false,
      'error', 'Informe uma quantidade diferente de zero.');
  end if;

  update public.produtos
     set estoque_atual = estoque_atual + p_quantidade,
         atualizado_em = now()
   where id = p_produto_id and loja_id = v_loja
  returning estoque_atual into v_novo;

  if not found then
    return json_build_object('ok', false,
      'error', 'Produto não encontrado. Atualize a lista e tente de novo.');
  end if;

  if v_novo < 0 then
    -- desfaz: estoque não pode ficar negativo na Fase 1
    raise exception 'estoque_negativo';
  end if;

  insert into public.estoque_movimentos
    (loja_id, produto_id, tipo, quantidade, motivo, usuario_id)
  values
    (v_loja, p_produto_id,
     case when p_quantidade > 0 then 'entrada' else 'saida' end,
     p_quantidade, coalesce(p_motivo, ''),
     (select id from public.usuarios where auth_id = auth.uid()));

  return json_build_object('ok', true, 'estoque_atual', v_novo);
exception
  when others then
    if sqlerrm = 'estoque_negativo' then
      return json_build_object('ok', false,
        'error', 'Essa saída deixaria o estoque negativo. Confira a quantidade.');
    end if;
    raise;
end;
$$;

revoke all on function public.estoque_ajustar(uuid, numeric, text) from public, anon;
grant execute on function public.estoque_ajustar(uuid, numeric, text) to authenticated;
