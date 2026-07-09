-- UltraERP — Migração 0007: apoio ao módulo Estoque "completo" (Fase 1)
-- View com sinalização de estoque baixo (para filtro e destaque) e RPC de
-- resumo para os KPIs. Nada aqui afeta escrita: cadastro/ajuste continuam
-- pela tabela produtos e pela RPC estoque_ajustar.

-- View que acrescenta o booleano `abaixo_minimo`. security_invoker = true
-- faz a RLS da tabela produtos valer para quem consulta — o isolamento por
-- loja continua garantido pelo servidor (não é a view que decide).
create or replace view public.vw_produtos
  with (security_invoker = true) as
  select
    p.*,
    (p.estoque_atual <= p.estoque_minimo) as abaixo_minimo
  from public.produtos p;

grant select on public.vw_produtos to authenticated;
revoke all on public.vw_produtos from anon;

-- Resumo do estoque para os cartões de KPI. Decisão/agregação no servidor
-- (mesma linha de subscription_status): o app só exibe.
create or replace function public.estoque_resumo()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'total',         count(*) filter (where ativo),
    'abaixo_minimo', count(*) filter (where ativo and estoque_atual <= estoque_minimo),
    'valor_custo',   coalesce(sum(preco_custo * estoque_atual) filter (where ativo), 0),
    'valor_venda',   coalesce(sum(preco_venda * estoque_atual) filter (where ativo), 0)
  )
  from public.produtos
  where loja_id = public.loja_do_usuario();
$$;

revoke all on function public.estoque_resumo() from public, anon;
grant execute on function public.estoque_resumo() to authenticated;
