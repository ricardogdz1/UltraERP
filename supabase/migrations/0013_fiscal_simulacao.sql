-- UltraERP — Migração 0013: modo simulação fiscal
-- Permite testar TODO o fluxo de emissão de NFC-e sem token/CNPJ/certificado:
-- a Edge Function gera uma nota "autorizada" fictícia, marcada como
-- SIMULAÇÃO (sem valor fiscal). Ao ter o token real, basta desligar.

alter table public.configuracao_fiscal
  add column if not exists modo_simulacao boolean not null default false;

-- Status passa a informar o modo simulação e considera 'configurado' quando
-- há token OU quando a simulação está ligada (dá para emitir simulado).
create or replace function public.fiscal_config_status()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'configurado', (c.loja_id is not null and (c.focus_token <> '' or coalesce(c.modo_simulacao, false))),
    'ambiente',    coalesce(c.ambiente, 'homologacao'),
    'modo_simulacao', coalesce(c.modo_simulacao, false),
    'tem_token',   coalesce(c.focus_token <> '', false),
    'tem_csc',     coalesce(c.csc <> '', false),
    'cert_nome',   coalesce(c.cert_nome, ''),
    'cert_validade', c.cert_validade,
    'inscricao_estadual', coalesce(c.inscricao_estadual, ''),
    'serie_nfce',  coalesce(c.serie_nfce, 1),
    'regime_tributario', coalesce(c.regime_tributario, 1)
  )
  from (select public.loja_do_usuario() as loja) base
  left join public.configuracao_fiscal c on c.loja_id = base.loja;
$$;

-- Salvar passa a aceitar o campo modo_simulacao.
create or replace function public.fiscal_config_salvar(p json)
returns json
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_loja uuid := public.loja_do_usuario();
begin
  if v_loja is null then
    return json_build_object('ok', false, 'error', 'Sessão expirada. Entre novamente.');
  end if;

  insert into public.configuracao_fiscal as c (
    loja_id, ambiente, modo_simulacao, focus_token, csc, csc_id, serie_nfce,
    regime_tributario, inscricao_estadual, codigo_municipio, logradouro, numero,
    bairro, cep, telefone, atualizado_em
  ) values (
    v_loja,
    coalesce(nullif(p->>'ambiente',''), 'homologacao'),
    coalesce((p->>'modo_simulacao')::boolean, false),
    coalesce(p->>'focus_token',''),
    coalesce(p->>'csc',''),
    coalesce(p->>'csc_id',''),
    coalesce((p->>'serie_nfce')::int, 1),
    coalesce((p->>'regime_tributario')::int, 1),
    coalesce(p->>'inscricao_estadual',''),
    coalesce(p->>'codigo_municipio',''),
    coalesce(p->>'logradouro',''),
    coalesce(p->>'numero',''),
    coalesce(p->>'bairro',''),
    coalesce(p->>'cep',''),
    coalesce(p->>'telefone',''),
    now()
  )
  on conflict (loja_id) do update set
    ambiente = coalesce(nullif(p->>'ambiente',''), c.ambiente),
    modo_simulacao = coalesce((p->>'modo_simulacao')::boolean, c.modo_simulacao),
    focus_token = case when coalesce(p->>'focus_token','') <> '' then p->>'focus_token' else c.focus_token end,
    csc = case when coalesce(p->>'csc','') <> '' then p->>'csc' else c.csc end,
    csc_id = coalesce(nullif(p->>'csc_id',''), c.csc_id),
    serie_nfce = coalesce((p->>'serie_nfce')::int, c.serie_nfce),
    regime_tributario = coalesce((p->>'regime_tributario')::int, c.regime_tributario),
    inscricao_estadual = coalesce(p->>'inscricao_estadual', c.inscricao_estadual),
    codigo_municipio = coalesce(p->>'codigo_municipio', c.codigo_municipio),
    logradouro = coalesce(p->>'logradouro', c.logradouro),
    numero = coalesce(p->>'numero', c.numero),
    bairro = coalesce(p->>'bairro', c.bairro),
    cep = coalesce(p->>'cep', c.cep),
    telefone = coalesce(p->>'telefone', c.telefone),
    atualizado_em = now();

  return json_build_object('ok', true);
end;
$$;
