"""Dashboard: KPIs consolidados do dia via RPC dashboard_resumo."""

from __future__ import annotations

import httpx

from ultraerp.config import settings


def resumo(access_token: str) -> dict:
    if settings.demo_mode:
        return {
            "vendas_hoje_qtd": 0, "vendas_hoje_total": 0, "ticket_medio": 0,
            "vendas_mes": 0, "serie_7dias": [], "a_receber": 0, "a_pagar": 0,
            "vencidos": 0, "produtos_total": 0, "abaixo_minimo": 0,
        }
    resp = httpx.post(
        f"{settings.supabase_url}/rest/v1/rpc/dashboard_resumo",
        json={},
        headers={
            "apikey": settings.supabase_anon_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()
