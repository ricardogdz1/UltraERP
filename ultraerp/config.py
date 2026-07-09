"""Configurações do UltraERP, carregadas de variáveis de ambiente (.env).

Nenhum segredo é hardcoded. Sem credenciais configuradas o app roda em
modo demonstração (interface funcional, sem banco), útil para desenvolver a UI.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
UI_DIR = BASE_DIR / "ui"

load_dotenv(BASE_DIR.parent / ".env")


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


settings = Settings()
