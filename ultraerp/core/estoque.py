"""Acesso a dados do Estoque via PostgREST (API REST do Supabase).

Importante: as chamadas usam o JWT DO USUÁRIO (não a service key), então
as políticas RLS valem para cada requisição — o isolamento por loja é
garantido pelo servidor, não por filtro no app.

Em modo demonstração, opera sobre uma lista em memória para permitir
desenvolvimento da interface sem backend.
"""

from __future__ import annotations

import uuid

import httpx

from ultraerp.config import settings

PAGE_SIZE = 25

_ERRO_CONEXAO = (
    "Não foi possível falar com o servidor. "
    "Verifique sua internet e tente novamente."
)


def _headers(access_token: str) -> dict:
    return {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def _url(path: str) -> str:
    return f"{settings.supabase_url}/rest/v1/{path}"


# ---------------- modo demonstração ----------------

_demo: list[dict] = [
    {
        "id": str(uuid.uuid4()), "nome": "Camiseta Básica Branca M",
        "ean": "7891234567895", "ncm": "61091000", "unidade": "UN",
        "preco_custo": 18.0, "preco_venda": 49.9,
        "estoque_atual": 12, "estoque_minimo": 5, "ativo": True,
    },
    {
        "id": str(uuid.uuid4()), "nome": "Calça Jeans Slim 42",
        "ean": "", "ncm": "62034200", "unidade": "UN",
        "preco_custo": 55.0, "preco_venda": 149.9,
        "estoque_atual": 2, "estoque_minimo": 4, "ativo": True,
    },
]


# ---------------- operações ----------------

def _demo_baixo(p: dict) -> bool:
    return float(p["estoque_atual"]) <= float(p["estoque_minimo"])


def listar(access_token: str, pagina: int = 1, busca: str = "",
           so_baixo: bool = False) -> dict:
    """Lista paginada de produtos ativos. Retorna {itens, total, pagina}.

    `so_baixo=True` restringe aos produtos no/abaixo do estoque mínimo
    (visão de ruptura). A sinalização vem da view vw_produtos, que já
    respeita a RLS por loja (security_invoker).
    """
    if settings.demo_mode:
        itens = [p for p in _demo if p["ativo"]]
        if busca:
            itens = [p for p in itens if busca.lower() in p["nome"].lower()
                     or busca == p["ean"]]
        if so_baixo:
            itens = [p for p in itens if _demo_baixo(p)]
        for p in itens:
            p["abaixo_minimo"] = _demo_baixo(p)
        itens.sort(key=lambda p: p["nome"].lower())
        return {"itens": itens[(pagina - 1) * PAGE_SIZE: pagina * PAGE_SIZE],
                "total": len(itens), "pagina": pagina}

    params = {
        "select": "*",
        "ativo": "eq.true",
        "order": "nome.asc",
        "limit": str(PAGE_SIZE),
        "offset": str((pagina - 1) * PAGE_SIZE),
    }
    if busca:
        # busca por nome (parcial) ou EAN exato
        params["or"] = f"(nome.ilike.*{busca}*,ean.eq.{busca})"
    if so_baixo:
        params["abaixo_minimo"] = "eq.true"

    # Lê da view (traz o booleano abaixo_minimo); escrita continua em produtos.
    resp = httpx.get(
        _url("vw_produtos"), params=params,
        headers={**_headers(access_token), "Prefer": "count=exact"},
        timeout=15,
    )
    resp.raise_for_status()
    total = int(resp.headers.get("content-range", "0/0").split("/")[-1] or 0)
    return {"itens": resp.json(), "total": total, "pagina": pagina}


def resumo(access_token: str) -> dict:
    """KPIs do estoque: total, quantos abaixo do mínimo, valor em custo/venda."""
    if settings.demo_mode:
        ativos = [p for p in _demo if p["ativo"]]
        return {
            "total": len(ativos),
            "abaixo_minimo": sum(1 for p in ativos if _demo_baixo(p)),
            "valor_custo": sum(p["preco_custo"] * p["estoque_atual"] for p in ativos),
            "valor_venda": sum(p["preco_venda"] * p["estoque_atual"] for p in ativos),
        }
    resp = httpx.post(_url("rpc/estoque_resumo"), json={},
                      headers=_headers(access_token), timeout=15)
    resp.raise_for_status()
    return resp.json()


def movimentos(access_token: str, produto_id: str, pagina: int = 1) -> dict:
    """Histórico de entradas/saídas/ajustes de um produto (mais recentes primeiro)."""
    if settings.demo_mode:
        return {"itens": [], "total": 0, "pagina": pagina}
    params = {
        "select": "id,tipo,quantidade,motivo,criado_em,usuarios(nome)",
        "produto_id": f"eq.{produto_id}",
        "order": "criado_em.desc",
        "limit": str(PAGE_SIZE),
        "offset": str((pagina - 1) * PAGE_SIZE),
    }
    resp = httpx.get(
        _url("estoque_movimentos"), params=params,
        headers={**_headers(access_token), "Prefer": "count=exact"},
        timeout=15,
    )
    resp.raise_for_status()
    total = int(resp.headers.get("content-range", "0/0").split("/")[-1] or 0)
    return {"itens": resp.json(), "total": total, "pagina": pagina}


def salvar(access_token: str, produto: dict) -> dict:
    """Cria (sem id) ou atualiza (com id) um produto. Retorna o registro."""
    campos = {
        "nome": (produto.get("nome") or "").strip(),
        "ean": (produto.get("ean") or "").strip(),
        "ncm": (produto.get("ncm") or "").strip(),
        "unidade": (produto.get("unidade") or "UN").strip() or "UN",
        "preco_custo": float(produto.get("preco_custo") or 0),
        "preco_venda": float(produto.get("preco_venda") or 0),
        "estoque_minimo": float(produto.get("estoque_minimo") or 0),
    }
    prod_id = produto.get("id")

    if settings.demo_mode:
        if prod_id:
            for p in _demo:
                if p["id"] == prod_id:
                    p.update(campos)
                    return p
            raise LookupError("Produto não encontrado. Atualize a lista.")
        novo = {"id": str(uuid.uuid4()), "estoque_atual": 0, "ativo": True, **campos}
        _demo.append(novo)
        return novo

    headers = {**_headers(access_token), "Prefer": "return=representation"}
    if prod_id:
        resp = httpx.patch(_url("produtos"), params={"id": f"eq.{prod_id}"},
                           json=campos, headers=headers, timeout=15)
    else:
        resp = httpx.post(_url("produtos"), json=campos, headers=headers, timeout=15)
    resp.raise_for_status()
    dados = resp.json()
    if not dados:
        raise LookupError("Produto não encontrado. Atualize a lista.")
    return dados[0]


def desativar(access_token: str, produto_id: str) -> None:
    """Exclusão lógica — o histórico de movimentos permanece."""
    if settings.demo_mode:
        for p in _demo:
            if p["id"] == produto_id:
                p["ativo"] = False
        return
    resp = httpx.patch(
        _url("produtos"), params={"id": f"eq.{produto_id}"},
        json={"ativo": False}, headers=_headers(access_token), timeout=15,
    )
    resp.raise_for_status()


def ajustar(access_token: str, produto_id: str, quantidade: float, motivo: str) -> dict:
    """Ajuste atômico via RPC (saldo + movimento na mesma transação)."""
    if settings.demo_mode:
        for p in _demo:
            if p["id"] == produto_id:
                novo = p["estoque_atual"] + quantidade
                if novo < 0:
                    return {"ok": False,
                            "error": "Essa saída deixaria o estoque negativo. Confira a quantidade."}
                p["estoque_atual"] = novo
                return {"ok": True, "estoque_atual": novo}
        return {"ok": False, "error": "Produto não encontrado. Atualize a lista."}

    resp = httpx.post(
        _url("rpc/estoque_ajustar"),
        json={"p_produto_id": produto_id, "p_quantidade": quantidade,
              "p_motivo": motivo or ""},
        headers=_headers(access_token), timeout=15,
    )
    resp.raise_for_status()
    return resp.json()
