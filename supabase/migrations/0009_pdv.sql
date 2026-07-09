-- UltraERP — Migração 0009: PDV (Ponto de Venda) — Fase 1
-- Registra a venda e seus itens e dá baixa no estoque numa ÚNICA transação
-- (tudo ou nada). A emissão fiscal (NFC-e via API terceirizada) virá depois;
-- aqui o foco é a operação de caixa e o controle de estoque auditável.

create table if not exists public.vendas (
  id              uuid primary key default gen_random_uuid(),
  loja_id         uuid not null references public.lojas (id) default public.loja_do_usuario(),
  usuario_id      uuid references public.usuarios (id),
  forma_pagamento text not null check (forma_pagamento in ('dinheiro','debito','credito','pix')),
  total           numeric(12,2) not null default 0 check (total >= 0),
  status          text not null default 'concluida' check (status in ('concluida','cancelada')),
  criado_em       timestamptz not null default now()
);

create index if not exists idx_vendas_loja_data on public.vendas (loja_id, criado_em desc);

-- Itens guardam um SNAPSHOT (descrição e preço no momento da venda), para o
-- histórico não mudar se o produto for editado depois.
create table if not exists public.venda_itens (
  id          uuid primary key default gen_random_uuid(),
  venda_id    uuid not null references public.vendas (id) on delete cascade,
  produto_id  uuid references public.produtos (id),
  descricao   text not null,
  quantidade  numeric(12,3) not null check (quantidade > 0),
  preco_unit  numeric(12,2) not null check (preco_unit >= 0),
  subtotal    numeric(12,2) not null check (subtotal >= 0)
);

create index if not exists idx_venda_itens_venda on public.venda_itens (venda_id);

-- ---------------- RLS ----------------
-- Cliente só LÊ (histórico da própria loja). A escrita é exclusivamente pela
-- RPC pdv_finalizar_venda (security definer) — nunca INSERT direto.

alter table public.vendas      enable row level security;
alter table public.venda_itens enable row level security;

grant select on public.vendas, public.venda_itens to authenticated;
revoke all on public.vendas, public.venda_itens from anon;

create policy vendas_select on public.vendas
  for select to authenticated
  using (loja_id = public.loja_do_usuario());

create policy venda_itens_select on public.venda_itens
  for select to authenticated
  using (venda_id in (select id from public.vendas where loja_id = public.loja_do_usuario()));

-- ---------------- RPC: finalizar venda (atômica) ----------------

create or replace function public.pdv_finalizar_venda(
  p_itens          jsonb,           -- [{ "produto_id": uuid, "quantidade": num }]
  p_forma          text,
  p_valor_recebido numeric default null   -- só para calcular troco em dinheiro
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

revoke all on function public.pdv_finalizar_venda(jsonb, text, numeric) from public, anon;
grant execute on function public.pdv_finalizar_venda(jsonb, text, numeric) to authenticated;
