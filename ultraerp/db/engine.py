"""Engine SQLAlchemy para o PostgreSQL em nuvem (Supabase).

O banco em nuvem é a fonte de verdade. O cache local (SQLite) virá em
etapa posterior e será apenas leitura/buffer, nunca fonte de verdade.
"""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ultraerp.config import settings

_engine = None
_session_factory: sessionmaker[Session] | None = None


def get_engine():
    global _engine
    if _engine is None:
        if not settings.database_url:
            raise RuntimeError(
                "DATABASE_URL não configurada. Copie .env.example para .env "
                "e preencha as credenciais do banco."
            )
        _engine = create_engine(settings.database_url, pool_pre_ping=True)
    return _engine


def get_session() -> Session:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(bind=get_engine())
    return _session_factory()
