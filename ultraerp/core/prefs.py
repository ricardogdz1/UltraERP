"""Preferências locais NÃO sensíveis do app (por usuário do SO).

Guarda: último e-mail, flags de "lembrar e-mail/senha" e tema claro/escuro.
Fica num arquivo JSON na pasta de dados do usuário — persiste entre
execuções e independe do WebView (que roda em modo privado e descarta o
localStorage). NADA sensível aqui: a senha continua no cofre do SO
(core/credentials.py) e o token de sessão só existe em memória.
"""

from __future__ import annotations

import json

from ultraerp.config import settings

_PATH = settings.data_dir / "prefs.json"


def load() -> dict:
    try:
        return json.loads(_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save(updates: dict) -> None:
    """Mescla `updates` nas preferências existentes e grava."""
    dados = load()
    dados.update(updates or {})
    try:
        _PATH.parent.mkdir(parents=True, exist_ok=True)
        _PATH.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass  # preferência é conveniência; falhar ao gravar não quebra o app
