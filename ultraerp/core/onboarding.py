"""Onboarding: cria a loja e vincula o usuário como administrador.

Chama a RPC `onboarding_criar_loja` (migração 0006), que faz tudo numa
transação no servidor — inclusive a validação de CNPJ com dígito
verificador. O app só monta o payload e traduz o retorno.
"""

from __future__ import annotations

import httpx

from ultraerp.config import settings


def criar_loja(access_token: str, dados: dict) -> dict:
    """Retorna {'ok': True, 'loja_id': ...} ou {'ok': False, 'error': ...}."""
    if settings.demo_mode:
        return {"ok": True, "loja_id": "demo-loja"}

    resp = httpx.post(
        f"{settings.supabase_url}/rest/v1/rpc/onboarding_criar_loja",
        json={
            "p_cnpj": (dados.get("cnpj") or "").strip(),
            "p_razao_social": (dados.get("razao_social") or "").strip(),
            "p_uf": (dados.get("uf") or "").strip().upper(),
            "p_nome_usuario": (dados.get("nome_usuario") or "").strip(),
            "p_nome_fantasia": (dados.get("nome_fantasia") or "").strip(),
        },
        headers={
            "apikey": settings.supabase_anon_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()
