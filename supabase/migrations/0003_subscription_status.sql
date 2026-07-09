-- UltraERP — Migração 0003: RPC subscription_status
-- Chamada pelo app a cada login e periodicamente (core/licensing.py).
--
-- Requisitos não negociáveis (especificação, seções 7 e 13):
--   * Decisão SEMPRE no servidor, usando now() do SERVIDOR — o relógio
--     da máquina do lojista é irrelevante (ameaça #1 do threat model).
--   * Bloqueio progressivo: tolerância → bloqueado_parcial (sem emissão
--     fiscal/módulos avançados, consulta mantida) → bloqueado (sem login).
--     Dados nunca são apagados por inadimplência.
--
-- Retorno: { "status": ..., "plan": ..., "message": ... }
-- Status possíveis: ativo | trial | tolerancia | bloqueado_parcial | bloqueado

create or replace function public.subscription_status()
returns json
language plpgsql stable security definer
set search_path = public
as $$
declare
  a      public.assinaturas%rowtype;
  agora  timestamptz := now();   -- relógio do servidor, única referência
  fim_tolerancia timestamptz;
  st     text;
  msg    text := '';
begin
  select * into a
    from public.assinaturas
   where loja_id = public.loja_do_usuario();

  if not found then
    return json_build_object(
      'status', 'bloqueado', 'plan', '',
      'message', 'Não encontramos uma assinatura para esta loja. Fale com o suporte.');
  end if;

  if a.status = 'cancelada' then
    st  := 'bloqueado';
    msg := 'Assinatura cancelada. Seus dados continuam guardados e podem ser exportados — fale com o suporte para reativar.';

  elsif a.status = 'trial' or a.pago_ate is null then
    if agora <= a.trial_fim then
      st  := 'trial';
      msg := 'Período de teste até ' || to_char(a.trial_fim, 'DD/MM/YYYY') || '.';
    else
      st  := 'bloqueado';
      msg := 'Seu período de teste terminou. Assine um plano para continuar usando o UltraERP.';
    end if;

  else
    fim_tolerancia := a.pago_ate + make_interval(days => a.tolerancia_dias);
    if agora <= a.pago_ate then
      st := 'ativo';
    elsif agora <= fim_tolerancia then
      st  := 'tolerancia';
      msg := 'Pagamento pendente. Regularize até ' || to_char(fim_tolerancia, 'DD/MM/YYYY')
             || ' para não perder acesso às funções do sistema.';
    elsif agora <= fim_tolerancia + interval '30 days' then
      st  := 'bloqueado_parcial';
      msg := 'Pagamento em atraso: emissão de notas e módulos avançados suspensos. Seus dados continuam disponíveis para consulta.';
    else
      st  := 'bloqueado';
      msg := 'Assinatura suspensa por falta de pagamento. Seus dados estão guardados em segurança — regularize para voltar a usar.';
    end if;
  end if;

  return json_build_object('status', st, 'plan', a.plano, 'message', msg);
end;
$$;

-- Apenas usuários autenticados podem consultar; anon não.
revoke all on function public.subscription_status() from public, anon;
grant execute on function public.subscription_status() to authenticated;
