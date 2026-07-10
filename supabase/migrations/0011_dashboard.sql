-- UltraERP — Migração 0011: RPC do Dashboard inicial
-- Consolida os KPIs do dia numa única chamada (vendas, financeiro, estoque),
-- para a tela de boas-vindas carregar rápido. Decisão/agregação no servidor.
-- "Hoje" e "mês" usam o fuso America/Sao_Paulo (não o relógio do cliente).

create or replace function public.dashboard_resumo()
returns json
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_loja  uuid := public.loja_do_usuario();
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_qtd   integer;
  v_total numeric;
  v_mes   numeric;
  v_serie json;
begin
  -- Vendas de hoje
  select count(*), coalesce(sum(total), 0)
    into v_qtd, v_total
    from public.vendas
   where loja_id = v_loja and status = 'concluida'
     and (criado_em at time zone 'America/Sao_Paulo')::date = v_hoje;

  -- Vendas do mês
  select coalesce(sum(total), 0) into v_mes
    from public.vendas
   where loja_id = v_loja and status = 'concluida'
     and (criado_em at time zone 'America/Sao_Paulo')::date
         >= date_trunc('month', v_hoje);

  -- Série dos últimos 7 dias (para o mini-gráfico)
  select json_agg(json_build_object('dia', d.dia, 'total', coalesce(s.total, 0)) order by d.dia)
    into v_serie
    from (select (v_hoje - g) as dia from generate_series(0, 6) g) d
    left join (
      select (criado_em at time zone 'America/Sao_Paulo')::date as dia, sum(total) as total
        from public.vendas
       where loja_id = v_loja and status = 'concluida'
         and (criado_em at time zone 'America/Sao_Paulo')::date > v_hoje - 7
       group by 1
    ) s on s.dia = d.dia;

  return json_build_object(
    'vendas_hoje_qtd',   v_qtd,
    'vendas_hoje_total', v_total,
    'ticket_medio',      case when v_qtd > 0 then round(v_total / v_qtd, 2) else 0 end,
    'vendas_mes',        v_mes,
    'serie_7dias',       coalesce(v_serie, '[]'::json),
    -- Financeiro
    'a_receber', (select coalesce(sum(valor), 0) from public.lancamentos
                   where loja_id = v_loja and tipo = 'receber' and not pago),
    'a_pagar',   (select coalesce(sum(valor), 0) from public.lancamentos
                   where loja_id = v_loja and tipo = 'pagar' and not pago),
    'vencidos',  (select count(*) from public.lancamentos
                   where loja_id = v_loja and not pago and vencimento < v_hoje),
    -- Estoque
    'produtos_total', (select count(*) from public.produtos
                        where loja_id = v_loja and ativo),
    'abaixo_minimo',  (select count(*) from public.produtos
                        where loja_id = v_loja and ativo and estoque_atual <= estoque_minimo)
  );
end;
$$;

revoke all on function public.dashboard_resumo() from public, anon;
grant execute on function public.dashboard_resumo() to authenticated;
