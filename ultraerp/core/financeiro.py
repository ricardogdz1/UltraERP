"""Fluxo de Caixa: contas a pagar e a receber (lançamentos).

Leitura via PostgREST (RLS por loja) e escrita de baixa via RPC
(financeiro_baixar, que usa o relógio do servidor). O resumo (KPIs) vem
da RPC financeiro_resumo.
"""

from __future__ import annotations

import httpx

from ultraerp.config import settings
from ultraerp.core.util import to_number

PAGE_SIZE = 25

_demo: list[dict] = []


def _headers(access_token: str) -> dict:
    return {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def _url(path: str) -> str:
    return f"{settings.supabase_url}/rest/v1/{path}"


def listar(access_token: str, tipo: str = "", situacao: str = "", pagina: int = 1) -> dict:
    """Lista lançamentos. tipo: ''|'receber'|'pagar'; situacao: ''|'pendente'|'pago'."""
    if settings.demo_mode:
        return {"itens": [], "total": 0, "pagina": pagina}

    params = {
        "select": "*",
        # pendentes primeiro, depois por vencimento
        "order": "pago.asc,vencimento.asc",
        "limit": str(PAGE_SIZE),
        "offset": str((pagina - 1) * PAGE_SIZE),
    }
    if tipo in ("receber", "pagar"):
        params["tipo"] = f"eq.{tipo}"
    if situacao == "pendente":
        params["pago"] = "eq.false"
    elif situacao == "pago":
        params["pago"] = "eq.true"

    resp = httpx.get(
        _url("lancamentos"), params=params,
        headers={**_headers(access_token), "Prefer": "count=exact"},
        timeout=15,
    )
    resp.raise_for_status()
    total = int(resp.headers.get("content-range", "0/0").split("/")[-1] or 0)
    return {"itens": resp.json(), "total": total, "pagina": pagina}


def salvar(access_token: str, lanc: dict) -> dict:
    """Cria (sem id) ou edita (com id) um lançamento manual. Retorna o registro."""
    campos = {
        "tipo": lanc.get("tipo"),
        "descricao": (lanc.get("descricao") or "").strip(),
        "categoria": (lanc.get("categoria") or "").strip(),
        "valor": to_number(lanc.get("valor") or 0),
        "vencimento": lanc.get("vencimento") or None,
    }
    lanc_id = lanc.get("id")
    headers = {**_headers(access_token), "Prefer": "return=representation"}
    if lanc_id:
        resp = httpx.patch(_url("lancamentos"), params={"id": f"eq.{lanc_id}"},
                           json=campos, headers=headers, timeout=15)
    else:
        resp = httpx.post(_url("lancamentos"), json=campos, headers=headers, timeout=15)
    resp.raise_for_status()
    dados = resp.json()
    if not dados:
        raise LookupError("Lançamento não encontrado. Atualize a lista.")
    return dados[0]


def baixar(access_token: str, lanc_id: str, pago: bool) -> dict:
    """Marca pago/não pago via RPC (pago_em usa o relógio do servidor)."""
    resp = httpx.post(
        _url("rpc/financeiro_baixar"),
        json={"p_id": lanc_id, "p_pago": pago},
        headers=_headers(access_token), timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def excluir(access_token: str, lanc_id: str) -> None:
    """Exclui um lançamento manual (a RLS impede excluir os vindos do PDV)."""
    resp = httpx.delete(
        _url("lancamentos"), params={"id": f"eq.{lanc_id}"},
        headers=_headers(access_token), timeout=15,
    )
    resp.raise_for_status()


def resumo(access_token: str) -> dict:
    """KPIs: a receber, a pagar, recebido/pago no mês, vencidos."""
    resp = httpx.post(_url("rpc/financeiro_resumo"), json={},
                      headers=_headers(access_token), timeout=15)
    resp.raise_for_status()
    return resp.json()
