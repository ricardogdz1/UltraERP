"""Credenciais lembradas no LOGIN ("Lembrar senha").

Regra da especificação (seção 13): nenhum segredo em arquivo local de
texto puro. A senha lembrada fica no cofre nativo do sistema operacional
via `keyring` — Windows Credential Manager, macOS Keychain ou Secret
Service/libsecret no Linux — cifrada pelo próprio SO e atrelada ao
usuário logado na máquina.

Isso NÃO substitui a validação no servidor: a senha lembrada apenas
preenche o formulário; o login continua sendo autenticado no Supabase.
"""

from __future__ import annotations

SERVICE = "UltraERP"


class CredentialError(Exception):
    """Erro amigável quando o cofre do SO não está disponível."""


def _keyring():
    try:
        import keyring
        return keyring
    except ImportError as exc:
        raise CredentialError(
            "Recurso de lembrar senha indisponível nesta instalação."
        ) from exc


def save_password(email: str, password: str) -> None:
    try:
        _keyring().set_password(SERVICE, email, password)
    except CredentialError:
        raise
    except Exception as exc:
        raise CredentialError(
            "Não foi possível guardar a senha no cofre do sistema. "
            "Você ainda pode entrar normalmente digitando a senha."
        ) from exc


def get_password(email: str) -> str | None:
    try:
        return _keyring().get_password(SERVICE, email)
    except Exception:
        return None


def delete_password(email: str) -> None:
    try:
        _keyring().delete_password(SERVICE, email)
    except Exception:
        pass  # não existia ou cofre indisponível — nada a fazer
