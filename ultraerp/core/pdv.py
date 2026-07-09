"""PDV: finalização de venda via RPC atômica (pdv_finalizar_venda).

A RPC cria a venda, seus itens e dá baixa no estoque numa única transação —
o app só monta o payload e traduz o retorno. A busca de produtos do PDV
reaproveita o módulo de estoque (core/estoque.listar).
"""

from __future__ import annotations

import httpx

from ultraerp.config import settings


def finalizar(access_token: str, itens: list[dict], forma: str,
              valor_recebido: float | None = None) -> dict:
    """Retorna {'ok': True, 'venda_id', 'total', 'troco'} ou {'ok': False, 'error'}."""
    if settings.demo_mode:
        total = sum(float(i.get("preco", 0)) * float(i.get("quantidade", 0)) for i in itens)
        troco = max((valor_recebido or 0) - total, 0) if forma == "dinheiro" else 0
        return {"ok": True, "venda_id": "demo", "total": total, "troco": troco}

    payload = {
        "p_itens": [
            {"produto_id": i["produto_id"], "quantidade": i["quantidade"]}
            for i in itens
        ],
        "p_forma": forma,
        "p_valor_recebido": valor_recebido,
    }
    resp = httpx.post(
        f"{settings.supabase_url}/rest/v1/rpc/pdv_finalizar_venda",
        json=payload,
        headers={
            "apikey": settings.supabase_anon_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()
