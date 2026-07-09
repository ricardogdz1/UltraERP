-- UltraERP — Migração 0008: default de loja_id em produtos
-- Ao criar um produto, o cliente não envia loja_id (não deve mesmo saber
-- decidir isso). Sem default, o INSERT ia com loja_id nulo e a policy
-- produtos_insert (with check loja_id = loja_do_usuario()) rejeitava com
-- RLS 42501 — quebrava "incluir novo produto".
-- Solução: default = loja do usuário autenticado, avaliado no INSERT.
-- A RLS continua sendo a barreira real (o with check revalida).

alter table public.produtos
  alter column loja_id set default public.loja_do_usuario();
