-- UltraERP — Migração 0005: correção de grants das funções
-- O advisor de segurança do Supabase apontou que `loja_do_usuario()` ainda
-- era executável pelo role `anon`: a 0002 revogou de `anon`, mas toda função
-- no Postgres nasce com EXECUTE concedido a PUBLIC, e `anon` herda por aí.
-- Correção: revogar de PUBLIC e conceder explicitamente só a `authenticated`
-- (as policies de RLS chamam a função no contexto do usuário logado).

revoke all on function public.loja_do_usuario() from public, anon;
grant execute on function public.loja_do_usuario() to authenticated;
