-- UltraERP — Migração 0006: RPC de onboarding
-- Cria loja + vincula o usuário autenticado como administrador + inicia o
-- trial, numa única transação. Chamada pelo app logo após o primeiro signup.
-- Criação de loja pelo cliente só é possível por esta RPC — a tabela lojas
-- não tem policy de INSERT (migração 0002).

-- Validação de CNPJ com dígito verificador, no servidor (especificação,
-- seção 9: nunca confiar só no front-end).
create or replace function public.cnpj_valido(p_cnpj text)
returns boolean
language plpgsql immutable
set search_path = public
as $$
declare
  d   int[];
  soma int;
  dv1 int;
  dv2 int;
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  i int;
begin
  if p_cnpj !~ '^[0-9]{14}$' then
    return false;
  end if;
  -- CNPJs com todos os dígitos iguais passam no cálculo, mas são inválidos
  if p_cnpj ~ '^(\d)\1{13}$' then
    return false;
  end if;

  select array_agg(substr(p_cnpj, g, 1)::int order by g)
    into d from generate_series(1, 14) g;

  soma := 0;
  for i in 1..12 loop
    soma := soma + d[i] * pesos1[i];
  end loop;
  dv1 := 11 - (soma % 11);
  if dv1 >= 10 then dv1 := 0; end if;

  soma := 0;
  for i in 1..13 loop
    soma := soma + d[i] * pesos2[i];
  end loop;
  dv2 := 11 - (soma % 11);
  if dv2 >= 10 then dv2 := 0; end if;

  return d[13] = dv1 and d[14] = dv2;
end;
$$;

create or replace function public.onboarding_criar_loja(
  p_cnpj          text,
  p_razao_social  text,
  p_uf            text,
  p_nome_usuario  text,
  p_nome_fantasia text default ''
)
returns json
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_auth  uuid := auth.uid();
  v_email text;
  v_cnpj  text := regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
  v_loja  uuid;
begin
  if v_auth is null then
    return json_build_object('ok', false,
      'error', 'Sessão expirada. Entre novamente para continuar.');
  end if;

  if exists (select 1 from public.usuarios where auth_id = v_auth) then
    return json_build_object('ok', false,
      'error', 'Este usuário já está vinculado a uma loja.');
  end if;

  if not public.cnpj_valido(v_cnpj) then
    return json_build_object('ok', false,
      'error', 'CNPJ inválido — confira os dígitos e tente de novo.');
  end if;

  if length(trim(coalesce(p_razao_social, ''))) < 2 then
    return json_build_object('ok', false,
      'error', 'Informe a razão social da loja.');
  end if;

  if upper(coalesce(p_uf, '')) !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$' then
    return json_build_object('ok', false,
      'error', 'UF inválida — use a sigla do estado, por exemplo SP.');
  end if;

  if length(trim(coalesce(p_nome_usuario, ''))) < 2 then
    return json_build_object('ok', false,
      'error', 'Informe o seu nome.');
  end if;

  select email into v_email from auth.users where id = v_auth;

  begin
    insert into public.lojas (cnpj, razao_social, nome_fantasia, uf)
    values (v_cnpj, trim(p_razao_social), coalesce(trim(p_nome_fantasia), ''), upper(p_uf))
    returning id into v_loja;
  exception
    when unique_violation then
      return json_build_object('ok', false,
        'error', 'Já existe uma loja cadastrada com este CNPJ. Se ela é sua, peça um convite ao administrador.');
  end;

  insert into public.usuarios (auth_id, loja_id, nome, email, papel)
  values (v_auth, v_loja, trim(p_nome_usuario), coalesce(v_email, ''), 'administrador');

  insert into public.assinaturas (loja_id) values (v_loja);  -- trial de 14 dias

  return json_build_object('ok', true, 'loja_id', v_loja);
end;
$$;

revoke all on function public.cnpj_valido(text) from public, anon;
grant execute on function public.cnpj_valido(text) to authenticated;
revoke all on function public.onboarding_criar_loja(text, text, text, text, text) from public, anon;
grant execute on function public.onboarding_criar_loja(text, text, text, text, text) to authenticated;
