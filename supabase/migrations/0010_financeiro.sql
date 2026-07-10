-- UltraERP — Migração 0010: Fluxo de Caixa (contas a pagar e a receber)
-- Lançamentos financeiros + KPIs + baixa (marcar pago) com relógio do
-- servidor. Vendas do PDV passam a gerar um recebimento automático.

create table if not exists public.lancamentos (
  id          uuid primary key default gen_random_uuid(),
  loja_id     uuid not null references public.lojas (id) default public.loja_do_usuario(),
  tipo        text not null check (tipo in ('receber','pagar')),
  descricao   text not null check (length(trim(descricao)) >= 2),
  categoria   text not null default '',
  valor       numeric(12,2) not null check (valor > 0),
  vencimento  date not null default current_date,
  pago        boolean not null default false,
  pago_em     timestamptz,
  venda_id    uuid references public.vendas (id),   -- origem PDV (quando houver)
  usuario_id  uuid references public.usuarios (id),
  criado_em   timestamptz not null default now()
);

create index if not exists idx_lanc_loja_venc on public.lancamentos (loja_id, pago, vencimento);

-- ---------------- RLS ----------------
alter table public.lancamentos enable row level security;

grant select, insert, update on public.lancamentos to authenticated;
grant delete on public.lancamentos to authenticated;  -- só manuais (ver policy)
revoke all on public.lancamentos from anon;

create policy lanc_select on public.lancamentos
  for select to authenticated
  using (loja_id = public.loja_do_usuario());

create policy lanc_insert on public.lancamentos
  for insert to authenticated
  with check (loja_id = public.loja_do_usuario());

create policy lanc_update on public.lancamentos
  for update to authenticated
  using (loja_id = public.loja_do_usuario())
  with check (loja_id = public.loja_do_usuario());

-- Só lançamentos manuais (sem venda de origem) podem ser excluídos; os que
-- vieram do PDV ficam para não descasar do histórico de vendas.
create policy lanc_delete on public.lancamentos
  for delete to authenticated
  using (loja_id = public.loja_do_usuario() and venda_id is null);

-- ---------------- KPIs ----------------
create or replace function public.financeiro_resumo()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'a_receber',    coalesce(sum(valor) filter (where tipo='receber' and not pago), 0),
    'a_pagar',      coalesce(sum(valor) filter (where tipo='pagar'   and not pago), 0),
    'recebido_mes', coalesce(sum(valor) filter (where tipo='receber' and pago and pago_em >= date_trunc('month', now())), 0),
    'pago_mes',     coalesce(sum(valor) filter (where tipo='pagar'   and pago and pago_em >= date_trunc('month', now())), 0),
    'vencidos',     count(*) filter (where not pago and vencimento < current_date)
  )
  from public.lancamentos
  where loja_id = public.loja_do_usuario();
$$;

revoke all on function public.financeiro_resumo() from public, anon;
grant execute on function public.financeiro_resumo() to authenticated;

-- ---------------- baixa (marcar pago/não pago) ----------------
-- pago_em usa o relógio do SERVIDOR (nunca o do cliente).
create or replace function public.financeiro_baixar(p_id uuid, p_pago boolean)
returns json
language plpgsql volatile security definer
set search_path = public
as $$
begin
  update public.lancamentos
     set pago = p_pago,
         pago_em = case when p_pago then now() else null end
   where id = p_id and loja_id = public.loja_do_usuario();
  if not found then
    return json_build_object('ok', false, 'error', 'Lançamento não encontrado. Atualize a lista.');
  end if;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.financeiro_baixar(uuid, boolean) from public, anon;
grant execute on function public.financeiro_baixar(uuid, boolean) to authenticated;

-- ---------------- PDV passa a gerar recebimento ----------------
-- Recria pdv_finalizar_venda idêntica à 0009, adicionando o lançamento de
-- 'receber' (já pago, pois é venda no balcão) vinculado à venda.
create or replace function public.pdv_finalizar_venda(
  p_itens          jsonb,
  p_forma          text,
  p_valor_recebido numeric default null
)
returns json
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_loja    uuid := public.loja_do_usuario();
  v_usuario uuid := (select id from public.usuarios where auth_id = auth.uid());
  v_venda   uuid;
  v_total   numeric := 0;
  it        jsonb;
  v_prod    public.produtos%rowtype;
  v_qtd     numeric;
  v_sub     numeric;
begin
  if v_loja is null then
    raise exception 'PDVERRO:Sessão expirada. Entre novamente para continuar.';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'PDVERRO:Adicione ao menos um produto para finalizar a venda.';
  end if;
  if coalesce(p_forma, '') not in ('dinheiro','debito','credito','pix') then
    raise exception 'PDVERRO:Escolha a forma de pagamento.';
  end if;

  insert into public.vendas (loja_id, usuario_id, forma_pagamento, total)
  values (v_loja, v_usuario, p_forma, 0)
  returning id into v_venda;

  for it in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (it->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'PDVERRO:Quantidade inválida em um dos itens.';
    end if;

    select * into v_prod
      from public.produtos
     where id = (it->>'produto_id')::uuid and loja_id = v_loja and ativo;
    if not found then
      raise exception 'PDVERRO:Um dos produtos não está mais disponível. Refaça a venda.';
    end if;

    if v_prod.estoque_atual < v_qtd then
      raise exception 'PDVERRO:Estoque insuficiente de "%": há % em estoque.',
        v_prod.nome, v_prod.estoque_atual;
    end if;

    v_sub := round(v_prod.preco_venda * v_qtd, 2);

    insert into public.venda_itens (venda_id, produto_id, descricao, quantidade, preco_unit, subtotal)
    values (v_venda, v_prod.id, v_prod.nome, v_qtd, v_prod.preco_venda, v_sub);

    update public.produtos
       set estoque_atual = estoque_atual - v_qtd, atualizado_em = now()
     where id = v_prod.id;

    insert into public.estoque_movimentos (loja_id, produto_id, tipo, quantidade, motivo, usuario_id)
    values (v_loja, v_prod.id, 'saida', -v_qtd, 'Venda PDV', v_usuario);

    v_total := v_total + v_sub;
  end loop;

  update public.vendas set total = v_total where id = v_venda;

  -- Recebimento no fluxo de caixa (venda no balcão = já recebido).
  insert into public.lancamentos
    (loja_id, tipo, descricao, categoria, valor, vencimento, pago, pago_em, venda_id, usuario_id)
  values
    (v_loja, 'receber', 'Venda no PDV', 'Vendas', v_total, current_date, true, now(), v_venda, v_usuario);

  return json_build_object(
    'ok', true,
    'venda_id', v_venda,
    'total', v_total,
    'troco', case
      when p_forma = 'dinheiro' and p_valor_recebido is not null
      then greatest(p_valor_recebido - v_total, 0) else 0 end
  );
exception
  when others then
    if sqlerrm like 'PDVERRO:%' then
      return json_build_object('ok', false, 'error', substr(sqlerrm, 9));
    end if;
    raise;
end;
$$;
