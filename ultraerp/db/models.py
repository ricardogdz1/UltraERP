"""Modelos iniciais (Fase 1).

Multi-tenant: tenant = Loja (CNPJ). Todas as tabelas de dados do lojista
carregam `loja_id` e serão protegidas por Row Level Security no Supabase
— a política RLS no servidor é a barreira real; o filtro no app é só
conveniência.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Loja(Base):
    """Tenant: uma loja (CNPJ). Uma conta pode ter várias lojas."""

    __tablename__ = "lojas"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    cnpj: Mapped[str] = mapped_column(String(14), unique=True, index=True)
    razao_social: Mapped[str] = mapped_column(String(255))
    nome_fantasia: Mapped[str] = mapped_column(String(255), default="")
    uf: Mapped[str] = mapped_column(String(2))
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Usuario(Base):
    """Usuário vinculado a uma loja. `auth_id` referencia o Supabase Auth."""

    __tablename__ = "usuarios"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    auth_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True)
    loja_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lojas.id"), index=True
    )
    nome: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), index=True)
    # Papéis padrão da especificação (seção 8); papéis customizados virão na Fase 2
    papel: Mapped[str] = mapped_column(String(50), default="administrador")
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
