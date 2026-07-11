-- UltraERP — Migração 0012: base da integração fiscal (NFC-e via Focus NFe)
-- Estrutura pronta para plugar as credenciais de homologação da Focus.
--
-- Princípios (especificação, seções 6, 13 e 14):
--   * O TOKEN da Focus e o CSC ficam só no servidor: a tabela de config NÃO
--     é lida pelo cliente. Uma Edge Function (service_role) emite; o app só
--     dispara e consulta o resultado.
--   * Cada nota é registrada (status, chave, protocolo, XML/DANFE) para o
--     prazo legal de 5 anos.
--   * Ambiente começa em 'homologacao' (teste, sem valor fiscal).

-- ---------------- Configuração fiscal por loja ----------------
create table if not exists public.configuracao_fiscal (
  loja_id             uuid primary key references public.lojas (id) default public.loja_do_usuario(),
  ambiente            text not null default 'homologacao' check (ambiente in ('homologacao','producao')),
  focus_token         text not null default '',   -- credencial da Focus (segredo)
  csc                 text not null default '',   -- Código de Segurança do Contribuinte (NFC-e)
  csc_id              text not null default '',
  serie_nfce          integer not null default 1,
  regime_tributario   integer not null default 1, -- 1=Simples, 2=Simples-excesso, 3=Normal
  inscricao_estadual  text not null default '',
  codigo_municipio    text not null default '',   -- IBGE (7 dígitos)
  logradouro          text not null default '',
  numero              text not null default '',
  bairro              text not null default '',
  cep                 text not null default '',
  telefone            text not null default '',
  cert_nome           text not null default '',   -- nome/apelido do certificado enviado à Focus
  cert_validade       date,                        -- vencimento do A1 (para alertas)
  atualizado_em       timestamptz not null default now()
);

-- RLS habilitada e SEM policies/grants para o cliente: ninguém lê o token
-- pela API. Só o service_role (Edge Function) e as RPCs security definer
-- abaixo acessam esta tabela.
alter table public.configuracao_fiscal enable row level security;
revoke all on public.configuracao_fiscal from anon, authenticated;

-- ---------------- Notas fiscais emitidas ----------------
create table if not exists public.notas_fiscais (
  id            uuid primary key default gen_random_uuid(),
  loja_id       uuid not null references public.lojas (id) default public.loja_do_usuario(),
  venda_id      uuid references public.vendas (id),
  modelo        text not null default '65',   -- 65 = NFC-e
  ambiente      text not null default 'homologacao',
  ref           text not null unique,          -- nossa referência enviada à Focus
  status        text not null default 'processando'
                check (status in ('processando','autorizada','rejeitada','cancelada','erro')),
  numero        integer,
  serie         integer,
  chave_acesso  text,
  protocolo     text,
  caminho_xml   text,
  caminho_danfe text,
  motivo        text not null default '',       -- motivo de rejeição/erro (amigável)
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_notas_loja on public.notas_fiscais (loja_id, criado_em desc);
create index if not exists idx_notas_venda on public.notas_fiscais (venda_id);

alter table public.notas_fiscais enable row level security;
grant select on public.notas_fiscais to authenticated;
revoke all on public.notas_fiscais from anon;

create policy notas_select on public.notas_fiscais
  for select to authenticated
  using (loja_id = public.loja_do_usuario());

-- ---------------- RPC: status da config (sem expor segredos) ----------------
create or replace function public.fiscal_config_status()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'configurado', (c.loja_id is not null and c.focus_token <> ''),
    'ambiente',    coalesce(c.ambiente, 'homologacao'),
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

revoke all on function public.fiscal_config_status() from public, anon;
grant execute on function public.fiscal_config_status() to authenticated;

-- ---------------- RPC: salvar config (upsert) ----------------
-- Recebe os campos (inclui o token) e grava para a loja do usuário. Como é
-- security definer, escreve mesmo sem grant de INSERT/UPDATE ao cliente.
-- Campos de segredo em branco NÃO sobrescrevem o valor já salvo (permite
-- editar endereço sem reenviar o token).
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
    loja_id, ambiente, focus_token, csc, csc_id, serie_nfce, regime_tributario,
    inscricao_estadual, codigo_municipio, logradouro, numero, bairro, cep, telefone,
    atualizado_em
  ) values (
    v_loja,
    coalesce(nullif(p->>'ambiente',''), 'homologacao'),
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
    -- segredos só mudam se vier valor novo (não apaga ao editar endereço)
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

revoke all on function public.fiscal_config_salvar(json) from public, anon;
grant execute on function public.fiscal_config_salvar(json) to authenticated;
