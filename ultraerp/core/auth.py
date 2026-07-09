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


def signup(email: str, password: str) -> Session:
    """Cria a conta no Supabase Auth e já retorna a sessão.

    Requer *Confirm email* desativado (Fase 1): assim o signup devolve o
    access_token na hora e o usuário entra direto após o onboarding.
    """
    if settings.demo_mode:
        return Session("demo", "demo", "demo-user", email or "demo@ultraerp.local")

    try:
        resp = httpx.post(
            f"{settings.supabase_url}/auth/v1/signup",
            headers={"apikey": settings.supabase_anon_key},
            json={"email": email, "password": password},
            timeout=15,
        )
    except httpx.HTTPError as exc:
        raise AuthError(
            "Não foi possível conectar ao servidor. "
            "Verifique sua internet e tente novamente."
        ) from exc

    if resp.status_code in (400, 422):
        msg = ""
        try:
            corpo = resp.json()
            msg = str(corpo.get("msg") or corpo.get("error_description") or corpo.get("error") or "").lower()
        except ValueError:
            pass
        if any(t in msg for t in ("already", "registered", "exists")):
            raise AuthError("Este e-mail já está cadastrado. Faça login ou use outro e-mail.")
        if "password" in msg:
            raise AuthError("Senha muito curta ou fraca — use pelo menos 6 caracteres.")
        raise AuthError("Não foi possível criar a conta. Confira os dados e tente novamente.")
    if resp.status_code not in (200, 201):
        raise AuthError(
            "O servidor não respondeu como esperado. "
            "Tente novamente em alguns minutos."
        )

    data = resp.json()
    token = data.get("access_token")
    if not token:
        # Só cai aqui se *Confirm email* estiver ligado no projeto.
        raise AuthError(
            "Conta criada! Confirme seu e-mail pelo link que enviamos antes de entrar."
        )
    return Session(
        access_token=token,
        refresh_token=data.get("refresh_token", ""),
        user_id=data["user"]["id"],
        email=data["user"]["email"],
    )
