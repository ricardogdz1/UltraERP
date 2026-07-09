"""Autenticação via Supabase Auth (GoTrue).

A sessão vive apenas em memória durante a execução — nenhum token é
persistido em disco. Em modo demonstração, aceita qualquer login para
permitir desenvolvimento da interface sem backend.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from ultraerp.config import settings


@dataclass
class Session:
    access_token: str
    refresh_token: str
    user_id: str
    email: str


class AuthError(Exception):
    """Erro de autenticação com mensagem amigável para o lojista."""


def login(email: str, password: str) -> Session:
    if settings.demo_mode:
        return Session(
            access_token="demo",
            refresh_token="demo",
            user_id="demo-user",
            email=email or "demo@ultraerp.local",
        )

    try:
        resp = httpx.post(
            f"{settings.supabase_url}/auth/v1/token",
            params={"grant_type": "password"},
            headers={"apikey": settings.supabase_anon_key},
            json={"email": email, "password": password},
            timeout=15,
        )
    except httpx.HTTPError as exc:
        raise AuthError(
            "Não foi possível conectar ao servidor. "
            "Verifique sua internet e tente novamente."
        ) from exc

    if resp.status_code == 400:
        raise AuthError("E-mail ou senha incorretos. Confira e tente de novo.")
    if resp.status_code != 200:
        raise AuthError(
            "O servidor não respondeu como esperado. "
            "Tente novamente em alguns minutos."
        )

    data = resp.json()
    return Session(
        access_token=data["access_token"],
        refresh_token=data["refresh_token"],
        user_id=data["user"]["id"],
        email=data["user"]["email"],
    )
