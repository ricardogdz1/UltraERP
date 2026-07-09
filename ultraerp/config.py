"""Configurações do UltraERP, carregadas de variáveis de ambiente (.env).

Nenhum segredo é hardcoded. Sem credenciais configuradas o app roda em
modo demonstração (interface funcional, sem banco), útil para desenvolver a UI.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
UI_DIR = BASE_DIR / "ui"

load_dotenv(BASE_DIR.parent / ".env")


def _user_data_dir() -> Path:
    """Pasta de dados do app por usuário do SO (padrão de cada plataforma)."""
    if sys.platform == "win32":
        base = os.getenv("LOCALAPPDATA") or os.getenv("APPDATA") or str(Path.home())
    elif sys.platform == "darwin":
        base = str(Path.home() / "Library" / "Application Support")
    else:
        base = os.getenv("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base) / "UltraERP"


@dataclass(frozen=True)
class Settings:
    supabase_url: str = field(default_factory=lambda: os.getenv("SUPABASE_URL", ""))
    supabase_anon_key: str = field(default_factory=lambda: os.getenv("SUPABASE_ANON_KEY", ""))
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", ""))
    debug: bool = field(default_factory=lambda: os.getenv("ULTRAERP_DEBUG", "false").lower() == "true")

    @property
    def demo_mode(self) -> bool:
        """Sem credenciais → modo demonstração (nunca usar em produção)."""
        return not (self.supabase_url and self.supabase_anon_key)

    @property
    def data_dir(self) -> Path:
        """Pasta de dados do app por usuário do SO (preferências etc.)."""
        return _user_data_dir()


settings = Settings()
