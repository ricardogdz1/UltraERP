"""Integração fiscal (NFC-e via Focus NFe).

O app NUNCA vê o token da Focus: a emissão passa por uma Edge Function que
roda com service_role. Aqui só disparamos e consultamos o resultado.
"""

from __future__ import annotations

import httpx

from ultraerp.config import settings


def _rest_headers(access_token: str) -> dict:
    return {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def status(access_token: str) -> dict:
    """Situação da configuração fiscal (sem expor o token)."""
    if settings.demo_mode:
        return {"configurado": False, "ambiente": "homologacao"}
    resp = httpx.post(
        f"{settings.supabase_url}/rest/v1/rpc/fiscal_config_status",
        json={}, headers=_rest_headers(access_token), timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def salvar_config(access_token: str, dados: dict) -> dict:
    resp = httpx.post(
        f"{settings.supabase_url}/rest/v1/rpc/fiscal_config_salvar",
        json={"p": dados}, headers=_rest_headers(access_token), timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def emitir(access_token: str, venda_id: str) -> dict:
    """Dispara a emissão da NFC-e da venda (via Edge Function)."""
    resp = httpx.post(
        f"{settings.supabase_url}/functions/v1/fiscal-emitir",
        json={"venda_id": venda_id},
        headers=_rest_headers(access_token), timeout=30,
    )
    # A função retorna 200 com {ok:false,...} para erros de negócio.
    resp.raise_for_status()
    return resp.json()


def nota_da_venda(access_token: str, venda_id: str) -> dict | None:
    """Nota fiscal registrada para uma venda (para acompanhar o status)."""
    if settings.demo_mode:
        return None
    resp = httpx.get(
        f"{settings.supabase_url}/rest/v1/notas_fiscais",
        params={"select": "status,numero,chave_acesso,caminho_danfe,motivo,ambiente",
                "venda_id": f"eq.{venda_id}", "order": "criado_em.desc", "limit": "1"},
        headers=_rest_headers(access_token), timeout=15,
    )
    resp.raise_for_status()
    dados = resp.json()
    return dados[0] if dados else None
